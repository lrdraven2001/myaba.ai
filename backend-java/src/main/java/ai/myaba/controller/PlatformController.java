package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.security.PlatformAdminGuard;
import ai.myaba.service.AuditService;
import ai.myaba.service.OrgService;
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
 * Platform-level admin endpoints — vendor platform operators ONLY,
 * allowlisted via the PLATFORM_ADMIN_EMAILS env var (see {@link PlatformAdminGuard}).
 * These are called exclusively by the admin console (admin.myaba.ai), never by
 * the customer-facing app. Customer ORG_SUPER_ADMINs are NOT platform admins —
 * they must never see other tenants' data.
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
    private final PlatformAdminGuard platformAdminGuard;
    private final OrgService orgService;
    private final AuditService auditService;

    // ── Guard ─────────────────────────────────────────────────────────────────

    private boolean isSuperAdmin(AppUser user) {
        return platformAdminGuard.isPlatformAdmin(user);
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

    // ── Pathfinder approved-creators allowlist ────────────────────────────────
    // Manages the `approvedOrgCreators` collection so org-creation invitations
    // never require hand-editing Firestore.

    @GetMapping("/approved-creators")
    public ResponseEntity<?> listApprovedCreators(@AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        try {
            return ResponseEntity.ok(Map.of("creators", orgService.listApprovedCreators()));
        } catch (Exception e) {
            log.error("listApprovedCreators failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to list approved creators"));
        }
    }

    /** Add (or re-approve) an email. Body: { email, note? }. Re-adding resets `used`. */
    @PostMapping("/approved-creators")
    public ResponseEntity<?> addApprovedCreator(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        try {
            orgService.addApprovedCreator(body.get("email"), body.get("note"), user.getUid());
            auditService.log("ORG_CREATOR_APPROVED", null, user.getUid(), null, null, null, null,
                    body.get("email"));
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("addApprovedCreator failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to add approved creator"));
        }
    }

    /** Revoke an allowlist entry. */
    @DeleteMapping("/approved-creators/{email}")
    public ResponseEntity<?> revokeApprovedCreator(
            @PathVariable String email,
            @AuthenticationPrincipal AppUser user) {
        if (!isSuperAdmin(user)) return forbidden();
        try {
            orgService.revokeApprovedCreator(email);
            auditService.log("ORG_CREATOR_REVOKED", null, user.getUid(), null, null, null, null, email);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("revokeApprovedCreator failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to revoke approved creator"));
        }
    }
}
