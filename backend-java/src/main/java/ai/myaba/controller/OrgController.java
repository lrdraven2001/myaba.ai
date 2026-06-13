package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.OrgRequest;
import ai.myaba.model.dto.UserRole;
import ai.myaba.service.OrgService;
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
 * REST endpoints for organization lifecycle and invite token management.
 *
 * POST  /api/orgs                          — create org (any authenticated user)
 * GET   /api/orgs/{orgId}                  — get org metadata (members of that org)
 * PUT   /api/orgs/{orgId}/settings         — update org settings (ORG_ADMIN+)
 * POST  /api/orgs/{orgId}/invite           — generate invite link (ORG_ADMIN+)
 * GET   /api/invite/{token}                — preview invite (any authenticated user)
 * POST  /api/invite/{token}/claim          — claim invite token (any authenticated user)
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class OrgController {

    private final OrgService orgService;

    // ── Create org ────────────────────────────────────────────────────────────

    /**
     * POST /api/orgs
     * Creates a new organization and makes the calling user its first ORG_ADMIN.
     * Any authenticated user may call this (used during onboarding when they have no orgId yet).
     */
    @PostMapping("/api/orgs")
    public ResponseEntity<?> createOrg(
            @Valid @RequestBody OrgRequest req,
            @AuthenticationPrincipal AppUser user) {

        if (req.getName() == null || req.getName().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Organization name is required"));
        }

        try {
            String orgId = orgService.createOrg(user.getUid(), req);
            log.info("User {} created org {}", user.getUid(), orgId);
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("orgId", orgId));
        } catch (Exception e) {
            log.error("Failed to create org for user {}: {}", user.getUid(), e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create organization"));
        }
    }

    // ── Get org ───────────────────────────────────────────────────────────────

    /**
     * GET /api/orgs/{orgId}
     * Returns org metadata. Caller must belong to the org (or be ORG_SUPER_ADMIN).
     */
    @GetMapping("/api/orgs/{orgId}")
    public ResponseEntity<?> getOrg(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {

        if (!orgId.equals(user.getOrgId()) && !UserRole.ORG_SUPER_ADMIN.equals(user.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied"));
        }

        try {
            return ResponseEntity.ok(orgService.getOrg(orgId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to get org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to retrieve organization"));
        }
    }

    // ── Update org settings ───────────────────────────────────────────────────

    /**
     * PUT /api/orgs/{orgId}/settings
     * Body: { sessionTimeoutMinutes?: number, mfaRequired?: boolean, ... }
     * ORG_ADMIN or ORG_SUPER_ADMIN only.
     */
    @PutMapping("/api/orgs/{orgId}/settings")
    public ResponseEntity<?> updateOrgSettings(
            @PathVariable String orgId,
            @RequestBody Map<String, Object> settings,
            @AuthenticationPrincipal AppUser user) {

        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }

        try {
            orgService.updateOrgSettings(orgId, settings);
            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to update org settings {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to update settings"));
        }
    }

    // ── Update org name ───────────────────────────────────────────────────────

    /**
     * PUT /api/orgs/{orgId}/name
     * Body: { name: string }
     * ORG_ADMIN or ORG_SUPER_ADMIN only.
     */
    @PutMapping("/api/orgs/{orgId}/name")
    public ResponseEntity<?> updateOrgName(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {

        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Admin access required"));
        }
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        try {
            orgService.updateOrgName(orgId, name.trim());
            return ResponseEntity.ok(Map.of("name", name.trim()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("updateOrgName failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update org name"));
        }
    }

    // ── Insurance companies ───────────────────────────────────────────────────

    /**
     * GET /api/orgs/{orgId}/insurance-companies
     * Returns the org's configured insurance company list (all members of the org may read).
     */
    @GetMapping("/api/orgs/{orgId}/insurance-companies")
    public ResponseEntity<?> getInsuranceCompanies(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {

        if (!orgId.equals(user.getOrgId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied"));
        }
        try {
            return ResponseEntity.ok(Map.of("companies", orgService.getInsuranceCompanies(orgId)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("getInsuranceCompanies failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch insurance companies"));
        }
    }

    /**
     * PUT /api/orgs/{orgId}/insurance-companies
     * Body: { companies: ["Aetna", ...] }
     * ORG_ADMIN or ORG_SUPER_ADMIN only.
     */
    @PutMapping("/api/orgs/{orgId}/insurance-companies")
    public ResponseEntity<?> setInsuranceCompanies(
            @PathVariable String orgId,
            @RequestBody Map<String, List<String>> body,
            @AuthenticationPrincipal AppUser user) {

        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Admin access required"));
        }
        List<String> companies = body.get("companies");
        if (companies == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "companies list is required"));
        }
        try {
            orgService.setInsuranceCompanies(orgId, companies);
            return ResponseEntity.ok(Map.of("companies", companies));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("setInsuranceCompanies failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update insurance companies"));
        }
    }

    // ── List org members ──────────────────────────────────────────────────────

    /**
     * GET /api/orgs/{orgId}/members
     * Returns member records for the org. ORG_ADMIN or ORG_SUPER_ADMIN only.
     * Each record: { id, displayName, email, role, purpose, active }
     */
    @GetMapping("/api/orgs/{orgId}/members")
    public ResponseEntity<?> getOrgMembers(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {

        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }
        try {
            return ResponseEntity.ok(orgService.getOrgMembers(orgId));
        } catch (Exception e) {
            log.error("getOrgMembers failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to retrieve members"));
        }
    }

    // ── Set member supervisor ─────────────────────────────────────────────────

    /**
     * PUT /api/orgs/{orgId}/members/{uid}/supervisor
     * Body: { supervisorId: string }  — pass empty string to clear.
     * ORG_ADMIN or ORG_SUPER_ADMIN only.
     */
    @PutMapping("/api/orgs/{orgId}/members/{uid}/supervisor")
    public ResponseEntity<?> setMemberSupervisor(
            @PathVariable String orgId,
            @PathVariable String uid,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {

        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }
        try {
            orgService.setSupervisor(orgId, uid, body.get("supervisorId"));
            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("setSupervisor failed org={} uid={}: {}", orgId, uid, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update supervisor"));
        }
    }

    // ── Business Associate Agreement (BAA) ───────────────────────────────────

    /**
     * GET /api/orgs/{orgId}/baa
     * Returns the BAA acceptance record for the org, or {@code { accepted: false }}
     * if the BAA has not yet been signed. Any member of the org may read this.
     */
    @GetMapping("/api/orgs/{orgId}/baa")
    public ResponseEntity<?> getBaaStatus(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {

        if (!orgId.equals(user.getOrgId()) && !UserRole.ORG_SUPER_ADMIN.equals(user.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied"));
        }
        try {
            return ResponseEntity.ok(orgService.getBaaStatus(orgId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("getBaaStatus failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to retrieve BAA status"));
        }
    }

    /**
     * POST /api/orgs/{orgId}/baa
     * Record BAA acceptance. Requires ORG_ADMIN or ORG_SUPER_ADMIN, OR the org
     * creator (adminUid match) to allow acceptance immediately after org creation
     * before the Firebase token has been refreshed.
     * Body: { signerName: string, signerTitle: string }
     * Returns 201 with the acceptance record.
     */
    @PostMapping("/api/orgs/{orgId}/baa")
    public ResponseEntity<?> acceptBaa(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {

        // Standard admin check — works after token refresh
        boolean authorized = isAdminOf(user, orgId);

        // Also allow the org creator immediately after org creation (before token refresh)
        if (!authorized) {
            try {
                Map<String, Object> org = orgService.getOrg(orgId);
                authorized = user.getUid().equals(org.get("adminUid"));
            } catch (Exception ignored) {}
        }

        if (!authorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Admin access required"));
        }

        String signerName  = body.get("signerName");
        String signerTitle = body.get("signerTitle");
        if (signerName == null || signerName.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "signerName is required"));
        }
        if (signerTitle == null || signerTitle.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "signerTitle is required"));
        }
        try {
            Map<String, Object> result = orgService.acceptBaa(
                    orgId, user.getUid(), signerName.trim(), signerTitle.trim());
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("acceptBaa failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to record BAA acceptance"));
        }
    }

    // ── Generate invite token ─────────────────────────────────────────────────

    /**
     * POST /api/orgs/{orgId}/invite
     * Body: { role: string }
     * Returns: { inviteUrl: string }
     * ORG_ADMIN or ORG_SUPER_ADMIN only.
     */
    @PostMapping("/api/orgs/{orgId}/invite")
    public ResponseEntity<?> generateInvite(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {

        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required to generate invite links"));
        }

        String role = body.get("role");
        if (role == null || role.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "role is required"));
        }

        try {
            String inviteUrl = orgService.generateInviteToken(orgId, role, user.getUid());
            return ResponseEntity.ok(Map.of("inviteUrl", inviteUrl));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to generate invite for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to generate invite link"));
        }
    }

    // ── Resolve invite token (preview) ────────────────────────────────────────

    /**
     * GET /api/invite/{token}
     * Returns { orgId, orgName, role } without consuming the token.
     * Any authenticated user may call this (they may not have an orgId yet).
     */
    @GetMapping("/api/invite/{token}")
    public ResponseEntity<?> resolveInvite(
            @PathVariable String token,
            @AuthenticationPrincipal AppUser user) {

        try {
            Map<String, Object> info = orgService.resolveInviteToken(token);
            return ResponseEntity.ok(info);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Invite link not found or expired"));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to resolve invite token: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to resolve invite link"));
        }
    }

    // ── Claim invite token ────────────────────────────────────────────────────

    /**
     * POST /api/invite/{token}/claim
     * Applies role + orgId claims to the authenticated user. Single-use.
     * Any authenticated user may call this (they may not have an orgId yet).
     */
    @PostMapping("/api/invite/{token}/claim")
    public ResponseEntity<?> claimInvite(
            @PathVariable String token,
            @AuthenticationPrincipal AppUser user) {

        try {
            orgService.claimInviteToken(token, user.getUid());
            return ResponseEntity.ok(Map.of(
                    "message", "Invite claimed successfully — refresh your auth token to load your new role"
            ));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Invite link not found or expired"));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to claim invite token for user {}: {}", user.getUid(), e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to claim invite"));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean isAdminOf(AppUser user, String orgId) {
        return orgId.equals(user.getOrgId())
                && (UserRole.ORG_ADMIN.equals(user.getRole())
                    || UserRole.ORG_SUPER_ADMIN.equals(user.getRole()));
    }

    // ── Exception handlers ────────────────────────────────────────────────────

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
    }
}
