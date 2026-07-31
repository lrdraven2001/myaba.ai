package ai.myaba.security;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.RoleConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The authoritative per-org authorization resolver. Turns {@code (role, orgId)} + the org's
 * stored {@link RoleConfigService} matrix + the built-in {@link PermissionDefaults} into an
 * {@link EffectivePermissions} snapshot (levels + capabilities + phiAccess).
 *
 * <p>Resolution precedence per (role, category), mirroring the frontend {@code levelFor}:
 * stored {@code roles[roleKey][cat]} override → (custom role) {@code permissions[cat]} →
 * {@code DEFAULTS[baseline][cat]} → (built-in) {@code DEFAULTS[roleKey][cat]} → {@code none}.
 *
 * <p>The org's role-config is cached (short TTL) so this does NOT add a Firestore read per
 * request, and matrix edits take effect on the next request (bounded by TTL / explicit
 * {@link #invalidate}) with no token refresh — only a change to a user's ROLE requires
 * re-minting their claims.
 *
 * <p>NOTE (Phase 1): this service is not yet consulted by any live enforcement path. It ships
 * with {@code PermissionServiceParityTest} proving it reproduces {@code UserRole} behavior on
 * an empty config, so subsequent phases can redirect call sites to it safely.
 */
@Service
@Slf4j
public class PermissionService {

    private static final long TTL_MS = 60_000;

    private final RoleConfigService roleConfigService;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public PermissionService(RoleConfigService roleConfigService) {
        this.roleConfigService = roleConfigService;
    }

    private record Cached(Map<String, Object> config, long ts) {}

    /** Drop the cached role-config for an org (call after the matrix is saved). */
    public void invalidate(String orgId) {
        if (orgId != null) cache.remove(orgId);
    }

    /** Resolve for the given user in their own org. */
    public EffectivePermissions resolve(AppUser user) {
        return resolve(user, user == null ? null : user.getOrgId());
    }

    /** Resolve for the given user against a specific org. */
    public EffectivePermissions resolve(AppUser user, String orgId) {
        return resolveForRole(user == null ? null : user.getRole(), orgId);
    }

    /** Convenience: does the user hold a capability (resolved in their own org). */
    public boolean can(AppUser user, Capability capability) {
        return resolve(user).can(capability);
    }

    /**
     * Resolve capabilities for a raw role key in an org. When {@code orgId} is null the org
     * config is skipped entirely (pure built-in defaults) — used by the parity test.
     */
    @SuppressWarnings("unchecked")
    public EffectivePermissions resolveForRole(String role, String orgId) {
        Map<String, Object> config = orgId == null ? Collections.emptyMap() : configFor(orgId);
        Map<String, Object> rolesOverrides = asMap(config.get("roles"));
        List<Object> customRoles = asList(config.get("customRoles"));

        Map<String, Object> customRole = null;
        if (role != null) {
            for (Object cr : customRoles) {
                Map<String, Object> m = asMap(cr);
                if (m != null && role.equals(str(m.get("key")))) { customRole = m; break; }
            }
        }
        boolean isCustom = customRole != null;
        String baseline = isCustom ? str(customRole.get("baseline")) : null;
        Map<String, Object> customPerms = isCustom ? asMap(customRole.get("permissions")) : null;
        Map<String, Object> override = rolesOverrides == null ? null : asMap(rolesOverrides.get(role));

        Map<String, String> levels = new HashMap<>();
        for (String cat : PermissionDefaults.CATEGORIES) {
            levels.put(cat, resolveLevel(cat, role, override, isCustom, customPerms, baseline));
        }

        Set<Capability> granted = EnumSet.noneOf(Capability.class);
        for (Capability cap : Capability.values()) {
            if (cap.grantedBy(levels.get(cap.category))) granted.add(cap);
        }

        boolean phiAccess = "all".equals(levels.get("ai_features"))
                || !"none".equals(levels.get("documents"))
                || !"none".equals(levels.get("projects"))
                || "all".equals(levels.get("clients"));

        return new EffectivePermissions(levels, granted, phiAccess);
    }

    // ── internals ────────────────────────────────────────────────────────────

    private String resolveLevel(String cat, String role, Map<String, Object> override,
                                boolean isCustom, Map<String, Object> customPerms, String baseline) {
        if (override != null) {
            String o = str(override.get(cat));
            if (o != null && !o.isBlank()) return o;
        }
        if (isCustom) {
            String p = customPerms == null ? null : str(customPerms.get(cat));
            if (p != null && !p.isBlank()) return p;
            return PermissionDefaults.defaultLevel(baseline, cat);
        }
        return PermissionDefaults.defaultLevel(role, cat);
    }

    private Map<String, Object> configFor(String orgId) {
        long now = System.currentTimeMillis();
        Cached c = cache.get(orgId);
        if (c != null && now - c.ts() < TTL_MS) return c.config();
        Map<String, Object> cfg = roleConfigService.getConfig(orgId);
        cache.put(orgId, new Cached(cfg, now));
        return cfg;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) {
        return (o instanceof Map) ? (Map<String, Object>) o : null;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> asList(Object o) {
        return (o instanceof List) ? (List<Object>) o : Collections.emptyList();
    }

    private static String str(Object o) {
        return (o instanceof String) ? (String) o : null;
    }
}
