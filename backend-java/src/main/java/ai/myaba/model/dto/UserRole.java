package ai.myaba.model.dto;

import java.util.Set;

/**
 * Role constants for myABA.ai.
 *
 * Roles map to Firebase custom claim "role" and drive:
 *   - Spring Security authorities (ROLE_<value>)
 *   - ACLX Rego policy decisions (identity.role)
 *   - AuthorizationService permission checks
 *
 * Federation note: when an external IdP is configured, a Firebase Cloud Function
 * maps the IdP's group/role claims to these constants before writing custom claims.
 * Nothing downstream (this class, ACLX, Spring Security) changes when federation is added.
 */
public final class UserRole {

    // ── Clinical ──────────────────────────────────────────────────────────
    /** Full clinical access to assigned clients; authors BIPs, FBAs, progress notes. */
    public static final String TREATING_BCBA     = "TREATING_BCBA";
    /** Oversight of supervisees' full caseloads; can review/approve documents. */
    public static final String SUPERVISING_BCBA  = "SUPERVISING_BCBA";
    /** In-training BCBA; documents require supervisor review annotation. */
    public static final String BCBA_STUDENT      = "BCBA_STUDENT";
    /** Session notes only for assigned clients; no assessment/diagnosis PHI. */
    public static final String RBT               = "RBT";

    // ── Administrative ────────────────────────────────────────────────────
    /** Scheduling and demographic data only — no clinical content. */
    public static final String SCHEDULING_ADMIN  = "SCHEDULING_ADMIN";
    /** Billing codes and insurance data — no clinical content. */
    public static final String BILLING_ADMIN     = "BILLING_ADMIN";
    /**
     * General business/admin staff — can use AI chat for operational questions
     * but are HIPAA-gated from all patient data (PHI blocked at every layer).
     */
    public static final String GENERAL_STAFF     = "GENERAL_STAFF";

    // ── Organization management ───────────────────────────────────────────
    /**
     * Agency owner / BAA signatory. Assigned to the user who creates the organization.
     * Has full clinical access (PHI) plus all administrative capabilities.
     * Intended for a senior BCBA who also runs the practice.
     */
    public static final String CLINICAL_DIRECTOR = "CLINICAL_DIRECTOR";
    /** Non-clinical org administrator: manages users, templates, policies. No PHI access. */
    public static final String ORG_ADMIN         = "ORG_ADMIN";
    /** Platform-level: org setup, billing, IdP federation config. Full PHI access. */
    public static final String ORG_SUPER_ADMIN   = "ORG_SUPER_ADMIN";

    // ── Role sets for permission checks ──────────────────────────────────

    /** Roles with direct PHI / clinical data access. */
    public static final Set<String> CLINICAL_ROLES = Set.of(
            TREATING_BCBA, SUPERVISING_BCBA, BCBA_STUDENT, RBT, CLINICAL_DIRECTOR);

    public static final Set<String> BCBA_ROLES = Set.of(
            TREATING_BCBA, SUPERVISING_BCBA, BCBA_STUDENT);

    /** Roles with org-management permissions (invite users, change settings, etc.). */
    public static final Set<String> ADMIN_ROLES = Set.of(
            CLINICAL_DIRECTOR, ORG_ADMIN, ORG_SUPER_ADMIN);

    /**
     * Roles allowed to use general (non-clinical) chat.
     * These users get PHI-blocked responses at every layer — no client context,
     * PHI-prohibition system prompt, and ACLX escalations treated as blocks.
     */
    public static final Set<String> GENERAL_CHAT_ROLES = Set.of(
            GENERAL_STAFF, SCHEDULING_ADMIN, BILLING_ADMIN);

    /**
     * Roles that carry {@code phiAccess: true} in their Firebase custom claims.
     * Used by {@link #hasPhiAccess(String)} and {@code setUserClaims} to stamp
     * the explicit capability claim so downstream code never needs to know role names.
     */
    public static final Set<String> PHI_ACCESS_ROLES = Set.of(
            TREATING_BCBA, SUPERVISING_BCBA, BCBA_STUDENT, RBT,
            CLINICAL_DIRECTOR, ORG_SUPER_ADMIN);

    // ── Helpers ───────────────────────────────────────────────────────────
    public static boolean isClinical(String role)    { return CLINICAL_ROLES.contains(role); }
    public static boolean isBcba(String role)        { return BCBA_ROLES.contains(role); }
    public static boolean isAdmin(String role)       { return ADMIN_ROLES.contains(role); }
    public static boolean hasPhiAccess(String role)  { return PHI_ACCESS_ROLES.contains(role); }

    public static boolean canInitiateClinicalChat(String role) {
        return PHI_ACCESS_ROLES.contains(role);
    }
    public static boolean canUseGeneralChat(String role) {
        return GENERAL_CHAT_ROLES.contains(role);
    }

    /** Returns true if {@code role} is one of the known role constants. */
    public static boolean isValid(String role) {
        return CLINICAL_ROLES.contains(role) || ADMIN_ROLES.contains(role)
                || SCHEDULING_ADMIN.equals(role) || BILLING_ADMIN.equals(role)
                || GENERAL_STAFF.equals(role);
    }

    private UserRole() {}
}
