package ai.myaba.security;

import java.util.Set;

/**
 * A concrete authorization capability, resolved from the per-org permission matrix.
 *
 * <p>Each capability is gated by ONE permission category at a level threshold. Some
 * capabilities are intentionally gated by a category different from their label so the
 * built-in {@link PermissionDefaults#DEFAULTS} reproduce today's hardcoded
 * {@code UserRole} behavior EXACTLY (see {@code PermissionServiceParityTest}). The most
 * important such split: org-wide record visibility ({@code *_VIEW_ALL}) is gated by
 * {@code administration}, NOT by the resource's own category — so a Clinical Supervisor
 * with {@code clients:'all'} gets {@link #CLIENT_MANAGE} but not org-wide PHI visibility.
 */
public enum Capability {

    // ── clients ────────────────────────────────────────────────────────────
    /** Create clients, edit assignments, manage guardians/authorizations. */
    CLIENT_MANAGE("clients", Set.of("all")),
    /** See EVERY client's record (oversight) — the admin branch of canAccessClient. */
    CLIENT_VIEW_ALL("administration", Set.of("all", "custom")),

    // ── projects ───────────────────────────────────────────────────────────
    PROJECT_CREATE("projects", Set.of("all")),
    PROJECT_MANAGE("projects", Set.of("all")),
    /** See/enter every project — the admin branch of project access. */
    PROJECT_VIEW_ALL("administration", Set.of("all", "custom")),
    /** Trash view + restore — the ORG_SUPER_ADMIN-only branch in ProjectService. */
    PROJECT_RESTORE("administration", Set.of("all")),

    // ── documents ──────────────────────────────────────────────────────────
    DOCUMENT_GENERATE("documents", Set.of("all", "custom")),
    /** Review/approve documents — the 'custom' nuance excludes RBT. */
    DOCUMENT_APPROVE("documents", Set.of("all")),

    // ── resources / org content ─────────────────────────────────────────────
    RESOURCE_VIEW("resources", Set.of("all", "custom")),
    RESOURCE_LIBRARY_ADD("resources", Set.of("all", "custom")),
    /** Author org templates/policies — gated by administration (== canWriteOrgContent). */
    ORG_CONTENT_WRITE("administration", Set.of("all", "custom")),

    // ── team ────────────────────────────────────────────────────────────────
    TEAM_MANAGE("team", Set.of("all")),

    // ── ai_features ──────────────────────────────────────────────────────────
    AI_CLINICAL_CHAT("ai_features", Set.of("all")),
    /** PHI-blocked general chat — the 'custom' level (GENERAL_STAFF). */
    AI_GENERAL_CHAT("ai_features", Set.of("custom")),

    // ── administration ────────────────────────────────────────────────────────
    /** Org admin: invites, settings, billing, policy/template admin, etc. (== isAdmin). */
    ADMIN_MANAGE("administration", Set.of("all", "custom")),
    /** Super-admin: org delete, ownership, cross-org (== ORG_SUPER_ADMIN). */
    ADMIN_SUPER("administration", Set.of("all"));

    /** The permission-matrix category this capability reads. */
    public final String category;
    /** Levels of that category which GRANT this capability. */
    public final Set<String> allowedLevels;

    Capability(String category, Set<String> allowedLevels) {
        this.category = category;
        this.allowedLevels = allowedLevels;
    }

    /** True when {@code level} (the resolved level of {@link #category}) grants this capability. */
    public boolean grantedBy(String level) {
        return allowedLevels.contains(level);
    }
}
