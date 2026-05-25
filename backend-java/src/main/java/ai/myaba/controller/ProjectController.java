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
     * Body: { title, textContent }
     * Adds a knowledge document to the project.
     */
    @PostMapping("/{projectId}/knowledge")
    public ResponseEntity<Map<String, Object>> addKnowledge(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String projectId,
            @RequestBody Map<String, String> body) throws Exception {
        String title = body.get("title");
        String textContent = body.getOrDefault("textContent", "");
        if (title == null || title.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "title is required"));
        }
        String docId = projectService.addKnowledgeDoc(user, projectId, title, textContent);
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

    // ── Exception handling ────────────────────────────────────────────────

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
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
