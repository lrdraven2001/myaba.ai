package ai.myaba.security;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;

/**
 * Centralized authorization checks shared across controllers and services.
 *
 * <p>All methods throw {@link SecurityException} on failure, which the
 * {@code GlobalExceptionHandler} maps to HTTP 403. This replaces the
 * per-controller/service {@code verifyOrgAccess} / {@code requireAdmin} private
 * helpers that were independently reimplemented in 7+ places.
 */
public final class AuthorizationUtil {

    private AuthorizationUtil() {}

    /** Throw unless the user holds an administrator role. */
    public static void requireAdmin(AppUser user) {
        if (user == null || !UserRole.isAdmin(user.getRole())) {
            throw new SecurityException("Administrator access required");
        }
    }

    /** Throw unless the user belongs to the given organization. */
    public static void verifyOrgMembership(AppUser user, String orgId) {
        if (user == null || user.getOrgId() == null || !user.getOrgId().equals(orgId)) {
            throw new SecurityException("Access denied: org mismatch");
        }
    }

    /** Throw unless the user is an administrator of the given organization. */
    public static void requireOrgAdmin(AppUser user, String orgId) {
        verifyOrgMembership(user, orgId);
        requireAdmin(user);
    }
}
