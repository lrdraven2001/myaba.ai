package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

/**
 * Authenticated user principal — populated by FirebaseAuthFilter from the
 * decoded Firebase ID token (or dev stub when DEV_AUTH=true).
 *
 * Fields come from Firebase custom claims set at login or via a Cloud Function
 * that maps IdP assertions (OIDC/SAML) to the myABA role model.
 */
@Data
@Builder
public class AppUser {
    private String uid;
    private String email;
    private String displayName;

    /** One of the constants defined in {@link UserRole}. */
    private String role;

    /** Declared intent: treatment | assessment | oversight | scheduling | payment. */
    private String purpose;

    /** Firestore org ID — top-level tenancy boundary. */
    private String orgId;

    /**
     * For RBT / BCBA_STUDENT: the UID of their supervising BCBA.
     * Used when the supervisor needs to access supervisee-authored documents.
     * Populated from the Firebase custom claim "supervisorId".
     */
    private String supervisorId;

    /**
     * Explicit PHI-access capability from the Firebase custom claim "phiAccess".
     * Set when an org admin assigns a role so that custom org-defined role names
     * don't need to be known by the backend. May be null on legacy tokens — in that
     * case the backend falls back to role-name inference via {@link UserRole}.
     */
    private Boolean phiAccess;

    // ── Convenience role checks ───────────────────────────────────────────

    public boolean isClinical()  { return UserRole.isClinical(role); }
    public boolean isBcba()      { return UserRole.isBcba(role); }
    public boolean isAdmin()     { return UserRole.isAdmin(role); }

    public boolean canInitiateChat() {
        return UserRole.canInitiateClinicalChat(role);
    }

    public boolean canUseGeneralChat() {
        return UserRole.canUseGeneralChat(role);
    }

    /**
     * True when the user may view or process protected health information.
     * Checks the explicit claim first; falls back to role-name inference for
     * tokens minted before the phiAccess claim was introduced.
     */
    public boolean hasPhiAccess() {
        if (phiAccess != null) return phiAccess;
        return isClinical() || isAdmin();
    }
}
