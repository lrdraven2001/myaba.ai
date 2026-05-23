package ai.myaba.controller;

import ai.myaba.model.dto.*;
import ai.myaba.service.AclxService;
import ai.myaba.service.AuditService;
import ai.myaba.service.ClaudeService;
import ai.myaba.service.ClientService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
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
    private final ClientService clientService;

    // ── POST /api/generate-document ─────────────────────────────────────────

    @PostMapping("/generate-document")
    public ResponseEntity<?> generateDocument(
            @Valid @RequestBody GenerateDocumentRequest req,
            @AuthenticationPrincipal AppUser user) {

        // Layer 2: verify client belongs to this org
        Map<String, Object> client;
        try {
            client = clientService.getClient(user.getOrgId(), req.getClientId());
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("Error fetching client: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to fetch client"));
        }

        // Build de-identified context (real impl would pull docs from GCS + DLP)
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

        // ACLX evaluation (Layers 3 & 4)
        AclxResponse aclxResult = aclxService.evaluate(rawOutput, user, req.getClientId());
        String decision = aclxResult.getDecision().getDecision();

        auditService.log("DOCUMENT_GENERATED", user.getUid(), req.getClientId(),
                null, aclxResult.getContentId(), decision, aclxResult.getAclx());

        return switch (decision) {
            case "BLOCK" -> ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error", "Document blocked by compliance policy",
                    "reason", aclxResult.getDecision().getReason(),
                    "contentId", aclxResult.getContentId()
            ));
            case "ESCALATE" -> {
                // Queue for human review (Firestore write omitted in dev mode — AuditService handles it)
                auditService.log("DOCUMENT_ESCALATED", user.getUid(), req.getClientId(),
                        null, aclxResult.getContentId(), "ESCALATE", aclxResult.getAclx());
                yield ResponseEntity.accepted().body(GenerateDocumentResponse.builder()
                        .status("PENDING_REVIEW")
                        .message("Document flagged for human review before release")
                        .reviewId(aclxResult.getContentId())
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

    // ── POST /api/chat ───────────────────────────────────────────────────────

    @PostMapping("/chat")
    public ResponseEntity<?> chat(
            @Valid @RequestBody ChatRequest req,
            @AuthenticationPrincipal AppUser user) {

        List<Map<String, String>> messages = new ArrayList<>();
        if (req.getHistory() != null) {
            req.getHistory().forEach(m -> messages.add(Map.of("role", m.getRole(), "content", m.getContent())));
        }
        messages.add(Map.of("role", "user", "content", req.getMessage()));

        String rawReply;
        try {
            rawReply = claudeService.chat(null, messages);
        } catch (Exception e) {
            log.error("Claude chat failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Chat failed"));
        }

        AclxResponse aclxResult = aclxService.evaluate(rawReply, user, req.getClientId());
        String decision = aclxResult.getDecision().getDecision();

        auditService.log("CHAT_RESPONSE", user.getUid(), req.getClientId(),
                null, aclxResult.getContentId(), decision, aclxResult.getAclx());

        String reply = "BLOCK".equals(decision)
                ? "I cannot share that information based on your current access level."
                : aclxResult.getDecision().getFinalText();

        return ResponseEntity.ok(ChatResponse.builder()
                .reply(reply)
                .decision(decision)
                .build());
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "myaba-api");
    }
}
