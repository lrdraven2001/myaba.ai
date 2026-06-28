package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.CreateChatRequest;
import ai.myaba.service.ChatService;
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
                req.getTitle(),
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
        if (title != null && !title.isBlank()) { chatService.updateChatTitle(user, chatId, title); changed = true; }
        // clientId present (even empty string) means attach/detach a client.
        if (body.containsKey("clientId")) { chatService.setChatClient(user, chatId, body.get("clientId")); changed = true; }
        if (!changed) return ResponseEntity.badRequest().build();
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
