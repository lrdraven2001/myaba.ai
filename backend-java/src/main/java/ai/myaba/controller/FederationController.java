package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.FederationConfigRequest;
import ai.myaba.security.Capability;
import ai.myaba.security.Permissions;
import ai.myaba.service.FederationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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
            @AuthenticationPrincipal AppUser user) throws Exception {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        return ResponseEntity.ok(federationService.getConfigs(orgId));
    }

    // ── Create config ─────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<?> createConfig(
            @PathVariable String orgId,
            @Valid @RequestBody FederationConfigRequest req,
            @AuthenticationPrincipal AppUser user) throws Exception {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        String configId = federationService.createConfig(orgId, req);
        log.info("Created federation config {} ({}) for org {}", configId, req.getType(), orgId);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("configId", configId));
    }

    // ── Update config ─────────────────────────────────────────────────────────

    @PutMapping("/{configId}")
    public ResponseEntity<?> updateConfig(
            @PathVariable String orgId,
            @PathVariable String configId,
            @Valid @RequestBody FederationConfigRequest req,
            @AuthenticationPrincipal AppUser user) throws Exception {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        federationService.updateConfig(orgId, configId, req);
        return ResponseEntity.noContent().build();
    }

    // ── Delete config ─────────────────────────────────────────────────────────

    @DeleteMapping("/{configId}")
    public ResponseEntity<?> deleteConfig(
            @PathVariable String orgId,
            @PathVariable String configId,
            @AuthenticationPrincipal AppUser user) throws Exception {

        if (!isSuperAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "ORG_SUPER_ADMIN required for federation configuration"));
        }

        federationService.deleteConfig(orgId, configId);
        return ResponseEntity.noContent().build();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean isSuperAdminOf(AppUser user, String orgId) {
        return orgId.equals(user.getOrgId())
                && Permissions.can(user, Capability.ADMIN_SUPER);
    }
}
