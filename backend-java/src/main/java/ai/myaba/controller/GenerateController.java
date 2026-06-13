package ai.myaba.controller;

import ai.myaba.model.dto.*;
import ai.myaba.service.AclxService;
import ai.myaba.service.AuditService;
import ai.myaba.service.AuthorizationService;
import ai.myaba.service.ChatService;
import ai.myaba.service.ClaudeService;
import ai.myaba.service.ClientService;
import ai.myaba.service.InputGuardService;
import ai.myaba.service.OrgService;
import ai.myaba.service.PolicyRagService;
import ai.myaba.service.PolicyService;
import ai.myaba.service.ProjectService;
import ai.myaba.service.ReviewQueueService;
import ai.myaba.service.SubjectAuthorizationService;
import ai.myaba.service.guard.InputGuard;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;

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
    private final InputGuardService inputGuardService;
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

        // Fetched once — used for (a) authorization check, (b) client context in system prompt
        Map<String, Map<String, Object>> clientsById = Map.of();

        // Layer 2: validate authorization for all referenced clients
        if (!allClientIds.isEmpty()) {
            try {
                clientsById = clientService.getClientsById(user.getOrgId(), allClientIds);

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

        // ── Input guard pipeline ─────────────────────────────────────────────────
        // All configured guards run in priority order before any tokens are spent.
        // Guards: (1) PromptInjectionGuard, (2) SensitiveIdentifierGuard,
        //         (3) CrossClientPhiGuard.
        // Adding a new guard only requires a new @Component — this block never changes.
        {
            Optional<InputGuard.Violation> guardViolation =
                    inputGuardService.check(user, req.getMessage(), allClientIds);
            if (guardViolation.isPresent()) {
                InputGuard.Violation v = guardViolation.get();
                auditService.log("CHAT_INPUT_GUARD_BLOCKED", user.getUid(),
                        req.getClientId(), null, null, "BLOCK", null);
                log.warn("InputGuard blocked chat: user={} org={} code={} detected={}",
                        user.getUid(), user.getOrgId(), v.code(), v.detectedValue());
                return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of(
                        "error",    "Message blocked by input compliance guard",
                        "message",  v.userMessage(),
                        "code",     v.code(),
                        "detected", v.detectedValue()
                ));
            }
        }

        // Build message list for Claude
        List<Map<String, String>> messages = new ArrayList<>();
        if (req.getHistory() != null) {
            req.getHistory().forEach(m ->
                    messages.add(Map.of("role", m.getRole(), "content", m.getContent())));
        }
        messages.add(Map.of("role", "user", "content", req.getMessage()));

        // Build policy-augmented system prompt (includes base clinical identity + client context)
        String systemPrompt = buildChatSystemPrompt(req, user, clientsById);

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
     *   0. Base ABA clinical identity — always present
     *   1. Client context — when the chat has a clientId on file
     *   2. Project instructions + knowledge docs — if chat has a projectId
     *   3. Policy RAG context — if chat has policyIds
     */
    private String buildChatSystemPrompt(ChatRequest req, AppUser user,
                                          Map<String, Map<String, Object>> clientsById) {
        StringBuilder sb = new StringBuilder();

        // ── Layer 0: base ABA clinical identity (always present) ─────────────────
        sb.append("""
                You are a clinical AI assistant embedded in myABA.ai, a documentation \
                and care-coordination platform for Applied Behavior Analysis (ABA) therapy practices.
                You help BCBAs, RBTs, clinical supervisors, and other clinical staff with \
                documentation, scheduling, behavior programs, session notes, treatment planning, \
                and clinical decision support.
                Always provide responses that are evidence-based, clinically appropriate, and \
                consistent with BACB ethical guidelines and applicable regulations.
                When client information is on file (shown below), use it directly in your responses \
                rather than asking the user to re-enter details that are already known.
                If additional information is needed to complete a request, ask specifically for the \
                missing detail rather than requesting all information from scratch.
                Do not use emoji characters in any response. This is a professional clinical platform \
                and emoji are inappropriate in clinical documentation and communication.
                """);

        // ── Layer 1: client context ───────────────────────────────────────────────
        if (req.getClientId() != null && !req.getClientId().isBlank() && !clientsById.isEmpty()) {
            Map<String, Object> primaryClient = clientsById.get(req.getClientId());
            if (primaryClient == null) {
                // Fallback: use first available client if primary key isn't in the map
                primaryClient = clientsById.values().iterator().next();
            }
            if (primaryClient != null) {
                sb.append("\n").append(buildClientContextBlock(primaryClient));
            }
        }

        // Layers 2–3 require the chat record
        if (req.getChatId() != null && !req.getChatId().isBlank()) {
            try {
                Map<String, Object> chat = chatService.getChat(user, req.getChatId());

                // ── Layer 2: project instructions + knowledge ─────────────────────
                String projectId = (String) chat.get("projectId");
                if (projectId != null && !projectId.isBlank()) {
                    try {
                        String projectPrompt = projectService.buildProjectSystemPrompt(
                                user.getOrgId(), projectId);
                        if (projectPrompt != null && !projectPrompt.isBlank()) {
                            sb.append("\n\n").append(projectPrompt);
                        }
                    } catch (Exception e) {
                        log.warn("Could not build project system prompt for project {}: {}",
                                projectId, e.getMessage());
                    }
                }

                // ── Layer 3: policy RAG ───────────────────────────────────────────
                @SuppressWarnings("unchecked")
                List<String> policyIds = (List<String>) chat.get("policyIds");
                if (policyIds != null && !policyIds.isEmpty()) {
                    String policyContext = policyRagService.buildSystemContext(
                            req.getMessage(), policyIds, user.getOrgId(), policyService);
                    if (!policyContext.isBlank()) {
                        sb.append("\n\n").append(policyContext);
                    }
                }
            } catch (Exception e) {
                log.warn("Could not build chat system prompt layers 2–3: {}", e.getMessage());
            }
        }

        return sb.toString().trim();
    }

    /**
     * Format a client record into a structured context block for the system prompt.
     * Only includes fields that are non-blank so Claude isn't given empty noise.
     */
    private String buildClientContextBlock(Map<String, Object> client) {
        StringBuilder sb = new StringBuilder();
        sb.append("--- CLIENT ON FILE ---\n");

        // Name — prefer preferredName, fall back to firstName + lastName
        String preferredName = strField(client, "preferredName");
        String firstName     = strField(client, "firstName");
        String lastName      = strField(client, "lastName");
        String fullName      = firstName.isEmpty() ? "" : (firstName + " " + lastName).trim();
        String displayName   = !preferredName.isEmpty() ? preferredName
                             : !fullName.isEmpty()      ? fullName
                             : "";
        if (!displayName.isEmpty()) {
            sb.append("Name: ").append(displayName);
            // If preferredName differs from legal name, include both
            if (!preferredName.isEmpty() && !fullName.isEmpty()
                    && !preferredName.equalsIgnoreCase(fullName)) {
                sb.append(" (legal name: ").append(fullName).append(")");
            }
            sb.append("\n");
        }

        // Date of birth + age
        String dob = strField(client, "dateOfBirth");
        if (!dob.isEmpty()) {
            sb.append("Date of Birth: ").append(dob);
            try {
                // Accepts YYYY-MM-DD
                LocalDate birthDate = LocalDate.parse(dob.length() > 10 ? dob.substring(0, 10) : dob);
                int age = Period.between(birthDate, LocalDate.now(ZoneOffset.UTC)).getYears();
                sb.append(" (Age: ").append(age).append(")");
            } catch (Exception ignored) { /* keep raw string if parsing fails */ }
            sb.append("\n");
        }

        // Gender
        String gender = strField(client, "gender");
        if (!gender.isEmpty()) sb.append("Gender: ").append(gender).append("\n");

        // Diagnosis
        String diagnosis = strField(client, "diagnosis");
        if (!diagnosis.isEmpty()) sb.append("Diagnosis: ").append(diagnosis).append("\n");

        // Primary insurance
        String insurance = strField(client, "primaryInsurance");
        if (!insurance.isEmpty()) sb.append("Primary Insurance: ").append(insurance).append("\n");

        // EHR reference (if present, useful for note context)
        String ehrProvider = strField(client, "ehrProvider");
        String ehrCaseId   = strField(client, "ehrCaseId");
        if (!ehrProvider.isEmpty() || !ehrCaseId.isEmpty()) {
            sb.append("EHR: ");
            if (!ehrProvider.isEmpty()) sb.append(ehrProvider);
            if (!ehrCaseId.isEmpty())   sb.append(" (Case ID: ").append(ehrCaseId).append(")");
            sb.append("\n");
        }

        sb.append("--- END CLIENT RECORD ---");
        return sb.toString();
    }

    /** Safely extract a non-null, trimmed string field from a Firestore document map. */
    private String strField(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val == null) return "";
        String s = val.toString().trim();
        return s.isEmpty() ? "" : s;
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
