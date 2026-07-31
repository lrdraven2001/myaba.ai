package ai.myaba.security;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import org.springframework.stereotype.Component;

/**
 * Static bridge from plain DTOs ({@link AppUser}) and static utilities
 * ({@link AuthorizationUtil}) to the Spring-managed {@link PermissionService}, so the
 * migration to matrix-based authorization doesn't require threading the service through
 * every call site at once. The reference is set once when Spring builds this bean at startup.
 *
 * <p>If the service isn't wired yet — only possible during context startup, never during
 * request handling — {@link #can} falls back to the legacy {@link UserRole} predicate for
 * that capability, so behavior is preserved rather than failing closed.
 */
@Component
public final class Permissions {

    private static volatile PermissionService service;

    public Permissions(PermissionService service) {
        Permissions.service = service;
    }

    /** True when the user holds the capability (resolved against their org's matrix). */
    public static boolean can(AppUser user, Capability capability) {
        PermissionService s = service;
        return (s != null) ? s.can(user, capability) : legacyFallback(user, capability);
    }

    /** Throw 403 (via GlobalExceptionHandler) unless the user holds the capability. */
    public static void require(AppUser user, Capability capability) {
        if (!can(user, capability)) {
            throw new SecurityException("Access denied: missing capability " + capability);
        }
    }

    /** Legacy UserRole equivalents — used only before the service bean is constructed. */
    private static boolean legacyFallback(AppUser user, Capability capability) {
        String role = user == null ? null : user.getRole();
        return switch (capability) {
            case ADMIN_SUPER, PROJECT_RESTORE -> UserRole.ORG_SUPER_ADMIN.equals(role);
            case ADMIN_MANAGE, TEAM_MANAGE, CLIENT_VIEW_ALL, PROJECT_VIEW_ALL, ORG_CONTENT_WRITE ->
                    UserRole.isAdmin(role);
            default -> false;
        };
    }
}
