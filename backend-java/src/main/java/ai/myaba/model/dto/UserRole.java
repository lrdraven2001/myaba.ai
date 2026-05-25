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

    // ── Organization management ───────────────────────────────────────────
    /** Manages org users, templates, policies. No clinical chat access. */
    public static final String ORG_ADMIN         = "ORG_ADMIN";
    /** Platform-level: org setup, billing, IdP federation config. */
    public static final String ORG_SUPER_ADMIN   = "ORG_SUPER_ADMIN";

    // ── Role sets for permission checks ──────────────────────────────────
    public static final Set<String> CLINICAL_ROLES = Set.of(
            TREATING_BCBA, SUPERVISING_BCBA, BCBA_STUDENT, RBT);

    public static final Set<String> BCBA_ROLES = Set.of(
            TREATING_BCBA, SUPERVISING_BCBA, BCBA_STUDENT);

    public static final Set<String> ADMIN_ROLES = Set.of(
            ORG_ADMIN, ORG_SUPER_ADMIN);

    // ── Helpers ───────────────────────────────────────────────────────────
    public static boolean isClinical(String role)     { return CLINICAL_ROLES.contains(role); }
    public static boolean isBcba(String role)         { return BCBA_ROLES.contains(role); }
    public static boolean isAdmin(String role)        { return ADMIN_ROLES.contains(role); }
    public static boolean canInitiateClinicalChat(String role) {
        return TREATING_BCBA.equals(role) || SUPERVISING_BCBA.equals(role)
                || BCBA_STUDENT.equals(role) || RBT.equals(role);
    }

    /** Returns true if {@code role} is one of the 8 known role constants. */
    public static boolean isValid(String role) {
        return CLINICAL_ROLES.contains(role) || ADMIN_ROLES.contains(role)
                || SCHEDULING_ADMIN.equals(role) || BILLING_ADMIN.equals(role);
    }

    private UserRole() {}
}
