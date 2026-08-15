package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.CreateChatRequest;
import ai.myaba.service.AuditService;
import ai.myaba.service.ChatService;
import ai.myaba.service.ClientService;
import ai.myaba.service.ContentNormalizationService;
import ai.myaba.service.DocumentFormatService;
import ai.myaba.service.GcsStorageService;
import ai.myaba.service.OrgService;
import ai.myaba.service.TranslationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
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
    private final GcsStorageService gcsStorageService;
    private final TranslationService translationService;
    private final DocumentFormatService documentFormatService;
    private final AuditService auditService;

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
     * GET /api/chats  (optionally ?projectId=…)
     * Returns the chats the authenticated user can access, newest first. With a
     * projectId, returns only that project's chats (server-side filter — avoids
     * shipping the whole chat list to the client to render one project's chats).
     */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listChats(
            @AuthenticationPrincipal AppUser user,
            @RequestParam(value = "projectId", required = false) String projectId) throws Exception {
        return ResponseEntity.ok(projectId != null && !projectId.isBlank()
                ? chatService.getChatsForProject(user, projectId)
                : chatService.getChats(user));
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
     * POST /api/chats/{chatId}/attachments/upload  (multipart: file)
     * Upload a file as a chat working document. Unlike the text-only attachment
     * endpoint, this STORES THE ORIGINAL in GCS (extracted text still feeds chat
     * context) — so the document can later be translated with its layout/branding
     * preserved. Owner/member only.
     */
    @PostMapping("/{chatId}/attachments/upload")
    public ResponseEntity<?> uploadAttachment(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        String filename = file.getOriginalFilename() == null ? "document" : file.getOriginalFilename();
        if (!isSupportedUpload(filename.toLowerCase())) {
            return ResponseEntity.badRequest().body(Map.of("error",
                    "Unsupported file type. Upload a Word (.docx), PDF, Excel (.xlsx/.xls), image, or text file."));
        }
        if (file.getSize() > 20L * 1024 * 1024) {
            return ResponseEntity.badRequest().body(Map.of("error", "File exceeds the 20 MB limit."));
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Could not read the uploaded file."));
        }
        try {
            String content = "";
            try { content = documentFormatService.extractText(filename, bytes, false); }
            catch (Exception e) { log.warn("Chat attachment text extraction failed for {}: {}", filename, e.getMessage()); }

            String attId = java.util.UUID.randomUUID().toString();
            String objectPath = gcsStorageService.chatObjectPath(user.getOrgId(), chatId, attId, filename);
            String gcsObject = gcsStorageService.upload(objectPath, file.getContentType(), bytes) ? objectPath : null;

            String id = chatService.addChatAttachmentWithOriginal(
                    user, chatId, attId, filename, content, filename, gcsObject, file.getContentType());
            return ResponseEntity.ok(Map.of(
                    "id", id, "name", filename, "content", content, "hasOriginal", gcsObject != null));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to modify this chat"));
        } catch (Exception e) {
            log.error("uploadAttachment failed chat={}: {}", chatId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload document"));
        }
    }

    /**
     * POST /api/chats/{chatId}/attachments/{attId}/translate  Body: { language }
     * Translate a chat attachment. Layout-preserving when an original is stored
     * (docx/pdf → same format); text fallback (→ .docx) otherwise. Read-gated;
     * nothing is stored — the translated file is returned base64 for download.
     */
    @PostMapping("/{chatId}/attachments/{attId}/translate")
    public ResponseEntity<?> translateAttachment(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String chatId,
            @PathVariable String attId,
            @RequestBody Map<String, String> body) {
        if (!translationService.isEnabled()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Document translation is not configured on the server."));
        }
        String lang = translationService.resolveLanguage(body == null ? null : body.get("language"));
        if (lang == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Unsupported language. Choose Spanish, Arabic, French, Chinese, or German."));
        }
        try {
            Map<String, Object> att = chatService.getChatAttachment(user, chatId, attId);
            if (att == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Attachment not found"));
            }
            String title      = String.valueOf(att.getOrDefault("name", att.getOrDefault("sourceFilename", "document")));
            String sourceName = String.valueOf(att.getOrDefault("sourceFilename", title));

            byte[] outBytes;
            String outMime;
            Object gcsObject = att.get("gcsObject");
            String srcMime   = TranslationService.docMime(sourceName);
            if (gcsObject instanceof String path && !path.isBlank() && srcMime != null) {
                byte[] src = gcsStorageService.download(user.getOrgId(), path);
                if (src == null) {
                    return ResponseEntity.status(HttpStatus.NOT_FOUND)
                            .body(Map.of("error", "The original file is unavailable for translation."));
                }
                var t = translationService.translateDocument(src, srcMime, lang);
                outBytes = t.bytes();
                outMime  = t.mimeType();
            } else {
                String text = String.valueOf(att.getOrDefault("content", ""));
                if (text.isBlank()) {
                    return ResponseEntity.badRequest().body(Map.of("error", "This document has no translatable text."));
                }
                String translated = translationService.translateText(text, lang);
                outBytes = documentFormatService.toDocx(title + " (" + translationService.label(lang) + ")", translated);
                outMime  = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            }

            String filename = TranslationService.outFilename(sourceName, lang, outMime);
            String preview  = "";
            try { preview = documentFormatService.extractText(filename, outBytes, false); }
            catch (Exception ignore) { /* preview is best-effort */ }

            auditService.log("CHAT_ATTACHMENT_TRANSLATED", user.getOrgId(), user.getUid(),
                    null, attId, null, "OK", lang);

            return ResponseEntity.ok(Map.of(
                    "language",      translationService.label(lang),
                    "filename",      filename,
                    "mimeType",      outMime,
                    "contentBase64", java.util.Base64.getEncoder().encodeToString(outBytes),
                    "previewText",   preview));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Not authorized to translate documents for this chat"));
        } catch (Exception e) {
            log.error("translateAttachment failed chat={} att={} lang={}: {}", chatId, attId, lang, e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Translation failed. Please try again."));
        }
    }

    private boolean isSupportedUpload(String lower) {
        return lower.endsWith(".docx") || lower.endsWith(".pdf") || lower.endsWith(".txt")
                || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".text")
                || lower.endsWith(".xlsx") || lower.endsWith(".xls")
                || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".bmp");
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
