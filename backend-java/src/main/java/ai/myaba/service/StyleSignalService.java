package ai.myaba.service;

import ai.myaba.util.FirestoreCollections;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Communication-style learning — Phase 2 (the learned layer).
 *
 * <p>Captures lightweight, PHI-free interaction signals (regeneration adjustments
 * like "make it shorter", and thumbs up/down) into
 * {@code organizations/{orgId}/styleSignals}, distills them into candidate style
 * preferences when a pattern crosses a threshold, and lets an admin CONFIRM a
 * candidate — only then does it merge into the active {@code settings.styleProfile}
 * used by prompts. Nothing is applied to clinical output automatically.
 *
 * <p>See docs/design/communication-style-learning.md.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class StyleSignalService {

    /** A signal must recur this many (net) times before it becomes a candidate. */
    private static final int THRESHOLD = 3;
    private static final String SIGNALS = "styleSignals";

    private final OrgService orgService;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    // Dev in-memory store: orgId -> list of signal names.
    private final Map<String, List<String>> devSignals = new HashMap<>();

    /** Accepted signal names (PHI-free categories). */
    private static final Set<String> VALID = Set.of(
            "shorter", "longer", "simpler", "more_detail", "more_formal", "warmer",
            "thumbs_up", "thumbs_down");

    // ── Candidate catalog: signal pattern → suggested profile change ──────────
    private record Candidate(String key, String label, String description,
                             String field, Object value) {}

    /** Record one signal. {@code surface} is "chat" | "document"; note is optional, short, PHI-free. */
    public void record(String orgId, String userId, String signal, String surface, String note) {
        if (orgId == null || orgId.isBlank() || signal == null || !VALID.contains(signal)) return;
        Map<String, Object> row = new HashMap<>();
        row.put("signal", signal);
        row.put("surface", surface != null ? surface : "chat");
        row.put("userId", userId);
        if (note != null && !note.isBlank()) row.put("note", note.substring(0, Math.min(note.length(), 280)));
        row.put("timestampMs", System.currentTimeMillis());

        if (devMode) {
            devSignals.computeIfAbsent(orgId, k -> new ArrayList<>()).add(signal);
            return;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
              .collection(SIGNALS).add(row).get();
        } catch (Exception e) {
            log.warn("style signal write failed org={}: {}", orgId, e.getMessage());
        }
    }

    /** Count signals by name for an org. */
    private Map<String, Integer> counts(String orgId) {
        Map<String, Integer> c = new HashMap<>();
        if (devMode) {
            for (String s : devSignals.getOrDefault(orgId, List.of())) c.merge(s, 1, Integer::sum);
            return c;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            var docs = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection(SIGNALS).get().get().getDocuments();
            for (var d : docs) {
                String s = d.getString("signal");
                if (s != null) c.merge(s, 1, Integer::sum);
            }
        } catch (Exception e) {
            log.warn("style signal read failed org={}: {}", orgId, e.getMessage());
        }
        return c;
    }

    /**
     * Distill signals into confirmable candidates: patterns past {@link #THRESHOLD}
     * that are not already reflected in the profile and not dismissed.
     */
    public List<Map<String, Object>> candidates(String orgId) {
        Map<String, Integer> c = counts(orgId);
        int shorter = c.getOrDefault("shorter", 0);
        int longer  = c.getOrDefault("longer", 0) + c.getOrDefault("more_detail", 0);

        List<Candidate> all = new ArrayList<>();
        if (shorter - longer >= THRESHOLD)
            all.add(new Candidate("length_brief", "Prefer brief responses",
                    "Your team often asks for shorter output.", "length", "Brief"));
        if (longer - shorter >= THRESHOLD)
            all.add(new Candidate("length_thorough", "Prefer thorough responses",
                    "Your team often asks for more detail.", "length", "Thorough"));
        if (c.getOrDefault("simpler", 0) >= THRESHOLD)
            all.add(new Candidate("tone_plain", "Use plain language",
                    "Your team often asks for simpler wording.", "tone", "Plain-language"));
        if (c.getOrDefault("more_formal", 0) >= THRESHOLD)
            all.add(new Candidate("tone_formal", "Use a clinical / formal tone",
                    "Your team often asks for a more formal tone.", "tone", "Clinical / formal"));
        if (c.getOrDefault("warmer", 0) >= THRESHOLD)
            all.add(new Candidate("tone_warm", "Use a warm tone",
                    "Your team often asks for a warmer tone.", "tone", "Warm"));

        Map<String, Object> profile = orgService.getStyleProfileMap(orgId);
        Set<String> dismissed = dismissedKeys(profile);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Candidate cand : all) {
            if (dismissed.contains(cand.key())) continue;
            // Already satisfied by the active profile? then it's not a suggestion.
            if (Objects.equals(String.valueOf(profile.get(cand.field())), String.valueOf(cand.value()))) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", cand.key());
            m.put("label", cand.label());
            m.put("description", cand.description());
            m.put("field", cand.field());
            m.put("value", cand.value());
            out.add(m);
        }
        return out;
    }

    /** Confirm a candidate: merge its suggested field into the active style profile. */
    public void apply(String orgId, String candidateKey) throws Exception {
        for (Map<String, Object> cand : allPossibleCandidates()) {
            if (cand.get("key").equals(candidateKey)) {
                Map<String, Object> profile = orgService.getStyleProfileMap(orgId);
                profile.put((String) cand.get("field"), cand.get("value"));
                orgService.updateStyleProfile(orgId, profile);
                return;
            }
        }
    }

    /** Dismiss a candidate so it is not suggested again. */
    public void dismiss(String orgId, String candidateKey) throws Exception {
        Map<String, Object> profile = orgService.getStyleProfileMap(orgId);
        Set<String> dismissed = new LinkedHashSet<>(dismissedKeys(profile));
        dismissed.add(candidateKey);
        profile.put("dismissedCandidates", new ArrayList<>(dismissed));
        orgService.updateStyleProfile(orgId, profile);
    }

    @SuppressWarnings("unchecked")
    private Set<String> dismissedKeys(Map<String, Object> profile) {
        Object d = profile.get("dismissedCandidates");
        if (d instanceof List<?> l) {
            Set<String> s = new HashSet<>();
            for (Object o : l) s.add(String.valueOf(o));
            return s;
        }
        return Set.of();
    }

    /** The full candidate catalog (key/field/value) — used by apply(). */
    private List<Map<String, Object>> allPossibleCandidates() {
        return List.of(
                Map.of("key", "length_brief",    "field", "length", "value", "Brief"),
                Map.of("key", "length_thorough", "field", "length", "value", "Thorough"),
                Map.of("key", "tone_plain",      "field", "tone",   "value", "Plain-language"),
                Map.of("key", "tone_formal",     "field", "tone",   "value", "Clinical / formal"),
                Map.of("key", "tone_warm",       "field", "tone",   "value", "Warm"));
    }
}
