package ai.myaba.service;

import ai.myaba.model.dto.AclxResponse;
import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Cross-entity AI-powered search service.
 *
 * All searches are permission-filtered BEFORE any content reaches the AI.
 * Chat messages are intentionally excluded from the search index to prevent PHI
 * leakage; only chat titles (written by the user) are matched.
 *
 * The AI-generated summary is passed through ACLX output governance before
 * being returned to the caller.  The ACLX decision is included in the response
 * so the frontend can surface the appropriate compliance notice.
 *
 * Result types: client | project | resource | template | chat
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SearchService {

    private final ClientService   clientService;
    private final ProjectService  projectService;
    private final PolicyService   policyService;
    private final TemplateService templateService;
    private final ChatService     chatService;
    private final ClaudeService       claudeService;
    private final AclxService         aclxService;
    private final AuditService        auditService;
    private final ReviewQueueService  reviewQueueService;

    private static final int MAX_HITS    = 40;
    private static final int SNIPPET_LEN = 220;

    // ── Public API ────────────────────────────────────────────────────────────

    public Map<String, Object> search(AppUser user, String query) {
        if (query == null || query.isBlank()) {
            return emptyResult(query);
        }

        String q = query.toLowerCase(Locale.ROOT);
        List<Map<String, Object>> hits = new ArrayList<>();

        // 1. Clients — getAuthorizedClients() is already permission-gated
        try {
            for (var c : clientService.getAuthorizedClients(user)) {
                String fullName = str(c, "legalName").isBlank()
                        ? (str(c, "firstName") + " " + str(c, "lastName")).trim()
                        : str(c, "legalName");
                if (matches(q, fullName, str(c, "firstName"), str(c, "lastName"),
                            str(c, "preferredName"), str(c, "diagnosis"))) {
                    String diag = str(c, "diagnosis");
                    hits.add(hit("client", str(c, "id"), fullName,
                            diag.isBlank() ? "" : "Diagnosis: " + diag));
                }
            }
        } catch (Exception e) {
            log.warn("Search - client error: {}", e.getMessage());
        }

        // 2. Projects — getProjects() returns only owner/member/shared
        try {
            for (var p : projectService.getProjects(user)) {
                if (matches(q, str(p, "title"), str(p, "description"), str(p, "instructions"))) {
                    hits.add(hit("project", str(p, "id"), str(p, "title"),
                            snippet(str(p, "description"))));
                }
            }
        } catch (Exception e) {
            log.warn("Search - project error: {}", e.getMessage());
        }

        // 3. Resources (policies)
        //    Active: visible to all staff.  Draft (inactive): admins only.
        try {
            boolean isAdmin = UserRole.isAdmin(user.getRole());
            for (var pol : policyService.getPolicies(user)) {
                boolean active = Boolean.TRUE.equals(pol.get("isActive"));
                if (!active && !isAdmin) continue;
                if (matches(q, str(pol, "title"), str(pol, "textContent"))) {
                    hits.add(hit("resource", str(pol, "id"), str(pol, "title"),
                            snippet(str(pol, "textContent"))));
                }
            }
        } catch (Exception e) {
            log.warn("Search - resource error: {}", e.getMessage());
        }

        // 4. Templates — getTemplates() already filters by visibleToRoles
        try {
            for (var t : templateService.getTemplates(user)) {
                if (matches(q, str(t, "title"), str(t, "content"))) {
                    hits.add(hit("template", str(t, "id"), str(t, "title"),
                            snippet(str(t, "content"))));
                }
            }
        } catch (Exception e) {
            log.warn("Search - template error: {}", e.getMessage());
        }

        // 5. Chats — title-only; message content excluded for PHI safety
        try {
            for (var ch : chatService.getChats(user)) {
                String title = str(ch, "title");
                if (matches(q, title)) {
                    String updated  = str(ch, "updatedAt");
                    String datePart = updated.length() >= 10 ? updated.substring(0, 10) : updated;
                    hits.add(hit("chat", str(ch, "id"), title, "Chat - " + datePart));
                }
            }
        } catch (Exception e) {
            log.warn("Search - chat error: {}", e.getMessage());
        }

        // Cap to prevent an oversized AI context window
        if (hits.size() > MAX_HITS) {
            hits = hits.subList(0, MAX_HITS);
        }

        // ── AI summary + ACLX output governance ──────────────────────────────
        // Collect all client IDs from hit results so ACLX can apply cross-client
        // PHI governance rules to the synthesised summary text.
        List<String> clientIdsInHits = hits.stream()
                .filter(h -> "client".equals(h.get("type")))
                .map(h -> str(h, "id"))
                .filter(id -> !id.isBlank())
                .distinct()
                .collect(Collectors.toList());
        String primaryClientId = clientIdsInHits.isEmpty() ? null : clientIdsInHits.get(0);

        String summary         = "";
        String summaryDecision = "ALLOW";

        if (!hits.isEmpty()) {
            String rawSummary;
            try {
                rawSummary = buildAiSummary(query, hits);
            } catch (Exception e) {
                log.warn("Search - AI summary error: {}", e.getMessage());
                int n = hits.size();
                rawSummary = "Found " + n + " result" + (n != 1 ? "s" : "")
                        + " matching \"" + query + "\".";
            }

            // Pass the raw AI output through ACLX before surfacing it
            AclxResponse aclx = aclxService.evaluate(
                    rawSummary, user, primaryClientId,
                    clientIdsInHits.size() > 1 ? clientIdsInHits : null);

            summaryDecision = aclx.getDecision().getDecision();

            auditService.log("SEARCH_SUMMARY", user.getUid(), primaryClientId,
                    null, aclx.getContentId(), summaryDecision, aclx.getAclx());

            if ("ESCALATE".equals(summaryDecision)) {
                // Extract authorization deny reason for reviewer context (null when no auth check)
                String searchAuthDenyReason = null;
                try {
                    if (aclx.getAclx() != null && aclx.getAclx().getAudit() != null
                            && aclx.getAclx().getAudit().getAuthorizationAudit() != null
                            && aclx.getAclx().getAudit().getAuthorizationAudit().isAuthCheckPerformed()) {
                        searchAuthDenyReason = aclx.getAclx().getAudit().getAuthorizationAudit().getDenyReason();
                    }
                } catch (Exception ignored) { }
                reviewQueueService.enqueue(
                        user.getOrgId(),
                        aclx.getContentId(),
                        "SEARCH_SUMMARY",
                        user.getUid(),
                        primaryClientId,
                        rawSummary,
                        aclx.getDecision().getReason(),
                        aclx.getAclx() != null ? aclx.getAclx().getSensitivity() : null,
                        aclx.getAclx() != null ? aclx.getAclx().getCategory()    : null,
                        searchAuthDenyReason,
                        true /* search summary escalations always block */);
            }

            summary = switch (summaryDecision) {
                // REDACT: ACLX has already substituted redacted tokens in finalText
                case "ALLOW", "REDACT" -> aclx.getDecision().getFinalText() != null
                        ? aclx.getDecision().getFinalText()
                        : rawSummary;
                // BLOCK / ESCALATE: withhold the synthesised text; reason is audit-logged
                default -> "";
            };
        }

        return Map.of(
                "query",           query,
                "summary",         summary,
                "summaryDecision", summaryDecision,
                "hits",            hits,
                "totalCount",      hits.size()
        );
    }

    // ── AI summary builder ────────────────────────────────────────────────────

    private String buildAiSummary(String query, List<Map<String, Object>> hits) {
        // Group hits by type for a compact, readable context block
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        for (var h : hits) {
            String type  = str(h, "type");
            String title = str(h, "title");
            String snip  = str(h, "snippet");
            String line  = snip.isBlank() ? title : title + " - " + snip;
            grouped.computeIfAbsent(type, k -> new ArrayList<>()).add(line);
        }

        StringBuilder context = new StringBuilder();
        grouped.forEach((type, lines) -> {
            context.append("\n").append(type.toUpperCase()).append("S:\n");
            lines.forEach(l -> context.append("  * ").append(l).append("\n"));
        });

        String systemPrompt =
                "You are a concise search assistant for myABA.ai, a HIPAA-compliant ABA therapy "
                + "documentation platform. Summarise search results in 1-2 sentences. "
                + "Be specific about what was found (types and titles). "
                + "Never reveal PHI beyond what is listed. Do not add markdown formatting.";

        String userMessage = String.format(
                "The user searched for: \"%s\"\n\nPermission-filtered results:\n%s\n\n"
                + "Provide a 1-2 sentence summary of the most relevant findings.",
                query, context.toString());

        return claudeService.chat(systemPrompt, List.of(
                Map.of("role", "user", "content", userMessage)
        ));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean matches(String query, String... fields) {
        for (String f : fields) {
            if (f != null && f.toLowerCase(Locale.ROOT).contains(query)) return true;
        }
        return false;
    }

    private Map<String, Object> hit(String type, String id, String title, String snippet) {
        Map<String, Object> m = new HashMap<>();
        m.put("type",    type);
        m.put("id",      id      != null ? id      : "");
        m.put("title",   title   != null ? title   : "");
        m.put("snippet", snippet != null ? snippet : "");
        return m;
    }

    private String snippet(String text) {
        if (text == null || text.isBlank()) return "";
        String clean = text.replaceAll("[\\r\\n#*`]+", " ").replaceAll("\\s+", " ").trim();
        return clean.length() <= SNIPPET_LEN ? clean : clean.substring(0, SNIPPET_LEN) + "...";
    }

    private String str(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : "";
    }

    private Map<String, Object> emptyResult(String query) {
        return Map.of(
                "query",           query != null ? query : "",
                "summary",         "",
                "summaryDecision", "ALLOW",
                "hits",            List.of(),
                "totalCount",      0
        );
    }
}
