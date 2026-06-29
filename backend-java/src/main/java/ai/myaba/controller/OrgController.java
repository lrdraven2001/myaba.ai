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

        // Pathfinder gate: only vendor-approved emails may provision a new org.
        if (!orgService.isApprovedOrgCreator(user.getEmail())) {
            log.warn("Blocked org creation by non-approved user {} ({})", user.getUid(), user.getEmail());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error", "Your account is not approved to create an organization. "
                            + "Contact MyABA to join the Pathfinder program."));
        }

        try {
            String orgId = orgService.createOrg(user.getUid(), user.getEmail(), req);
            log.info("User {} created org {}", user.getUid(), orgId);
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("orgId", orgId));
        } catch (SecurityException e) {
            // Backstop if the allowlist changed between the check above and creation.
            log.warn("Org creation denied for user {}: {}", user.getUid(), e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Your account is not approved to create an organization."));
        } catch (Exception e) {
            log.error("Failed to create org for user {}: {}", user.getUid(), e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create organization"));
        }
    }

    // ── Org-creation eligibility ────────────────────────────────────────────────

    /**
     * GET /api/orgs/eligibility
     * Lets the onboarding UI decide whether to show the create-org flow or a
     * "not provisioned" screen, without exposing the allowlist itself.
     */
    @GetMapping("/api/orgs/eligibility")
    public ResponseEntity<?> orgCreationEligibility(@AuthenticationPrincipal AppUser user) {
        boolean allowed = orgService.isApprovedOrgCreator(user.getEmail());
        return ResponseEntity.ok(Map.of(
                "allowed", allowed,
                "email", user.getEmail() == null ? "" : user.getEmail()));
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

    // ── Current user's own profile ───────────────────────────────────────────

    /** PUT /api/me/profile — update the signed-in user's display name (and sync email). */
    @PutMapping("/api/me/profile")
    public ResponseEntity<?> updateMyProfile(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        try {
            orgService.updateMyProfile(user.getUid(), user.getOrgId(),
                    body.get("displayName"), body.get("email"));
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("updateMyProfile failed for {}: {}", user.getUid(), e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update profile"));
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

    /**
     * GET /api/orgs/{orgId}/baa/document
     * Download the executed BAA as a self-contained HTML document (print-to-PDF ready).
     * Only available once the BAA has been signed. Org-scoped admin access.
     */
    @GetMapping(value = "/api/orgs/{orgId}/baa/document")
    public ResponseEntity<?> downloadBaaDocument(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {

        if (!orgId.equals(user.getOrgId()) && !UserRole.ORG_SUPER_ADMIN.equals(user.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied"));
        }
        try {
            byte[] pdf = orgService.renderBaaPdf(orgId);
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"BAA-" + orgId + ".pdf\"")
                    .header("Content-Type", "application/pdf")
                    .body(pdf);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("downloadBaaDocument failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to render BAA document"));
        }
    }

    // ── Service Contract (master service agreement) ──────────────────────────

    /** GET /api/orgs/{orgId}/service-contract — acceptance record, or {accepted:false}. */
    @GetMapping("/api/orgs/{orgId}/service-contract")
    public ResponseEntity<?> getServiceContractStatus(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {
        if (!orgId.equals(user.getOrgId()) && !UserRole.ORG_SUPER_ADMIN.equals(user.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied"));
        }
        try {
            return ResponseEntity.ok(orgService.getServiceContractStatus(orgId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("getServiceContractStatus failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to retrieve Service Contract status"));
        }
    }

    /** POST /api/orgs/{orgId}/service-contract — record acceptance. Body: { signerName, signerTitle }. */
    @PostMapping("/api/orgs/{orgId}/service-contract")
    public ResponseEntity<?> acceptServiceContract(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {

        boolean authorized = isAdminOf(user, orgId);
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
            Map<String, Object> result = orgService.acceptServiceContract(
                    orgId, user.getUid(), signerName.trim(), signerTitle.trim());
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("acceptServiceContract failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to record Service Contract acceptance"));
        }
    }

    /** GET /api/orgs/{orgId}/service-contract/document — download the executed contract as PDF. */
    @GetMapping(value = "/api/orgs/{orgId}/service-contract/document")
    public ResponseEntity<?> downloadServiceContractDocument(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {
        if (!orgId.equals(user.getOrgId()) && !UserRole.ORG_SUPER_ADMIN.equals(user.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied"));
        }
        try {
            byte[] pdf = orgService.renderServiceContractPdf(orgId);
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"ServiceContract-" + orgId + ".pdf\"")
                    .header("Content-Type", "application/pdf")
                    .body(pdf);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("downloadServiceContractDocument failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to render Service Contract document"));
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

    // ── List / revoke pending invites ─────────────────────────────────────────

    /**
     * GET /api/orgs/{orgId}/invites
     * Returns pending (unclaimed, unexpired) invite links. ORG_ADMIN+ only.
     */
    @GetMapping("/api/orgs/{orgId}/invites")
    public ResponseEntity<?> listInvites(@PathVariable String orgId,
                                         @AuthenticationPrincipal AppUser user) {
        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }
        try {
            return ResponseEntity.ok(orgService.listPendingInvites(orgId));
        } catch (Exception e) {
            log.error("Failed to list invites for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to list invites"));
        }
    }

    /**
     * DELETE /api/orgs/{orgId}/invites/{token}
     * Revokes a pending invite. ORG_ADMIN+ only.
     */
    @DeleteMapping("/api/orgs/{orgId}/invites/{token}")
    public ResponseEntity<?> revokeInvite(@PathVariable String orgId,
                                          @PathVariable String token,
                                          @AuthenticationPrincipal AppUser user) {
        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }
        try {
            orgService.revokeInvite(orgId, token);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            log.error("Failed to revoke invite {} for org {}: {}", token, orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to revoke invite"));
        }
    }

    /**
     * GET /api/orgs/{orgId}/members/{uid}/activity
     * Recent AI activity for a member, from the audit log. ORG_ADMIN+ only.
     */
    @GetMapping("/api/orgs/{orgId}/members/{uid}/activity")
    public ResponseEntity<?> memberActivity(@PathVariable String orgId,
                                            @PathVariable String uid,
                                            @AuthenticationPrincipal AppUser user) {
        if (!isAdminOf(user, orgId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }
        try {
            return ResponseEntity.ok(orgService.getMemberActivity(orgId, uid));
        } catch (Exception e) {
            log.error("Failed to load activity for member {} in org {}: {}", uid, orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to load activity"));
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
                && (UserRole.ORG_SUPER_ADMIN.equals(user.getRole())
                    // CLINICAL_DIRECTOR is the org creator / primary practice admin — must
                    // have the same org-admin access (members, invites, activity, role changes).
                    || UserRole.CLINICAL_DIRECTOR.equals(user.getRole()));
    }

    // ── Exception handlers ────────────────────────────────────────────────────

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
    }
}
