package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.OrgAclxPolicyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST endpoints for the per-organisation ACLX policy layer.
 *
 * <p>All write endpoints require ORG_ADMIN or ORG_SUPER_ADMIN role
 * (enforced inside {@link OrgAclxPolicyService}).
 *
 * <pre>
 *   GET    /api/orgs/{orgId}/aclx-policy                 full policy document
 *   POST   /api/orgs/{orgId}/aclx-policy/rules           add / replace a rule
 *   DELETE /api/orgs/{orgId}/aclx-policy/rules/{ruleId}  remove a rule
 *   PUT    /api/orgs/{orgId}/aclx-policy/sensitivity      set escalation threshold
 * </pre>
 */
@RestController
@RequestMapping("/api/orgs")
@RequiredArgsConstructor
@Slf4j
public class OrgAclxPolicyController {

    private final OrgAclxPolicyService policyService;

    // ── GET full policy ───────────────────────────────────────────────────────

    @GetMapping("/{orgId}/aclx-policy")
    public ResponseEntity<?> getPolicy(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String orgId) {
        try {
            verifyOrgAccess(user, orgId);
            return ResponseEntity.ok(policyService.getPolicy(orgId));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("getPolicy failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to load org policy"));
        }
    }

    // ── Add / replace a rule ──────────────────────────────────────────────────

    /**
     * Body: {@code { type, slug, description, sourceReviewItemId? }}
     * Returns the newly created rule object.
     */
    @PostMapping("/{orgId}/aclx-policy/rules")
    public ResponseEntity<?> addRule(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String orgId,
            @RequestBody Map<String, String> body) {
        try {
            verifyOrgAccess(user, orgId);
            String type         = body.getOrDefault("type",        "").strip().toUpperCase();
            String slug         = body.getOrDefault("slug",        "").strip();
            String description  = body.getOrDefault("description", "").strip();
            String sourceItemId = body.get("sourceReviewItemId");

            if (slug.isBlank())        return ResponseEntity.badRequest().body(Map.of("error", "slug is required"));
            if (description.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "description is required"));

            Map<String, Object> rule = policyService.addRule(user, type, slug, description, sourceItemId);
            log.info("ACLX policy rule added: org={} type={} slug={}", orgId, type, slug);
            return ResponseEntity.ok(rule);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("addRule failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to save policy rule"));
        }
    }

    // ── Delete a rule ─────────────────────────────────────────────────────────

    @DeleteMapping("/{orgId}/aclx-policy/rules/{ruleId}")
    public ResponseEntity<?> removeRule(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String orgId,
            @PathVariable String ruleId) {
        try {
            verifyOrgAccess(user, orgId);
            policyService.removeRule(user, ruleId);
            log.info("ACLX policy rule removed: org={} ruleId={}", orgId, ruleId);
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("removeRule failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to remove policy rule"));
        }
    }

    // ── Set sensitivity threshold ─────────────────────────────────────────────

    /** Body: {@code { sensitivity: "HIGH" | "MEDIUM" | "LOW" }} */
    @PutMapping("/{orgId}/aclx-policy/sensitivity")
    public ResponseEntity<?> setSensitivity(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String orgId,
            @RequestBody Map<String, String> body) {
        try {
            verifyOrgAccess(user, orgId);
            String sensitivity = body.getOrDefault("sensitivity", "").strip().toUpperCase();
            if (sensitivity.isBlank())
                return ResponseEntity.badRequest().body(Map.of("error", "sensitivity is required"));

            policyService.setEscalateAtSensitivity(user, sensitivity);
            log.info("ACLX escalation threshold set: org={} sensitivity={}", orgId, sensitivity);
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("setSensitivity failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update sensitivity threshold"));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void verifyOrgAccess(AppUser user, String orgId) {
        if (!user.getOrgId().equals(orgId)) {
            throw new SecurityException("Access denied: org mismatch");
        }
    }
}
