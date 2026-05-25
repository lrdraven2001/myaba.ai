package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.FederationConfigRequest;
import ai.myaba.model.dto.UserRole;
import ai.myaba.service.FederationService;
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

/**
 * REST endpoints for enterprise federation (OIDC/SAML IdP) configuration.
 * All routes require ORG_SUPER_ADMIN role within the specified org.
 *
 * GET    /api/orgs/{orgId}/federation              — list configs
 * POST   /api/orgs/{orgId}/federation              — create config
 * PUT    /api/orgs/{orgId}/federation/{configId}   — update config
 * DELETE /api/orgs/{orgId}/federation/{configId}   — delete config
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/federation")
@RequiredArgsConstructor
@Slf4j
public class FederationController {

    private final FederationService federationService;

    // ── List configs ──────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<?> getConfigs(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        try {
            List<Map<String, Object>> configs = federationService.getConfigs(orgId);
            return ResponseEntity.ok(configs);
        } catch (Exception e) {
            log.error("Failed to list federation configs for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to retrieve federation configurations"));
        }
    }

    // ── Create config ─────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<?> createConfig(
            @PathVariable String orgId,
            @Valid @RequestBody FederationConfigRequest req,
            @AuthenticationPrincipal AppUser user) {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        try {
            String configId = federationService.createConfig(orgId, req);
            log.info("Created federation config {} ({}) for org {}", configId, req.getType(), orgId);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(Map.of("configId", configId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to create federation config for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create federation configuration: " + e.getMessage()));
        }
    }

    // ── Update config ─────────────────────────────────────────────────────────

    @PutMapping("/{configId}")
    public ResponseEntity<?> updateConfig(
            @PathVariable String orgId,
            @PathVariable String configId,
            @Valid @RequestBody FederationConfigRequest req,
            @AuthenticationPrincipal AppUser user) {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        try {
            federationService.updateConfig(orgId, configId, req);
            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to update federation config {} for org {}: {}", configId, orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to update federation configuration: " + e.getMessage()));
        }
    }

    // ── Delete config ─────────────────────────────────────────────────────────

    @DeleteMapping("/{configId}")
    public ResponseEntity<?> deleteConfig(
            @PathVariable String orgId,
            @PathVariable String configId,
            @AuthenticationPrincipal AppUser user) {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        try {
            federationService.deleteConfig(orgId, configId);
            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to delete federation config {} for org {}: {}", configId, orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to delete federation configuration"));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean isSuperAdminOf(AppUser user, String orgId) {
        return orgId.equals(user.getOrgId())
                && UserRole.ORG_SUPER_ADMIN.equals(user.getRole());
    }
}
