package ai.myaba.controller;

import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ClientRequest;
import ai.myaba.model.dto.UserRole;
import ai.myaba.service.AuditService;
import ai.myaba.service.AuthorizationService;
import ai.myaba.service.ChatService;
import ai.myaba.service.ClientService;
import ai.myaba.service.DocumentFormatService;
import ai.myaba.service.TranslationService;
import ai.myaba.service.DocumentPersistenceService;
import ai.myaba.service.OrgService;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
@Slf4j
public class ClientController {

    private final ClientService clientService;
    private final AuthorizationService authorizationService;
    private final AuditService auditService;
    private final OrgService orgService;
    private final ChatService chatService;
    private final DocumentFormatService documentFormatService;
    private final DocumentPersistenceService documentPersistenceService;
    private final ai.myaba.service.GcsStorageService gcsStorageService;
    private final ai.myaba.service.TranslationService translationService;

    @org.springframework.beans.factory.annotation.Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /** Returns a 403 response if the org's BAA has not been signed, null otherwise. */
    private ResponseEntity<?> baaGate(AppUser user) {
        if (!orgService.isBaaAccepted(user.getOrgId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "BAA_NOT_SIGNED",
                                 "message", "Your organization's Business Associate Agreement has not been signed. A Clinical Director must sign the BAA before client records can be accessed."));
        }
        return null;
    }

    // ── GET /api/clients ─────────────────────────────────────────────────
    // Returns only clients the requesting user is authorized to see.

    @GetMapping
    public ResponseEntity<?> getClients(@AuthenticationPrincipal AppUser user) {
        ResponseEntity<?> gate = baaGate(user);
        if (gate != null) return gate;
        try {
            List<Map<String, Object>> clients = clientService.getAuthorizedClients(user);
            return ResponseEntity.ok(clients);
        } catch (Exception e) {
            log.error("getClients failed for org {}: {}", user.getOrgId(), e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch clients"));
        }
    }

    // ── GET /api/clients/{clientId} ───────────────────────────────────────

    @GetMapping("/{clientId}")
    public ResponseEntity<?> getClient(@PathVariable String clientId,
                                        @AuthenticationPrincipal AppUser user) {
        ResponseEntity<?> gate = baaGate(user);
        if (gate != null) return gate;
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);

            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to access this client"));
            }

            auditService.log("CLIENT_ACCESSED", user.getOrgId(), user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(client);

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("getClient failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch client"));
        }
    }

    // ── POST /api/clients ─────────────────────────────────────────────────
    // Only BCBA roles and ORG_ADMIN can create client records.

    @PostMapping
    public ResponseEntity<?> createClient(@Valid @RequestBody ClientRequest req,
                                           @AuthenticationPrincipal AppUser user) {
        ResponseEntity<?> baaCheck = baaGate(user);
        if (baaCheck != null) return baaCheck;
        // Capability-based (not a built-in role-name check) so custom PHI-access roles can
        // create clients and become the treating BCBA — consistent with the assignment rule.
        if (!user.hasPhiAccess() && !user.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only clinical staff or admins can create client records"));
        }
        try {
            String clientId = clientService.createClient(user.getOrgId(), user.getUid(), user.isAdmin(), req);
            auditService.log("CLIENT_CREATED", user.getOrgId(), user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("clientId", clientId));
        } catch (Exception e) {
            log.error("createClient failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to create client"));
        }
    }

    // ── PUT /api/clients/{clientId} ───────────────────────────────────────

    @PutMapping("/{clientId}")
    public ResponseEntity<?> updateClient(@PathVariable String clientId,
                                           @Valid @RequestBody ClientRequest req,
                                           @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);

            if (!authorizationService.canEditClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to edit this client"));
            }

            clientService.updateClient(user.getOrgId(), clientId, req);
            auditService.log("CLIENT_UPDATED", user.getOrgId(), user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(Map.of("success", true));

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("updateClient failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update client"));
        }
    }

    // ── PUT /api/clients/{clientId}/archive ───────────────────────────────
    // Archive or unarchive a client. Body: { archived: boolean }.

    @PutMapping("/{clientId}/archive")
    public ResponseEntity<?> archiveClient(@PathVariable String clientId,
                                           @RequestBody Map<String, Object> body,
                                           @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canEditClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to archive this client"));
            }
            boolean archived = Boolean.TRUE.equals(body.get("archived"));
            clientService.setArchived(user.getOrgId(), clientId, archived);
            auditService.log(archived ? "CLIENT_ARCHIVED" : "CLIENT_UNARCHIVED",
                    user.getOrgId(), user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(Map.of("success", true, "archived", archived));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("archiveClient failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to archive client"));
        }
    }

    // ── POST /api/clients/{clientId}/documents/upload ─────────────────────
    // Direct document upload (Word/PDF/Excel/text). The file's text is
    // extracted server-side and stored alongside AI-generated documents.

    @PostMapping("/{clientId}/documents/upload")
    public ResponseEntity<?> uploadClientDocument(
            @PathVariable String clientId,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            // Saving to a client's permanent record is a WRITE — require edit access
            // (treating/supervising BCBA or admin), not mere read access.
            if (!authorizationService.canEditClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to add documents for this client"));
            }
            String filename = file.getOriginalFilename() == null ? "document" : file.getOriginalFilename();
            if (file.getSize() > 20L * 1024 * 1024) {
                return ResponseEntity.badRequest().body(Map.of("error", "File exceeds the 20 MB limit."));
            }
            byte[] bytes;
            try {
                bytes = file.getBytes();
            } catch (Exception e) {
                return ResponseEntity.badRequest().body(Map.of("error", "Could not read the uploaded file."));
            }
            String contentType = file.getContentType();
            String docTitle = (title != null && !title.isBlank())
                    ? title.trim()
                    : filename.replaceAll("\\.[A-Za-z0-9]+$", "");
            // Async: create a PROCESSING placeholder now (appears immediately in the
            // Documents tab), store the original in GCS + extract text in the
            // background. Large/scanned uploads no longer time the request out — the
            // doc flips to READY when done.
            String docId = documentPersistenceService.createUploadPlaceholder(
                    user.getOrgId(), clientId, user.getUid(), docTitle, filename);
            if (docId == null) {
                return ResponseEntity.internalServerError().body(Map.of("error", "Failed to save document"));
            }
            documentPersistenceService.finalizeUpload(user.getOrgId(), clientId, docId, filename, contentType, bytes);
            auditService.log("CLIENT_DOCUMENT_UPLOADED", user.getOrgId(), user.getUid(),
                    clientId, docId, null, null, null);
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(Map.of("docId", docId, "title", docTitle, "status", "PROCESSING"));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("uploadClientDocument failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload document"));
        }
    }

    // ── GET /api/clients/{clientId}/export ────────────────────────────────
    // Exports a client's full record (demographics, treatment team, chats with
    // their message history, and generated documents with content) as a single
    // downloadable JSON file. Used for archiving / record portability.
    // Gated to staff who can edit the client (owner / supervisor / admin).

    @GetMapping("/{clientId}/export")
    public ResponseEntity<?> exportClient(@PathVariable String clientId,
                                          @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canEditClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to export this client"));
            }

            Map<String, Object> archive = new java.util.LinkedHashMap<>();
            archive.put("exportedAt", java.time.Instant.now().toString());
            archive.put("exportedBy", user.getUid());
            archive.put("orgId", user.getOrgId());
            archive.put("client", client);

            // Treatment team — resolve assigned member IDs to names/emails.
            if (!devMode) {
                try {
                    Map<String, Map<String, Object>> memberById = new java.util.HashMap<>();
                    for (Map<String, Object> m : orgService.getOrgMembers(user.getOrgId())) {
                        memberById.put(String.valueOf(m.get("id")), m);
                    }
                    List<Map<String, Object>> team = new java.util.ArrayList<>();
                    for (String uid : collectTeamIds(client)) {
                        Map<String, Object> m = memberById.get(uid);
                        Map<String, Object> entry = new java.util.LinkedHashMap<>();
                        entry.put("id", uid);
                        if (m != null) {
                            entry.put("name", m.getOrDefault("displayName", m.getOrDefault("email", uid)));
                            entry.put("email", m.get("email"));
                            entry.put("role", m.get("role"));
                        }
                        team.add(entry);
                    }
                    archive.put("treatmentTeam", team);
                } catch (Exception e) {
                    log.warn("export: team resolution failed for {}: {}", clientId, e.getMessage());
                }
            }

            // Chats scoped to this client, each with its full message history.
            // Uses the client-record fetch (all authors) — the export is already
            // gated by canEditClient above and audited (CLIENT_EXPORTED).
            List<Map<String, Object>> chatExport = new java.util.ArrayList<>();
            for (Map<String, Object> chat : chatService.getChatsForClient(user.getOrgId(), clientId)) {
                Map<String, Object> c = new java.util.LinkedHashMap<>(chat);
                try {
                    c.put("messages", chatService.getMessagesForChat(user.getOrgId(), String.valueOf(chat.get("id"))));
                } catch (Exception e) {
                    c.put("messages", List.of());
                }
                chatExport.add(c);
            }
            archive.put("chats", chatExport);

            // Generated documents (full content included). Stored under the
            // parallel "orgs" tree — matches getClientDocuments / DocumentPersistenceService.
            List<Map<String, Object>> docExport = new java.util.ArrayList<>();
            if (!devMode) {
                Firestore db = FirestoreClient.getFirestore();
                List<QueryDocumentSnapshot> docs = db
                        .collection(FirestoreCollections.DOCUMENTS_ROOT).document(user.getOrgId())
                        .collection(FirestoreCollections.CLIENTS).document(clientId)
                        .collection(FirestoreCollections.DOCUMENTS)
                        .orderBy("createdAtMs", com.google.cloud.firestore.Query.Direction.DESCENDING)
                        .get().get().getDocuments();
                for (QueryDocumentSnapshot doc : docs) {
                    Map<String, Object> data = new java.util.LinkedHashMap<>(doc.getData());
                    data.put("id", doc.getId());
                    docExport.add(data);
                }
            }
            archive.put("documents", docExport);

            auditService.log("CLIENT_EXPORTED", user.getOrgId(), user.getUid(), clientId, null, null, null, null);

            String fname = "client-" + clientId + "-archive.json";
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"" + fname + "\"")
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .body(archive);

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("exportClient failed {} / {}: {}", user.getOrgId(), clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to export client"));
        }
    }

    /** Collect the distinct member UIDs assigned to a client's treatment team. */
    @SuppressWarnings("unchecked")
    private static List<String> collectTeamIds(Map<String, Object> client) {
        java.util.LinkedHashSet<String> ids = new java.util.LinkedHashSet<>();
        Object t = client.get("treatingBcbaId");
        if (t instanceof String s && !s.isBlank()) ids.add(s);
        Object sup = client.get("supervisingBcbaId");
        if (sup instanceof String s && !s.isBlank()) ids.add(s);
        for (String key : List.of("supervisorIds", "rbtIds", "viewerIds")) {
            Object v = client.get(key);
            if (v instanceof List<?> list) {
                for (Object o : list) if (o != null) ids.add(String.valueOf(o));
            }
        }
        return new java.util.ArrayList<>(ids);
    }

    // ── PUT /api/clients/{clientId}/authorizations ────────────────────────
    // Update caseload assignments (treating BCBA, RBTs, supervising BCBA).
    // Only the treating/supervising BCBA or ORG_ADMIN may reassign.

    @PutMapping("/{clientId}/authorizations")
    public ResponseEntity<?> updateAuthorizations(
            @PathVariable String clientId,
            @RequestBody AuthorizationsRequest req,
            @AuthenticationPrincipal AppUser user) {

        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);

            if (!authorizationService.canManageClientAuthorizations(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to manage assignments for this client"));
            }

            clientService.updateAuthorizations(
                    user.getOrgId(), clientId,
                    req.getTreatingBcbaId(),
                    req.getSupervisorIds(),
                    req.getSupervisingBcbaId(),
                    req.getRbtIds(),
                    req.getViewerIds()
            );

            auditService.log("CLIENT_AUTHORIZATIONS_UPDATED", user.getOrgId(), user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(Map.of("success", true));

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (IllegalArgumentException e) {
            // Slot-eligibility guard rejected an assignee (role doesn't qualify for the slot).
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", e.getMessage(), "code", "INELIGIBLE_ASSIGNEE"));
        } catch (Exception e) {
            log.error("updateAuthorizations failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update authorizations"));
        }
    }

    // ── GET /api/clients/{clientId}/documents ────────────────────────────────
    //
    // Lists AI-generated documents persisted for this client.
    // Returns metadata only — no full content — sorted newest-first.

    @GetMapping("/{clientId}/documents")
    public ResponseEntity<?> getClientDocuments(
            @PathVariable String clientId,
            @AuthenticationPrincipal AppUser user) {

        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to view documents for this client"));
            }

            if (devMode) {
                return ResponseEntity.ok(Map.of("documents", List.of()));
            }

            Firestore db = FirestoreClient.getFirestore();
            List<QueryDocumentSnapshot> docs = db
                    .collection(FirestoreCollections.DOCUMENTS_ROOT).document(user.getOrgId())
                    .collection(FirestoreCollections.CLIENTS).document(clientId)
                    .collection(FirestoreCollections.DOCUMENTS)
                    .orderBy("createdAtMs", com.google.cloud.firestore.Query.Direction.DESCENDING)
                    .limit(50)
                    .get().get().getDocuments();

            List<Map<String, Object>> result = docs.stream()
                    .map(doc -> {
                        Map<String, Object> data = new java.util.LinkedHashMap<>(doc.getData());
                        data.put("id", doc.getId());
                        // Remove raw content from list view — fetch by ID for full content
                        data.remove("content");
                        data.remove("aclxContentLabel");
                        return data;
                    })
                    .toList();

            return ResponseEntity.ok(Map.of("documents", result));

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("getClientDocuments failed {} / {}: {}", user.getOrgId(), clientId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to load documents"));
        }
    }

    // ── GET /api/clients/{clientId}/documents/{docId} ─────────────────────────
    // Returns a single persisted document INCLUDING its content, so it can be
    // attached as chat context. Authorized clinical staff receive the full text.
    @GetMapping("/{clientId}/documents/{docId}")
    public ResponseEntity<?> getClientDocument(
            @PathVariable String clientId,
            @PathVariable String docId,
            @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to view documents for this client"));
            }
            if (devMode) {
                return ResponseEntity.ok(Map.of("id", docId, "content", ""));
            }
            Firestore db = FirestoreClient.getFirestore();
            com.google.cloud.firestore.DocumentSnapshot snap = db
                    .collection(FirestoreCollections.DOCUMENTS_ROOT).document(user.getOrgId())
                    .collection(FirestoreCollections.CLIENTS).document(clientId)
                    .collection(FirestoreCollections.DOCUMENTS).document(docId)
                    .get().get();
            if (!snap.exists()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Document not found"));
            }
            Map<String, Object> data = new java.util.LinkedHashMap<>(snap.getData());
            data.put("id", snap.getId());
            data.remove("aclxContentLabel"); // signing artefact — not needed by the client
            return ResponseEntity.ok(data);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("getClientDocument failed {} / {} / {}: {}", user.getOrgId(), clientId, docId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to load document"));
        }
    }

    // ── GET /api/clients/{clientId}/documents/{docId}/original ────────────────
    // Returns a short-lived signed URL to download the ORIGINAL uploaded file
    // from GCS. Read-gated (canAccessClient). 404 if no original was stored
    // (text-only legacy doc); 503 if GCS/signing isn't configured yet.
    @GetMapping("/{clientId}/documents/{docId}/original")
    public ResponseEntity<?> getClientDocumentOriginal(
            @PathVariable String clientId,
            @PathVariable String docId,
            @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to view documents for this client"));
            }
            Map<String, Object> doc = documentPersistenceService.getDocument(user.getOrgId(), clientId, docId);
            if (doc == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Document not found"));
            }
            Object gcsObject = doc.get("gcsObject");
            if (!(gcsObject instanceof String path) || path.isBlank()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "No original file is stored for this document"));
            }
            String filename = String.valueOf(doc.getOrDefault("sourceFilename",
                    doc.getOrDefault("title", "document")));
            String url = gcsStorageService.signedDownloadUrl(user.getOrgId(), path, filename);
            if (url == null) {
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body(Map.of("error", "Document download is not available yet. Storage is not fully configured."));
            }
            auditService.log("CLIENT_DOCUMENT_DOWNLOADED", user.getOrgId(), user.getUid(),
                    clientId, docId, null, null, null);
            return ResponseEntity.ok(Map.of("url", url));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("getClientDocumentOriginal failed {}/{}: {}", clientId, docId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to prepare download"));
        }
    }

    // ── POST /api/clients/{clientId}/documents/{docId}/translate ──────────────
    // Translate a client document into a target language via Cloud Translation
    // Advanced (layout preserved for docx/pdf; text fallback for legacy docs).
    // Returns the translated file (base64) + a text preview for the modal —
    // nothing is stored. Read-gated (canAccessClient); audited.
    @PostMapping("/{clientId}/documents/{docId}/translate")
    public ResponseEntity<?> translateClientDocument(
            @PathVariable String clientId,
            @PathVariable String docId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
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
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to translate documents for this client"));
            }
            Map<String, Object> doc = documentPersistenceService.getDocument(user.getOrgId(), clientId, docId);
            if (doc == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Document not found"));
            }
            String title      = String.valueOf(doc.getOrDefault("title", doc.getOrDefault("sourceFilename", "document")));
            String sourceName = String.valueOf(doc.getOrDefault("sourceFilename", title));

            byte[] outBytes;
            String outMime;
            Object gcsObject = doc.get("gcsObject");
            String srcMime   = TranslationService.docMime(sourceName);
            if (gcsObject instanceof String path && !path.isBlank() && srcMime != null) {
                // Layout-preserving: translate the original docx/pdf in place.
                byte[] src = gcsStorageService.download(user.getOrgId(), path);
                if (src == null) {
                    return ResponseEntity.status(HttpStatus.NOT_FOUND)
                            .body(Map.of("error", "The original file is unavailable for translation."));
                }
                var t = translationService.translateDocument(src, srcMime, lang);
                outBytes = t.bytes();
                outMime  = t.mimeType();
            } else {
                // Fallback: translate the extracted text and render a clean .docx.
                String text = String.valueOf(doc.getOrDefault("content", ""));
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

            auditService.log("CLIENT_DOCUMENT_TRANSLATED", user.getOrgId(), user.getUid(),
                    clientId, docId, null, null, null);

            return ResponseEntity.ok(Map.of(
                    "language",      translationService.label(lang),
                    "filename",      filename,
                    "mimeType",      outMime,
                    "contentBase64", java.util.Base64.getEncoder().encodeToString(outBytes),
                    "previewText",   preview));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("translateClientDocument failed {}/{} lang={}: {}", clientId, docId, lang, e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Translation failed. Please try again."));
        }
    }

    // ── DELETE /api/clients/{clientId}/documents/{docId} ──────────────────────
    // Removes a stored document (Firestore record + GCS original). Write-gated
    // (canEditClient). Backs the chat "Undo" affordance and document management.
    @DeleteMapping("/{clientId}/documents/{docId}")
    public ResponseEntity<?> deleteClientDocument(
            @PathVariable String clientId,
            @PathVariable String docId,
            @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canEditClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to delete documents for this client"));
            }
            boolean deleted = documentPersistenceService.deleteDocument(user.getOrgId(), clientId, docId);
            if (!deleted) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Document not found"));
            }
            auditService.log("CLIENT_DOCUMENT_DELETED", user.getOrgId(), user.getUid(),
                    clientId, docId, null, null, null);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("deleteClientDocument failed {}/{}: {}", clientId, docId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to delete document"));
        }
    }

    // ── Inner DTO ─────────────────────────────────────────────────────────

    @lombok.Data
    static class AuthorizationsRequest {
        private String treatingBcbaId;
        /** All supervisors on the case (roster). */
        private List<String> supervisorIds;
        /** Current / primary supervisor — must be one of supervisorIds. */
        private String supervisingBcbaId;
        private List<String> rbtIds;
        private List<String> viewerIds;
    }
}
