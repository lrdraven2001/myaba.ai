package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import ai.myaba.service.PlatformService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Platform-level admin endpoints — ORG_SUPER_ADMIN only.
 * These are called exclusively by the admin console (admin.myaba.ai),
 * never by the customer-facing app.
 *
 * GET  /api/platform/tenants                 — list all orgs
 * GET  /api/platform/tenants/{orgId}         — single org detail
 * PUT  /api/platform/tenants/{orgId}/status  — activate / suspend
 * GET  /api/platform/config                  — platform config
 * PUT  /api/platform/config                  — update platform config
 * GET  /api/platform/usage                   — usage summary across all orgs
 * GET  /api/platform/health                  — extended service health
 */
@RestController
@RequestMapping("/api/platform")
@RequiredArgsConstructor
@Slf4j
public class PlatformController {

    private final PlatformService platformService;

    // ── Guard ─────────────────────────────────────────────────────────────────

    private boolean isSuperAdmin(AppUser user) {
        return UserRole.ORG_SUPER_ADMIN.equals(user.getRole());
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Platform admin access required"));
    }

    // ── Tenants ───────────────────────────────────────────────────────────────

    @GetMapping("/tenants")
    public ResponseEntity<?> listTenants(@AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        return ResponseEntity.ok(platformService.getAllTenants());
    }

    @GetMapping("/tenants/{orgId}")
    public ResponseEntity<?> getTenant(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        try {
            return ResponseEntity.ok(platformService.getTenant(orgId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/tenants/{orgId}/status")
    public ResponseEntity<?> setTenantStatus(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        String status = body.get("status");
        if (status == null || (!status.equals("active") && !status.equals("suspended"))) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "status must be 'active' or 'suspended'"));
        }
        try {
            platformService.setTenantStatus(orgId, status);
            log.info("Super admin {} set org {} status → {}", user.getUid(), orgId, status);
            return ResponseEntity.ok(Map.of("orgId", orgId, "status", status));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ── Platform config ───────────────────────────────────────────────────────

    @GetMapping("/config")
    public ResponseEntity<?> getConfig(@AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        return ResponseEntity.ok(platformService.getPlatformConfig());
    }

    @PutMapping("/config")
    public ResponseEntity<?> updateConfig(
            @RequestBody Map<String, Object> updates,
            @AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        // Never persist raw API keys to storage — reject key fields
        updates.remove("anthropicApiKey");
        updates.remove("apiKey");
        updates.remove("dlpApiKey");
        platformService.updatePlatformConfig(updates);
        log.info("Super admin {} updated platform config: {}", user.getUid(), updates.keySet());
        return ResponseEntity.ok(Map.of("updated", updates.keySet()));
    }

    // ── Usage ─────────────────────────────────────────────────────────────────

    @GetMapping("/usage")
    public ResponseEntity<?> getUsage(@AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        return ResponseEntity.ok(platformService.getUsageSummary());
    }

    // ── Health ────────────────────────────────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<?> getHealth(@AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        return ResponseEntity.ok(platformService.getHealth());
    }
}
