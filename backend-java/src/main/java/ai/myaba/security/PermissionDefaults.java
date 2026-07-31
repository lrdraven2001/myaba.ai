package ai.myaba.security;

import ai.myaba.model.dto.UserRole;

import java.util.List;
import java.util.Map;

/**
 * The built-in role → category → level matrix. This is the single authoritative copy
 * (the frontend {@code RolesPermissionsTab.DEFAULTS} must match it, and is fed from the
 * {@code GET /api/permissions/defaults} endpoint so they cannot drift).
 *
 * <p>Values are copied verbatim from {@code frontend/src/views/settings/RolesPermissionsTab.tsx}.
 * They are chosen so the resolver reproduces today's {@code UserRole} behavior exactly on
 * an empty per-org config (proven by {@code PermissionServiceParityTest}). Do NOT tune these
 * to "look nicer" without updating that test — a change here silently changes access
 * (including PHI) for every org that hasn't overridden the matrix.
 */
public final class PermissionDefaults {

    /** The 7 permission categories, in the order the UI presents them. */
    public static final List<String> CATEGORIES = List.of(
            "clients", "projects", "documents", "resources", "team", "ai_features", "administration");

    /** Built-in role key → (category → level). Sparse rows fall through to {@code "none"}. */
    public static final Map<String, Map<String, String>> DEFAULTS = Map.of(
            UserRole.ORG_SUPER_ADMIN, Map.of(
                    "clients", "all", "projects", "all", "documents", "all", "resources", "custom",
                    "team", "all", "ai_features", "all", "administration", "all"),
            UserRole.CLINICAL_DIRECTOR, Map.of(
                    "clients", "all", "projects", "all", "documents", "all", "resources", "all",
                    "team", "all", "ai_features", "all", "administration", "custom"),
            UserRole.SUPERVISING_BCBA, Map.of(
                    "clients", "all", "projects", "all", "documents", "all", "resources", "custom",
                    "team", "none", "ai_features", "all", "administration", "none"),
            UserRole.RBT, Map.of(
                    "clients", "none", "projects", "all", "documents", "custom", "resources", "none",
                    "team", "none", "ai_features", "all", "administration", "none"),
            UserRole.GENERAL_STAFF, Map.of(
                    "clients", "none", "projects", "none", "documents", "none", "resources", "custom",
                    "team", "none", "ai_features", "custom", "administration", "none"));

    private PermissionDefaults() {}

    /** Default level for a built-in role + category; {@code "none"} for unknown role/category. */
    public static String defaultLevel(String role, String category) {
        Map<String, String> row = role == null ? null : DEFAULTS.get(role);
        return row == null ? "none" : row.getOrDefault(category, "none");
    }
}
