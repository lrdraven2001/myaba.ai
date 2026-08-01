package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.CreateChatRequest;
import ai.myaba.service.ChatService;
import ai.myaba.service.ClientService;
import ai.myaba.service.ContentNormalizationService;
import ai.myaba.service.OrgService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for chat management.
 *
 * All routes are under /api/chats.
 * Message persistence (append) is handled by GenerateController after AI inference.
 */
@RestController
@RequestMapping("/api/chats")
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final ChatService chatService;
    private final OrgService orgService;
    private final ClientService clientService;
    private final ContentNormalizationService contentNormalizationService;

    /**
     * When the org uses client preferred/display names and the chat is tied to a client, rewrite
     * the chat title (label) to the preferred name; otherwise leave the client's actual name.
     * Best-effort — returns the title unchanged on any error. (Chat labels intentionally do NOT
     * use the initials-only rule — that applies to chat message content only.)
     */
    private String deidentifyTitle(AppUser user, String clientId, String title) {
        if (title == null || title.isBlank() || clientId == null || clientId.isBlank()) return title;
        try {
            if (!orgService.isPreferClientDisplayName(user.getOrgId())) return title;
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            return contentNormalizationService.preferDisplayNames(title, List.of(client), true);
        } catch (Exception e) {
            return title;
        }
    }

    // ── List chats ────────────────────────────────────────────────────────

    /**
     * GET /api/chats
     * Returns all chats the authenticated user can access, ordered by most-recently-updated.
     */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listChats(
            @AuthenticationPrincipal AppUser user) throws Exception {
        return ResponseEntity.ok(chatService.getChats(user));
    }

    // ── Reviewer/oversight: all org chats ─────────────────────────────────
    // The Review screen's Chat Review tab. Admin-gated (Clinical Director /
    // Practice Administrator) — this is org-wide oversight, NOT the personal
    // member-scoped list. Companion message read is /review-messages below.

    @GetMapping("/all")
    public ResponseEntity<?> listAllOrgChats(
            @AuthenticationPrincipal AppUser user) throws Exception {
        if (!user.isAdmin()) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Reviewer access required"));
        }
        return ResponseEntity.ok(chatService.getAllOrgChats(user.getOrgId()));
    }

    @GetMapping("/{chatId}/review-messages")
    public ResponseEntity<?> getReviewMessages(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId) throws Exception {
        if (!user.isAdmin()) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Reviewer access required"));
        }
        return ResponseEntity.ok(chatService.getMessagesForChat(user.getOrgId(), chatId));
    }

    // ── Get single chat ───────────────────────────────────────────────────

    /**
     * GET /api/chats/{chatId}
     * Returns the chat metadata.
     */
    @GetMapping("/{chatId}")
    public ResponseEntity<Map<String, Object>> getChat(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId) throws Exception {
        return ResponseEntity.ok(chatService.getChat(user, chatId));
    }

    // ── Get messages ──────────────────────────────────────────────────────

    /**
     * GET /api/chats/{chatId}/messages
     * Returns the message history for a chat, oldest-first.
     */
    @GetMapping("/{chatId}/messages")
    public ResponseEntity<List<Map<String, Object>>> getMessages(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId) throws Exception {
        return ResponseEntity.ok(chatService.getMessages(user, chatId));
    }

    // ── Create chat ───────────────────────────────────────────────────────

    /**
     * POST /api/chats
     * Creates a new chat document. Returns the new chat's ID.
     *
     * Body: { title, clientId?, projectId?, projectLabel? }
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createChat(
            @AuthenticationPrincipal AppUser user,
            @Valid @RequestBody CreateChatRequest req) throws Exception {
        String chatId = chatService.createChat(
                user,
                deidentifyTitle(user, req.getClientId(), req.getTitle()),
                req.getClientId(),
                req.getProjectId(),
                req.getProjectLabel(),
                req.getPolicyIds());
        return ResponseEntity.ok(Map.of("chatId", chatId));
    }

    // ── Update chat title ─────────────────────────────────────────────────

    /**
     * PATCH /api/chats/{chatId}
     * Update the chat title (owner or admin only).
     *
     * Body: { title }
     */
    @PatchMapping("/{chatId}")
    public ResponseEntity<Void> updateChat(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId,
            @RequestBody Map<String, String> body) throws Exception {
        boolean changed = false;
        String title = body.get("title");
        if (title != null && !title.isBlank()) {
            chatService.updateChatTitle(user, chatId, deidentifyTitle(user, body.get("clientId"), title));
            changed = true;
        }
        // clientId present (even empty string) means attach/detach a client.
        if (body.containsKey("clientId")) { chatService.setChatClient(user, chatId, body.get("clientId")); changed = true; }
        if (!changed) return ResponseEntity.badRequest().build();
        return ResponseEntity.noContent().build();
    }

    // ── Chat attachments (chat-scoped working documents) ──────────────────
    // Documents the user uploads to work with in THIS chat — persisted so they
    // survive across messages/refreshes and are auto-injected as context on every
    // message, but NOT stored in the client/project/knowledge libraries.

    /**
     * GET /api/chats/{chatId}/attachments
     * Lists the chat's working documents (id, name, content) — used to re-hydrate
     * them when the chat is opened.
     */
    @GetMapping("/{chatId}/attachments")
    public ResponseEntity<List<Map<String, Object>>> listAttachments(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId) throws Exception {
        return ResponseEntity.ok(chatService.getChatAttachments(user, chatId));
    }

    /**
     * POST /api/chats/{chatId}/attachments
     * Body: { name, content, sourceFilename? }  (content = already-extracted text)
     * Persists an uploaded document to this chat's working set.
     */
    @PostMapping("/{chatId}/attachments")
    public ResponseEntity<?> addAttachment(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId,
            @RequestBody Map<String, String> body) throws Exception {
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        String id = chatService.addChatAttachment(
                user, chatId, name, body.getOrDefault("content", ""), body.get("sourceFilename"));
        return ResponseEntity.ok(Map.of("id", id, "name", name));
    }

    /**
     * DELETE /api/chats/{chatId}/attachments/{attachmentId}
     * Removes one working document from the chat.
     */
    @DeleteMapping("/{chatId}/attachments/{attachmentId}")
    public ResponseEntity<Void> deleteAttachment(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId,
            @PathVariable String attachmentId) throws Exception {
        chatService.deleteChatAttachment(user, chatId, attachmentId);
        return ResponseEntity.noContent().build();
    }

    // ── Delete chat ───────────────────────────────────────────────────────

    /**
     * DELETE /api/chats/{chatId}
     * Deletes the chat and all its messages (owner or admin only).
     */
    @DeleteMapping("/{chatId}")
    public ResponseEntity<Void> deleteChat(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId) throws Exception {
        chatService.deleteChat(user, chatId);
        return ResponseEntity.noContent().build();
    }

    // ── Exception handling ────────────────────────────────────────────────

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(java.util.NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(java.util.NoSuchElementException ex) {
        return ResponseEntity.status(404).body(Map.of("error", ex.getMessage()));
    }
}
