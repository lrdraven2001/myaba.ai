package ai.myaba.service;

import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Policy Retrieval-Augmented Generation (RAG) service.
 *
 * Strategy:
 * - Total policy text ≤ FULL_TEXT_THRESHOLD chars → include verbatim in system prompt.
 * - Total policy text > threshold → chunk each policy, score by query keyword overlap
 *   (BM25-style), return top-N chunks.
 *
 * Production upgrade path: replace the keyword scorer with a call to
 * Vertex AI Vector Search (or any embedding API) by swapping the
 * {@link #scoreChunks} method.  Everything else stays the same.
 *
 * Firestore paths:
 *   organizations/{orgId}/policyChunks/{chunkId}
 */
@Service
@Slf4j
public class PolicyRagService {

    /** If total policy chars exceeds this, fall back to RAG retrieval. */
    private static final int FULL_TEXT_THRESHOLD = 8_000;
    private static final int CHUNK_SIZE          = 600;  // chars per chunk (approx 150 tokens)
    private static final int CHUNK_OVERLAP        = 100;  // overlap between adjacent chunks
    private static final int MAX_CHUNKS_RETURNED  = 5;
    private static final int MAX_GROUNDING_SOURCES = 8;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    // In-memory chunk store: orgId → policyId → chunks
    private final Map<String, Map<String, List<PolicyChunk>>> devChunks = new ConcurrentHashMap<>();

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Index a policy by chunking its text and storing the chunks.
     * Called by {@link PolicyService} on create/update.
     */
    public void indexPolicy(String orgId, String policyId, String policyTitle, String text) {
        List<PolicyChunk> chunks = chunkText(policyId, policyTitle, text);
        if (devMode) {
            devChunks.computeIfAbsent(orgId, k -> new ConcurrentHashMap<>())
                     .put(policyId, chunks);
            log.debug("Indexed {} chunks for policy {} (dev)", chunks.size(), policyId);
            return;
        }
        // Firestore: delete old chunks for this policy, write new ones
        try {
            Firestore db = FirestoreClient.getFirestore();
            var colRef = db.collection("organizations").document(orgId)
                           .collection("policyChunks");

            // Delete existing chunks for this policyId
            var old = colRef.whereEqualTo("policyId", policyId).get().get().getDocuments();
            for (var doc : old) doc.getReference().delete();

            // Write new chunks
            for (PolicyChunk c : chunks) {
                Map<String, Object> data = new HashMap<>();
                data.put("policyId",    c.policyId());
                data.put("policyTitle", c.policyTitle());
                data.put("chunkIndex",  c.index());
                data.put("text",        c.text());
                data.put("keywords",    new ArrayList<>(c.keywords()));
                data.put("indexedAt",   Instant.now().toString());
                colRef.add(data).get();
            }
        } catch (Exception e) {
            log.warn("Failed to store policy chunks for {}: {}", policyId, e.getMessage());
        }
    }

    /**
     * Remove all chunks for a deleted policy.
     */
    public void removePolicy(String orgId, String policyId) {
        if (devMode) {
            Map<String, List<PolicyChunk>> org = devChunks.get(orgId);
            if (org != null) org.remove(policyId);
            return;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            var docs = db.collection("organizations").document(orgId)
                         .collection("policyChunks")
                         .whereEqualTo("policyId", policyId)
                         .get().get().getDocuments();
            for (var doc : docs) doc.getReference().delete();
        } catch (Exception e) {
            log.warn("Failed to remove policy chunks for {}: {}", policyId, e.getMessage());
        }
    }

    /**
     * Build the policy section of a Claude system prompt.
     *
     * <ul>
     *   <li>If the combined text of all requested policies is short enough, returns
     *       the full text of each.</li>
     *   <li>Otherwise, returns the top-N most relevant chunks ranked by keyword
     *       overlap with the {@code query}.</li>
     * </ul>
     *
     * Returns an empty string when {@code policyIds} is null or empty.
     */
    public String buildSystemContext(String query,
                                      List<String> policyIds,
                                      String orgId,
                                      PolicyService policyService) {
        if (policyIds == null || policyIds.isEmpty()) return "";

        try {
            // Fetch full policy texts
            List<Map<String, Object>> policies = policyService.getPoliciesForContext(orgId, policyIds);
            if (policies.isEmpty()) return "";

            // Measure total text length
            int totalChars = policies.stream()
                    .mapToInt(p -> ((String) p.getOrDefault("textContent", "")).length())
                    .sum();

            String context;
            if (totalChars <= FULL_TEXT_THRESHOLD) {
                context = buildFullTextContext(policies);
            } else {
                context = buildRagContext(query, policyIds, orgId, policies);
            }

            return context.isBlank() ? "" :
                    "\n\n---\nORGANIZATIONAL POLICIES IN EFFECT FOR THIS CHAT:\n" + context +
                    "\n---\nAdhere to the above organizational policies in all responses.\n";

        } catch (Exception e) {
            log.warn("Failed to build policy system context: {}", e.getMessage());
            return "";
        }
    }

    /**
     * Build a list of grounding sources from the org's GROUNDING-tagged resource library.
     * These sources are passed to ACLX's /evaluate endpoint so the groundedness
     * detector can compare AI output against the org's actual documents.
     *
     * Returns the top-N most query-relevant chunks from all active GROUNDING resources.
     * When no GROUNDING resources exist, returns an empty list so ACLX skips groundedness checking.
     *
     * @param query         the AI prompt or output used for relevance ranking
     * @param orgId         organisation whose library to search
     * @param clientId      optional client ID for client-scoped resources
     * @param policyService injected to fetch documents (avoids circular dependency)
     * @return up to MAX_GROUNDING_SOURCES ranked source chunks
     */
    public List<ai.myaba.model.dto.AclxRequest.Source> buildGroundingSources(
            String query,
            String orgId,
            String clientId,
            PolicyService policyService) {

        try {
            List<Map<String, Object>> groundingDocs =
                    policyService.getResourcesByPurpose(orgId, "GROUNDING", clientId);
            if (groundingDocs.isEmpty()) return List.of();

            String effectiveQuery = (query != null ? query : "");
            Set<String> queryTerms = extractKeywords(effectiveQuery.toLowerCase());

            List<ScoredChunk> candidates = new ArrayList<>();
            for (Map<String, Object> doc : groundingDocs) {
                String pid   = (String) doc.get("id");
                String title = (String) doc.getOrDefault("title", "Resource");
                String text  = (String) doc.getOrDefault("textContent", "");
                if (text == null || text.isBlank()) continue;
                ensureIndexed(orgId, pid, title, text);
                for (PolicyChunk chunk : getChunks(orgId, pid)) {
                    double score = scoreChunks(queryTerms, chunk.keywords());
                    candidates.add(new ScoredChunk(chunk, score));
                }
            }

            candidates.sort(Comparator.comparingDouble(ScoredChunk::score).reversed());

            return candidates.stream()
                    .limit(MAX_GROUNDING_SOURCES)
                    .map(sc -> ai.myaba.model.dto.AclxRequest.Source.builder()
                            .id(orgId + "/" + sc.chunk().policyId() + "/" + sc.chunk().index())
                            .label(sc.chunk().policyTitle() + " (chunk " + (sc.chunk().index() + 1) + ")")
                            .distribution("INTERNAL")
                            .owner(orgId)
                            .build())
                    .collect(Collectors.toList());

        } catch (Exception e) {
            log.warn("buildGroundingSources failed for org {} (non-fatal, grounding skipped): {}",
                    orgId, e.getMessage());
            return List.of();
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private String buildFullTextContext(List<Map<String, Object>> policies) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> p : policies) {
            String title = (String) p.getOrDefault("title", "Policy");
            String text  = (String) p.getOrDefault("textContent", "");
            if (!text.isBlank()) {
                sb.append("## ").append(title).append("\n").append(text.trim()).append("\n\n");
            }
        }
        return sb.toString().trim();
    }

    private String buildRagContext(String query,
                                    List<String> policyIds,
                                    String orgId,
                                    List<Map<String, Object>> policies) {
        // Ensure chunks are indexed (best-effort; may be stale for prod)
        for (Map<String, Object> p : policies) {
            String pid   = (String) p.get("id");
            String title = (String) p.getOrDefault("title", "Policy");
            String text  = (String) p.getOrDefault("textContent", "");
            ensureIndexed(orgId, pid, title, text);
        }

        Set<String> queryTerms = extractKeywords(query.toLowerCase());
        List<ScoredChunk> candidates = new ArrayList<>();

        for (String pid : policyIds) {
            List<PolicyChunk> chunks = getChunks(orgId, pid);
            for (PolicyChunk chunk : chunks) {
                double score = scoreChunks(queryTerms, chunk.keywords());
                candidates.add(new ScoredChunk(chunk, score));
            }
        }

        candidates.sort(Comparator.comparingDouble(ScoredChunk::score).reversed());
        List<ScoredChunk> top = candidates.stream()
                .limit(MAX_CHUNKS_RETURNED)
                .filter(c -> c.score() > 0)
                .collect(Collectors.toList());

        // If no relevant chunks found, fall back to first chunk of each policy
        if (top.isEmpty()) {
            for (String pid : policyIds) {
                List<PolicyChunk> chunks = getChunks(orgId, pid);
                if (!chunks.isEmpty()) top.add(new ScoredChunk(chunks.get(0), 0));
            }
        }

        StringBuilder sb = new StringBuilder();
        for (ScoredChunk sc : top) {
            sb.append("### ").append(sc.chunk().policyTitle())
              .append(" (excerpt)\n")
              .append(sc.chunk().text().trim())
              .append("\n\n");
        }
        return sb.toString().trim();
    }

    // ── Chunking ──────────────────────────────────────────────────────────────

    private List<PolicyChunk> chunkText(String policyId, String policyTitle, String text) {
        List<PolicyChunk> chunks = new ArrayList<>();
        if (text == null || text.isBlank()) return chunks;

        int start = 0;
        int idx   = 0;
        while (start < text.length()) {
            int end = Math.min(start + CHUNK_SIZE, text.length());
            // Try to break at a sentence boundary
            if (end < text.length()) {
                int sentenceEnd = lastSentenceEnd(text, start, end);
                if (sentenceEnd > start) end = sentenceEnd;
            }
            String chunk = text.substring(start, end).trim();
            if (!chunk.isBlank()) {
                chunks.add(new PolicyChunk(policyId, policyTitle, idx++, chunk,
                        extractKeywords(chunk.toLowerCase())));
            }
            // Stop once we've consumed to the end of the text.
            // Without this, start = end - CHUNK_OVERLAP keeps start < text.length()
            // forever when end == text.length(), causing an infinite loop.
            if (end >= text.length()) break;
            start = end - CHUNK_OVERLAP;
        }
        return chunks;
    }

    private int lastSentenceEnd(String text, int start, int end) {
        for (int i = end; i > start; i--) {
            char c = text.charAt(i - 1);
            if (c == '.' || c == '!' || c == '?' || c == '\n') return i;
        }
        return end;
    }

    // ── Keyword extraction (simple tokenizer) ─────────────────────────────────

    private static final Set<String> STOP_WORDS = Set.of(
        "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
        "is","are","was","were","be","been","have","has","had","will","would","can",
        "could","should","may","might","shall","this","that","these","those","it",
        "its","not","no","all","as","if","from","into","about","which","who","what",
        "when","where","how","any","each","every","both","either","neither","than"
    );

    private Set<String> extractKeywords(String text) {
        return Arrays.stream(text.split("[\\s\\p{Punct}]+"))
                .filter(w -> w.length() > 3 && !STOP_WORDS.contains(w))
                .collect(Collectors.toSet());
    }

    /** Simple Jaccard-style overlap score: |intersection| / |union|. */
    private double scoreChunks(Set<String> queryTerms, Set<String> chunkKeywords) {
        if (queryTerms.isEmpty() || chunkKeywords.isEmpty()) return 0;
        long intersection = queryTerms.stream().filter(chunkKeywords::contains).count();
        double union = queryTerms.size() + chunkKeywords.size() - intersection;
        return intersection / union;
    }

    // ── Chunk storage helpers ─────────────────────────────────────────────────

    private void ensureIndexed(String orgId, String policyId, String title, String text) {
        if (devMode) {
            Map<String, List<PolicyChunk>> orgMap = devChunks.get(orgId);
            if (orgMap == null || !orgMap.containsKey(policyId)) {
                indexPolicy(orgId, policyId, title, text);
            }
        }
        // Production: assume chunks are already indexed on policy write
    }

    private List<PolicyChunk> getChunks(String orgId, String policyId) {
        if (devMode) {
            Map<String, List<PolicyChunk>> orgMap = devChunks.get(orgId);
            if (orgMap == null) return List.of();
            return orgMap.getOrDefault(policyId, List.of());
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            List<QueryDocumentSnapshot> docs = db
                    .collection("organizations").document(orgId)
                    .collection("policyChunks")
                    .whereEqualTo("policyId", policyId)
                    .get().get().getDocuments();
            return docs.stream().map(d -> {
                Map<String, Object> data = d.getData();
                @SuppressWarnings("unchecked")
                List<String> kws = (List<String>) data.get("keywords");
                Object idxRaw = data.get("chunkIndex");
                int idx = idxRaw instanceof Number ? ((Number) idxRaw).intValue() : 0;
                return new PolicyChunk(
                        policyId,
                        (String) data.getOrDefault("policyTitle", ""),
                        idx,
                        (String) data.getOrDefault("text", ""),
                        kws != null ? new HashSet<>(kws) : Set.of()
                );
            }).sorted(Comparator.comparingInt(PolicyChunk::index))
              .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("Failed to load chunks for policy {}: {}", policyId, e.getMessage());
            return List.of();
        }
    }

    // ── Inner types ───────────────────────────────────────────────────────────

    record PolicyChunk(String policyId, String policyTitle, int index,
                       String text, Set<String> keywords) {}

    record ScoredChunk(PolicyChunk chunk, double score) {}
}
