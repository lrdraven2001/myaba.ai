package ai.myaba.security;

/**
 * Per-member AI seat tier — the billing/access axis that is ORTHOGONAL to the
 * clinical role (see {@code docs/ai-tiers.md}).
 *
 * <p>It controls only <b>which model</b> a member can reach and whether the
 * expensive document-generation path is available. It never affects PHI /
 * clinical capabilities (those come from the role) nor compliance governance
 * (ACLX / DLP / audit are always on regardless of tier).
 *
 * <p>Cost control is structural: a {@link #LITE} seat can only ever reach the
 * fast (Flash) model, so worst-case per-request cost is capped by the model
 * itself — no per-user token accounting required.
 */
public enum AiTier {

    /** Full seat — reasoning (Pro) model + document generation (still subject to role). */
    FULL,

    /** Lite seat — fast (Flash) model only; no reasoning model, no document generation. */
    LITE;

    /**
     * Resolve from the {@code aiTier} custom claim / member field.
     * Null / blank / unknown → {@link #FULL} (the safe default: existing behavior).
     */
    public static AiTier fromClaim(String claim) {
        return claim != null && "lite".equalsIgnoreCase(claim.trim()) ? LITE : FULL;
    }

    /** Lite seats are Flash-only — the reasoning (Pro) model is never routed for them. */
    public boolean allowsReasoningModel() {
        return this == FULL;
    }

    /** Lite seats cannot generate documents (blocked, not downgraded — clinical quality). */
    public boolean allowsDocumentGeneration() {
        return this == FULL;
    }

    /** Canonical claim / storage string. */
    public String value() {
        return this == LITE ? "lite" : "full";
    }
}
