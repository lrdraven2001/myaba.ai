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
    /** Clinical Supervisor — oversight of caseloads; can review/approve documents. */
    public static final String SUPERVISING_BCBA  = "SUPERVISING_BCBA";
    /** Behavior Technician — session notes only for assigned clients; limited PHI. */
    public static final String RBT               = "RBT";

    // ── Administrative ────────────────────────────────────────────────────
    /**
     * General Staff — restricted, non-HIPAA. Can use general AI chat for operational
     * questions but are HIPAA-gated from all patient data (PHI blocked at every layer).
     */
    public static final String GENERAL_STAFF     = "GENERAL_STAFF";

    // ── Organization management ───────────────────────────────────────────
    /**
     * Clinical Director — senior clinician who can also run the practice.
     * Full clinical access (PHI) plus org-administration capabilities.
     */
    public static final String CLINICAL_DIRECTOR = "CLINICAL_DIRECTOR";
    /**
     * Practice Administrator — agency owner / super admin / BAA signatory. Assigned to
     * the user who creates the organization. Full PHI access plus all admin capabilities.
     */
    public static final String ORG_SUPER_ADMIN   = "ORG_SUPER_ADMIN";

    // ── Role sets for permission checks ──────────────────────────────────

    /** Roles with direct PHI / clinical data access. */
    public static final Set<String> CLINICAL_ROLES = Set.of(
            SUPERVISING_BCBA, RBT, CLINICAL_DIRECTOR);

    public static final Set<String> BCBA_ROLES = Set.of(SUPERVISING_BCBA);

    /** Roles with org-management permissions (invite users, change settings, etc.). */
    public static final Set<String> ADMIN_ROLES = Set.of(
            CLINICAL_DIRECTOR, ORG_SUPER_ADMIN);

    /**
     * Roles allowed to use general (non-clinical) chat.
     * These users get PHI-blocked responses at every layer — no client context,
     * PHI-prohibition system prompt, and ACLX escalations treated as blocks.
     */
    public static final Set<String> GENERAL_CHAT_ROLES = Set.of(GENERAL_STAFF);

    /**
     * Roles that carry {@code phiAccess: true} in their Firebase custom claims.
     * Used by {@link #hasPhiAccess(String)} and {@code setUserClaims} to stamp
     * the explicit capability claim so downstream code never needs to know role names.
     */
    public static final Set<String> PHI_ACCESS_ROLES = Set.of(
            SUPERVISING_BCBA, RBT, CLINICAL_DIRECTOR, ORG_SUPER_ADMIN);

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
                || GENERAL_STAFF.equals(role);
    }

    private UserRole() {}
}
