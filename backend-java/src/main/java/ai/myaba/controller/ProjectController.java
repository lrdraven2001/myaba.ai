package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ProjectRequest;
import ai.myaba.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for project management.
 *
 * All routes are under /api/projects.
 * Any authenticated org member may create a project.
 * Only the project owner or ORG_ADMIN can update, share, or delete.
 */
@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
@Slf4j
public class ProjectController {

    private final ProjectService projectService;
    private final ai.myaba.service.GcsStorageService gcsStorageService;

    // ── List ──────────────────────────────────────────────────────────────

    /**
     * GET /api/projects
     * Returns all projects the user owns or is a member of.
     */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listProjects(
            @AuthenticationPrincipal AppUser user) throws Exception {
        return ResponseEntity.ok(projectService.getProjects(user));
    }

    // ── Get single ────────────────────────────────────────────────────────

    /**
     * GET /api/projects/{projectId}
     */
    @GetMapping("/{projectId}")
    public ResponseEntity<Map<String, Object>> getProject(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId) throws Exception {
        return ResponseEntity.ok(projectService.getProject(user, projectId));
    }

    // ── Create ────────────────────────────────────────────────────────────

    /**
     * POST /api/projects
     * Body: { title, description?, clientIds?, isShared?, members? }
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createProject(
            @AuthenticationPrincipal AppUser user,
            @Valid @RequestBody ProjectRequest req) throws Exception {
        String projectId = projectService.createProject(user, req);
        return ResponseEntity.ok(Map.of("projectId", projectId));
    }

    // ── Update ────────────────────────────────────────────────────────────

    /**
     * PUT /api/projects/{projectId}
     * Update title, description, clientIds, or isShared (owner or admin).
     */
    @PutMapping("/{projectId}")
    public ResponseEntity<Void> updateProject(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @RequestBody ProjectRequest req) throws Exception {
        projectService.updateProject(user, projectId, req);
        return ResponseEntity.noContent().build();
    }

    // ── Share ─────────────────────────────────────────────────────────────

    /**
     * PUT /api/projects/{projectId}/members/{userId}
     * Body: { role: "editor" | "viewer" }
     * Adds or updates a member's access level (owner or admin).
     */
    @PutMapping("/{projectId}/members/{userId}")
    public ResponseEntity<Void> addMember(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @PathVariable String userId,
            @RequestBody Map<String, String> body) throws Exception {
        String role = body.get("role");
        if (role == null) return ResponseEntity.badRequest().build();
        projectService.shareMember(user, projectId, userId, role);
        return ResponseEntity.noContent().build();
    }

    /**
     * DELETE /api/projects/{projectId}/members/{userId}
     * Removes a member from the project (owner or admin).
     */
    @DeleteMapping("/{projectId}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @PathVariable String userId) throws Exception {
        projectService.shareMember(user, projectId, userId, null);
        return ResponseEntity.noContent().build();
    }

    // ── Knowledge docs ────────────────────────────────────────────────────

    /**
     * GET /api/projects/{projectId}/knowledge
     * Lists all knowledge documents attached to the project.
     */
    @GetMapping("/{projectId}/knowledge")
    public ResponseEntity<List<Map<String, Object>>> listKnowledge(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId) throws Exception {
        return ResponseEntity.ok(projectService.getKnowledgeDocs(user, projectId));
    }

    /**
     * POST /api/projects/{projectId}/knowledge
     * Body: { title, textContent, sourceFilename?, containsPhi? }
     * Adds a knowledge document to the project.
     */
    @PostMapping("/{projectId}/knowledge")
    public ResponseEntity<Map<String, Object>> addKnowledge(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @RequestBody Map<String, Object> body) throws Exception {
        String title = body.get("title") != null ? String.valueOf(body.get("title")) : null;
        String textContent = body.get("textContent") != null ? String.valueOf(body.get("textContent")) : "";
        String sourceFilename = body.get("sourceFilename") != null ? String.valueOf(body.get("sourceFilename")) : null;
        boolean containsPhi = Boolean.TRUE.equals(body.get("containsPhi"));
        if (title == null || title.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "title is required"));
        }
        String docId = projectService.addKnowledgeDoc(user, projectId, title, textContent, sourceFilename, containsPhi);
        return ResponseEntity.ok(Map.of("docId", docId));
    }

    /**
     * DELETE /api/projects/{projectId}/knowledge/{docId}
     * Removes a knowledge document from the project.
     */
    @DeleteMapping("/{projectId}/knowledge/{docId}")
    public ResponseEntity<Void> removeKnowledge(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @PathVariable String docId) throws Exception {
        projectService.removeKnowledgeDoc(user, projectId, docId);
        return ResponseEntity.noContent().build();
    }

    /**
     * PATCH /api/projects/{projectId}/knowledge/{docId}  Body: { description?, containsPhi? }
     * Update a knowledge document's editable metadata (description + per-document PHI flag).
     */
    @PatchMapping("/{projectId}/knowledge/{docId}")
    public ResponseEntity<Void> updateKnowledge(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @PathVariable String docId,
            @RequestBody Map<String, Object> body) throws Exception {
        String description = body.get("description") instanceof String s ? s : null;
        Boolean containsPhi = body.get("containsPhi") instanceof Boolean b ? b : null;
        projectService.updateKnowledgeDoc(user, projectId, docId, description, containsPhi);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/projects/{projectId}/knowledge/upload  (multipart: file, title?)
     * Upload a PDF/DOC(X)/Excel/image/text file as project knowledge — parity with
     * client document upload. The original is stored in GCS and the extracted text
     * in Firestore (async). Edit-gated; requires the project to be PHI-flagged.
     */
    @PostMapping("/{projectId}/knowledge/upload")
    public ResponseEntity<?> uploadKnowledge(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam(value = "title", required = false) String title) {
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
        String docTitle = (title != null && !title.isBlank())
                ? title.trim() : filename.replaceAll("\\.[A-Za-z0-9]+$", "");
        try {
            String docId = projectService.createKnowledgePlaceholder(user, projectId, docTitle, filename);
            projectService.finalizeKnowledgeUpload(
                    user.getOrgId(), projectId, docId, filename, file.getContentType(), bytes);
            return ResponseEntity.status(org.springframework.http.HttpStatus.ACCEPTED)
                    .body(Map.of("docId", docId, "title", docTitle, "status", "PROCESSING"));
        } catch (SecurityException e) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Not authorized to add documents to this project"));
        } catch (IllegalStateException e) {
            if ("PHI_NOT_ENABLED".equals(e.getMessage())) {
                return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).body(Map.of(
                        "error", "This project isn't marked as containing PHI. Enable PHI on the project "
                                + "before saving clinical documents to it.",
                        "code",  "PHI_NOT_ENABLED"));
            }
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        } catch (java.util.NoSuchElementException e) {
            return ResponseEntity.status(404).body(Map.of("error", "Project not found"));
        } catch (Exception e) {
            log.error("uploadKnowledge failed project={}: {}", projectId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload document"));
        }
    }

    /**
     * GET /api/projects/{projectId}/knowledge/{docId}/original
     * Short-lived signed URL to download the original uploaded file from GCS.
     * Read-gated. 404 if no original stored; 503 if GCS/signing isn't configured.
     */
    @GetMapping("/{projectId}/knowledge/{docId}/original")
    public ResponseEntity<?> getKnowledgeOriginal(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @PathVariable String docId) throws Exception {
        Map<String, Object> doc = projectService.getKnowledgeDoc(user, projectId, docId);
        if (doc == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Document not found"));
        }
        Object gcsObject = doc.get("gcsObject");
        if (!(gcsObject instanceof String path) || path.isBlank()) {
            return ResponseEntity.status(404).body(Map.of("error", "No original file is stored for this document"));
        }
        String filename = String.valueOf(doc.getOrDefault("sourceFilename", doc.getOrDefault("title", "document")));
        String url = gcsStorageService.signedDownloadUrl(user.getOrgId(), path, filename);
        if (url == null) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Document download is not available yet. Storage is not fully configured."));
        }
        return ResponseEntity.ok(Map.of("url", url));
    }

    /**
     * GET /api/projects/{projectId}/members
     * Lists the project's members (owner + explicit members) with roles.
     */
    @GetMapping("/{projectId}/members")
    public ResponseEntity<List<Map<String, Object>>> listMembers(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId) throws Exception {
        return ResponseEntity.ok(projectService.getProjectMembers(user, projectId));
    }

    private boolean isSupportedUpload(String lower) {
        return lower.endsWith(".docx") || lower.endsWith(".pdf") || lower.endsWith(".txt")
                || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".text")
                || lower.endsWith(".xlsx") || lower.endsWith(".xls")
                || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".bmp");
    }

    // ── Delete ────────────────────────────────────────────────────────────

    /**
     * DELETE /api/projects/{projectId}
     * Deletes the project (owner or admin).
     */
    @DeleteMapping("/{projectId}")
    public ResponseEntity<Void> deleteProject(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId) throws Exception {
        projectService.deleteProject(user, projectId);
        return ResponseEntity.noContent().build();
    }

    // ── Trash / restore (super admin, 48h window) ─────────────────────────

    /** GET /api/projects/trash — soft-deleted projects still restorable. Super admin only. */
    @GetMapping("/trash")
    public ResponseEntity<List<Map<String, Object>>> getTrash(
            @AuthenticationPrincipal AppUser user) throws Exception {
        return ResponseEntity.ok(projectService.getTrashedProjects(user));
    }

    /** POST /api/projects/{projectId}/restore — restore a soft-deleted project. Super admin only. */
    @PostMapping("/{projectId}/restore")
    public ResponseEntity<Map<String, Object>> restoreProject(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId) throws Exception {
        projectService.restoreProject(user, projectId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ── Exception handling ────────────────────────────────────────────────

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleConflict(IllegalStateException ex) {
        return ResponseEntity.status(409).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(java.util.NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(java.util.NoSuchElementException ex) {
        return ResponseEntity.status(404).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadArg(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
