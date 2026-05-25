package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.TemplateRequest;
import ai.myaba.service.TemplateService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for clinical template management.
 *
 * All routes are under /api/templates.
 *
 * Read:  any authenticated org member (filtered by visibleToRoles).
 * Write: ORG_ADMIN / ORG_SUPER_ADMIN only.
 */
@RestController
@RequestMapping("/api/templates")
@RequiredArgsConstructor
@Slf4j
public class TemplateController {

    private final TemplateService templateService;

    // ── Read endpoints ────────────────────────────────────────────────────

    /**
     * GET /api/templates
     * Returns templates visible to the requesting user (filtered by role).
     */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listTemplates(
            @AuthenticationPrincipal AppUser user) throws Exception {
        return ResponseEntity.ok(templateService.getTemplates(user));
    }

    /**
     * GET /api/templates/{templateId}
     */
    @GetMapping("/{templateId}")
    public ResponseEntity<Map<String, Object>> getTemplate(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String templateId) throws Exception {
        return ResponseEntity.ok(templateService.getTemplate(user, templateId));
    }

    // ── Admin write endpoints ─────────────────────────────────────────────

    /**
     * POST /api/templates   (ORG_ADMIN only)
     * Body: { title, category, content?, visibleToRoles? }
     */
    @PostMapping
    public ResponseEntity<?> createTemplate(
            @AuthenticationPrincipal AppUser user,
            @Valid @RequestBody TemplateRequest req) throws Exception {
        if (!user.isAdmin())
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        String templateId = templateService.createTemplate(user, req);
        return ResponseEntity.ok(Map.of("templateId", templateId));
    }

    /**
     * PUT /api/templates/{templateId}   (ORG_ADMIN only)
     */
    @PutMapping("/{templateId}")
    public ResponseEntity<?> updateTemplate(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String templateId,
            @RequestBody TemplateRequest req) throws Exception {
        if (!user.isAdmin())
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        templateService.updateTemplate(user, templateId, req);
        return ResponseEntity.noContent().build();
    }

    /**
     * DELETE /api/templates/{templateId}   (ORG_ADMIN only)
     */
    @DeleteMapping("/{templateId}")
    public ResponseEntity<?> deleteTemplate(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String templateId) throws Exception {
        if (!user.isAdmin())
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        templateService.deleteTemplate(user, templateId);
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
