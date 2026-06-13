package ai.myaba.controller;

import ai.myaba.model.dto.*;
import ai.myaba.service.AclxService;
import ai.myaba.service.AuditService;
import ai.myaba.service.AuthorizationService;
import ai.myaba.service.ChatService;
import ai.myaba.service.ClaudeService;
import ai.myaba.service.ClientService;
import ai.myaba.service.OrgService;
import ai.myaba.service.PolicyRagService;
import ai.myaba.service.PolicyService;
import ai.myaba.service.ProjectService;
import ai.myaba.service.ReviewQueueService;
import ai.myaba.service.SubjectAuthorizationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class GenerateController {

    private final ClaudeService claudeService;
    private final AclxService aclxService;
    private final AuditService auditService;
    private final ReviewQueueService reviewQueueService;
    private final ClientService clientService;
    private final AuthorizationService authorizationService;
    private final SubjectAuthorizationService subjectAuthorizationService;
    private final ChatService chatService;
    private final OrgService orgService;
    private final PolicyService policyService;
    private final PolicyRagService policyRagService;
    private final ProjectService projectService;

    // ── POST /api/generate-document ──────────────────────────────────────────

    @PostMapping("/generate-document")
    public ResponseEntity<?> generateDocument(
            @Valid @RequestBody GenerateDocumentRequest req,
            @AuthenticationPrincipal AppUser user) {

        // Gate: only clinical staff can generate documents
        if (!user.canInitiateChat()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Document generation requires a clinical role"));
        }

        // Layer 2: fetch client and verify authorization
        Map<String, Object> client;
        try {
            client = clientService.getClient(user.getOrgId(), req.getClientId());
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("Error fetching client {}: {}", req.getClientId(), e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to fetch client"));
        }

        if (!authorizationService.canGenerateForClient(user, client)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Not authorized to generate documents for this client"));
        }

        // Pre-ACLX hard-block: if the client's data category requires explicit
        // authorization and none exists, block without forwarding to ACLX.
        // (For some categories — e.g. 42 CFR Part 2 SUD records — even sending
        // content to a governance gateway is legally impermissible without consent.)
        String diagnosis = (String) client.getOrDefault("diagnosis", "");
        if (subjectAuthorizationService.requiresHardBlock(user.getOrgId(), req.getClientId(), diagnosis)) {
            auditService.log("DOCUMENT_BLOCKED_NO_AUTH", user.getUid(), req.getClientId(),
                    null, null, "BLOCK", null);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error",  "Document generation blocked: explicit written authorization required " +
                              "for this client's data category before any AI processing can occur.",
                    "reason", "HARD_BLOCK_NO_AUTHORIZATION",
                    "code",   "AUTH_REQUIRED"
            ));
        }

        // Build de-identified context (DLP sanitization pending — placeholder values for now)
        String preferredName = (String) client.getOrDefault("preferredName", "[client]");
        String context = """
                Preferred name: %s
                Diagnosis context: [Retrieved from uploaded assessments — DLP sanitized]
                Treatment history: [Retrieved from session notes — DLP sanitized]
                """.formatted(preferredName);

        // Generate with Claude
        String rawOutput;
        try {
            rawOutput = claudeService.generateDocument(
                    req.getDocumentType(), context, req.getAdditionalContext());
        } catch (Exception e) {
            log.error("Claude generation failed: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "AI generation failed"));
        }

        // Layer 3+4: ACLX output governance
        AclxResponse aclxResult = aclxService.evaluate(rawOutput, user, req.getClientId());
        String decision = aclxResult.getDecision().getDecision();

        // §3: Fail-safe — alert ops when the OPA policy bundle is unavailable.
        // The gateway hard-blocks SUPER_PHI when the bundle is down, but we also
        // alert independently and refuse to silently ALLOW on a missing bundle.
        String policyVersion = aclxResult.getDecision().getPolicyVersion();
        if ("unavailable".equals(policyVersion) || policyVersion == null) {
            log.error("ACLX policy bundle unavailable (policyVersion={}). " +
                      "OPA sidecar may be down — treating ALLOW as BLOCK for safety.", policyVersion);
            if ("ALLOW".equals(decision)) {
                decision = "BLOCK";
            }
        }

        auditService.log("DOCUMENT_GENERATED", user.getUid(), req.getClientId(),
                null, aclxResult.getContentId(), decision, aclxResult.getAclx());

        // §4: Extract authorization deny reason from the label (for review queue)
        String authDenyReason = extractAuthDenyReason(aclxResult);

        return switch (decision) {
            case "BLOCK" -> {
                String blockReason = aclxResult.getDecision().getReason();
                boolean isQuarantine = blockReason != null
                        && blockReason.startsWith("QUARANTINE_SUSPECTED");
                if (isQuarantine) {
                    // §4: Do NOT surface raw quarantine reason to the end user —
                    // it may contain forensic data. Log for ops investigation.
                    log.warn("QUARANTINE_SUSPECTED block: client={} user={} reason={}",
                            req.getClientId(), user.getUid(), blockReason);
                }
                yield ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error",     isQuarantine
                                     ? "Document blocked: security policy violation detected."
                                     : "Document blocked by compliance policy",
                    "reason",    isQuarantine ? "QUARANTINE_SUSPECTED" : (blockReason != null ? blockReason : ""),
                    "contentId", aclxResult.getContentId()
                ));
            }
            case "ESCALATE" -> {
                auditService.log("DOCUMENT_ESCALATED", user.getUid(), req.getClientId(),
                        null, aclxResult.getContentId(), "ESCALATE", aclxResult.getAclx());
                String rqItemId = reviewQueueService.enqueue(
                        user.getOrgId(),
                        aclxResult.getContentId(),
                        "DOCUMENT_GENERATED",
                        user.getUid(),
                        req.getClientId(),
                        rawOutput,
                        aclxResult.getDecision().getReason(),
                        aclxResult.getAclx() != null ? aclxResult.getAclx().getSensitivity() : null,
                        aclxResult.getAclx() != null ? aclxResult.getAclx().getCategory()    : null,
                        authDenyReason,
                        true /* document escalations always block */);
                yield ResponseEntity.accepted().body(GenerateDocumentResponse.builder()
                        .status("PENDING_REVIEW")
                        .message("Document flagged for human review before release")
                        .reviewId(rqItemId)
                        .build());
            }
            default -> ResponseEntity.ok(GenerateDocumentResponse.builder()
                    .success(true)
                    .documentType(req.getDocumentType())
                    .content(aclxResult.getDecision().getFinalText())
                    .decision(decision)
                    .contentId(aclxResult.getContentId())
                    .build());
        };
    }

    // ── POST /api/chat ────────────────────────────────────────────────────────

    @PostMapping("/chat")
    public ResponseEntity<?> chat(
            @Valid @RequestBody ChatRequest req,
            @AuthenticationPrincipal AppUser user) {

        // Gate: only roles that can initiate clinical chat
        if (!user.canInitiateChat()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Chat requires a clinical role"));
        }

        // Build the effective client ID list for authorization + ACLX
        List<String> allClientIds = resolveClientIds(req);

        // Layer 2: validate authorization for all referenced clients
        if (!allClientIds.isEmpty()) {
            try {
                Map<String, Map<String, Object>> clientsById =
                        clientService.getClientsById(user.getOrgId(), allClientIds);

                List<String> unauthorized =
                        authorizationService.getUnauthorizedClientIds(user, allClientIds, clientsById);

                if (!unauthorized.isEmpty()) {
                    log.warn("User {} attempted cross-client access to unauthorized clients: {}",
                            user.getUid(), unauthorized);
                    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                            "error", "Not authorized to reference one or more clients in this query",
                            "unauthorizedIds", unauthorized
                    ));
                }

                // Pre-ACLX hard-block: check every referenced client for super-PHI categories
                for (Map.Entry<String, Map<String, Object>> entry : clientsById.entrySet()) {
                    String cid       = entry.getKey();
                    String clientDx  = (String) entry.getValue().getOrDefault("diagnosis", "");
                    if (subjectAuthorizationService.requiresHardBlock(user.getOrgId(), cid, clientDx)) {
                        auditService.log("CHAT_BLOCKED_NO_AUTH", user.getUid(), cid,
                                null, null, "BLOCK", null);
                        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                                "error",  "Chat blocked: explicit written authorization required " +
                                          "for this client's data category before any AI processing can occur.",
                                "reason", "HARD_BLOCK_NO_AUTHORIZATION",
                                "code",   "AUTH_REQUIRED"
                        ));
                    }
                }
            } catch (Exception e) {
                log.error("Client authorization check failed: {}", e.getMessage());
                return ResponseEntity.internalServerError()
                        .body(Map.of("error", "Authorization check failed"));
            }
        }

        // Build message list for Claude
        List<Map<String, String>> messages = new ArrayList<>();
        if (req.getHistory() != null) {
            req.getHistory().forEach(m ->
                    messages.add(Map.of("role", m.getRole(), "content", m.getContent())));
        }
        messages.add(Map.of("role", "user", "content", req.getMessage()));

        // Build policy-augmented system prompt
        // If the chat has policyIds, retrieve relevant policy context via RAG service.
        String systemPrompt = buildChatSystemPrompt(req, user);

        String rawReply;
        try {
            rawReply = claudeService.chat(systemPrompt, messages);
        } catch (Exception e) {
            log.error("Claude chat failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Chat failed"));
        }

        // Layer 3+4: ACLX output governance (passes all client IDs for cross-client rules)
        AclxResponse aclxResult = aclxService.evaluate(
                rawReply, user, req.getClientId(),
                allClientIds.size() > 1 ? allClientIds : null);
        String decision = aclxResult.getDecision().getDecision();

        // §3: Fail-safe — alert ops when the OPA policy bundle is unavailable
        String chatPolicyVersion = aclxResult.getDecision().getPolicyVersion();
        if ("unavailable".equals(chatPolicyVersion) || chatPolicyVersion == null) {
            log.error("ACLX policy bundle unavailable (policyVersion={}). " +
                      "OPA sidecar may be down — treating ALLOW as BLOCK for safety.", chatPolicyVersion);
            if ("ALLOW".equals(decision)) {
                decision = "BLOCK";
            }
        }

        auditService.log("CHAT_RESPONSE", user.getUid(), req.getClientId(),
                null, aclxResult.getContentId(), decision, aclxResult.getAclx());

        // §4: QUARANTINE_SUSPECTED in BLOCK — don't surface raw reason to end user
        String chatBlockReason = aclxResult.getDecision().getReason();
        boolean chatIsQuarantine = "BLOCK".equals(decision) && chatBlockReason != null
                && chatBlockReason.startsWith("QUARANTINE_SUSPECTED");
        if (chatIsQuarantine) {
            log.warn("QUARANTINE_SUSPECTED chat block: client={} user={} reason={}",
                    req.getClientId(), user.getUid(), chatBlockReason);
        }

        // Check org's reviewRequired setting to decide whether ESCALATE blocks delivery
        boolean reviewRequired = orgService.isReviewRequired(user.getOrgId());

        if ("ESCALATE".equals(decision)) {
            // §4: Pass authorization deny reason into review queue for reviewers
            String chatAuthDenyReason = extractAuthDenyReason(aclxResult);
            // blocking=true → PENDING (holds content); blocking=false → LOGGED (audit-only)
            reviewQueueService.enqueue(
                    user.getOrgId(),
                    aclxResult.getContentId(),
                    "CHAT_RESPONSE",
                    user.getUid(),
                    req.getClientId(),
                    rawReply,
                    aclxResult.getDecision().getReason(),
                    aclxResult.getAclx() != null ? aclxResult.getAclx().getSensitivity() : null,
                    aclxResult.getAclx() != null ? aclxResult.getAclx().getCategory()    : null,
                    chatAuthDenyReason,
                    reviewRequired);
        }

        // Build reply — BLOCK always withholds, ESCALATE withholds only when reviewRequired
        String reply;
        if ("BLOCK".equals(decision)) {
            reply = "I cannot share that information based on your current access level.";
        } else if ("ESCALATE".equals(decision) && reviewRequired) {
            reply = "This response has been flagged for compliance review and will be available once approved.";
        } else {
            // ALLOW, REDACT, or non-blocking ESCALATE
            reply = aclxResult.getDecision().getFinalText();
        }

        // Build flattened ACLX label map — stored on the assistant message for API consumers
        Map<String, Object> aclxLabelMap = buildAclxLabelMap(aclxResult);

        // Persist messages to Firestore when a chatId is provided
        if (req.getChatId() != null && !req.getChatId().isBlank()) {
            try {
                chatService.appendMessages(user, req.getChatId(), req.getMessage(), reply,
                        decision, aclxLabelMap, aclxResult.getContentId());
            } catch (Exception e) {
                // Non-fatal: log but don't fail the response
                log.warn("Failed to persist messages for chat {}: {}", req.getChatId(), e.getMessage());
            }
        }

        return ResponseEntity.ok(ChatResponse.builder()
                .reply(reply)
                .decision(decision)
                .chatId(req.getChatId())
                .build());
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "myaba-api");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Build the Claude system prompt for a chat request.
     * Layers (in order):
     *   1. Project instructions + knowledge docs (if chat has a projectId)
     *   2. Policy RAG context (if chat has policyIds)
     */
    private String buildChatSystemPrompt(ChatRequest req, AppUser user) {
        if (req.getChatId() == null || req.getChatId().isBlank()) return null;
        try {
            Map<String, Object> chat = chatService.getChat(user, req.getChatId());
            StringBuilder sb = new StringBuilder();

            // Layer 1 — project instructions + knowledge
            String projectId = (String) chat.get("projectId");
            if (projectId != null && !projectId.isBlank()) {
                try {
                    String projectPrompt = projectService.buildProjectSystemPrompt(user.getOrgId(), projectId);
                    if (projectPrompt != null && !projectPrompt.isBlank()) {
                        sb.append(projectPrompt).append("\n\n");
                    }
                } catch (Exception e) {
                    log.warn("Could not build project system prompt for project {}: {}", projectId, e.getMessage());
                }
            }

            // Layer 2 — policy RAG
            @SuppressWarnings("unchecked")
            List<String> policyIds = (List<String>) chat.get("policyIds");
            if (policyIds != null && !policyIds.isEmpty()) {
                String policyContext = policyRagService.buildSystemContext(
                        req.getMessage(), policyIds, user.getOrgId(), policyService);
                if (!policyContext.isBlank()) {
                    sb.append(policyContext);
                }
            }

            String result = sb.toString().trim();
            return result.isBlank() ? null : result;
        } catch (Exception e) {
            log.warn("Could not build chat system prompt: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Extract {@code authorization_audit.deny_reason} from an ACLX response.
     * Returns null if the label is absent or no auth check was performed.
     * Used to populate the review queue item so reviewers know why an
     * authorization check failed (NOT_PROVIDED / REVOKED / EXPIRED).
     */
    private String extractAuthDenyReason(AclxResponse aclxResult) {
        try {
            AclxResponse.AclxLabel label = aclxResult.getAclx();
            if (label == null) return null;
            AclxResponse.AclxAudit audit = label.getAudit();
            if (audit == null) return null;
            AclxResponse.AuthorizationAudit authAudit = audit.getAuthorizationAudit();
            if (authAudit == null || !authAudit.isAuthCheckPerformed()) return null;
            return authAudit.getDenyReason();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Build a flat label map from the ACLX response for storage on the assistant message.
     * Every AI response gets this label so API consumers can enforce their own governance.
     */
    private Map<String, Object> buildAclxLabelMap(AclxResponse aclxResult) {
        if (aclxResult == null || aclxResult.getAclx() == null) return Map.of();
        AclxResponse.AclxLabel label = aclxResult.getAclx();
        Map<String, Object> m = new LinkedHashMap<>();
        if (label.getDomain() != null)      m.put("domain",      label.getDomain());
        if (label.getCategory() != null)    m.put("category",    label.getCategory());
        if (label.getSubcategory() != null) m.put("subcategory", label.getSubcategory());
        if (label.getSensitivity() != null) m.put("sensitivity", label.getSensitivity());
        return m;
    }

    /** Merges clientId + clientIds into a deduplicated list. */
    private List<String> resolveClientIds(ChatRequest req) {
        List<String> ids = new ArrayList<>();
        if (req.getClientId() != null && !req.getClientId().isBlank()) {
            ids.add(req.getClientId());
        }
        if (req.getClientIds() != null) {
            req.getClientIds().stream()
                    .filter(id -> id != null && !id.isBlank() && !ids.contains(id))
                    .forEach(ids::add);
        }
        return ids;
    }
}
