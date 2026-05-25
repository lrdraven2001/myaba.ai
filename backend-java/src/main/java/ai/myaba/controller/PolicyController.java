package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.PolicyRequest;
import ai.myaba.service.PolicyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for organizational policy management.
 *
 * All routes are under /api/policies.
 *
 * Read:  any authenticated org member (active policies only for non-admins).
 * Write: ORG_ADMIN / ORG_SUPER_ADMIN only.
 */
@RestController
@RequestMapping("/api/policies")
@RequiredArgsConstructor
@Slf4j
public class PolicyController {

    private final PolicyService policyService;

    // ── Read endpoints ────────────────────────────────────────────────────

    /**
     * GET /api/policies
     * Returns all active policies (admins also see inactive ones).
     */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listPolicies(
            @AuthenticationPrincipal AppUser user) throws Exception {
        return ResponseEntity.ok(policyService.getPolicies(user));
    }

    /**
     * GET /api/policies/{policyId}
     */
    @GetMapping("/{policyId}")
    public ResponseEntity<Map<String, Object>> getPolicy(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String policyId) throws Exception {
        return ResponseEntity.ok(policyService.getPolicy(user, policyId));
    }

    // ── Admin write endpoints ─────────────────────────────────────────────

    /**
     * POST /api/policies   (ORG_ADMIN only)
     * Body: { title, category, textContent?, isActive? }
     */
    @PostMapping
    public ResponseEntity<?> createPolicy(
            @AuthenticationPrincipal AppUser user,
            @Valid @RequestBody PolicyRequest req) throws Exception {
        if (!user.isAdmin())
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        String policyId = policyService.createPolicy(user, req);
        return ResponseEntity.ok(Map.of("policyId", policyId));
    }

    /**
     * PUT /api/policies/{policyId}   (ORG_ADMIN only)
     */
    @PutMapping("/{policyId}")
    public ResponseEntity<?> updatePolicy(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String policyId,
            @RequestBody PolicyRequest req) throws Exception {
        if (!user.isAdmin())
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        policyService.updatePolicy(user, policyId, req);
        return ResponseEntity.noContent().build();
    }

    /**
     * DELETE /api/policies/{policyId}   (ORG_ADMIN only)
     */
    @DeleteMapping("/{policyId}")
    public ResponseEntity<?> deletePolicy(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String policyId,
            @RequestBody(required = false) PolicyRequest req) throws Exception {
        if (!user.isAdmin())
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        policyService.deletePolicy(user, policyId);
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
