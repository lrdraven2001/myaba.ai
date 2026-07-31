package ai.myaba.security;

import java.util.Collections;
import java.util.Map;
import java.util.Set;

/**
 * A user's resolved permissions for one org: the effective level per category, the set of
 * granted {@link Capability}s, and the derived PHI-access flag. Immutable snapshot produced
 * by {@link PermissionService#resolve}.
 */
public final class EffectivePermissions {

    private final Map<String, String> levels;   // category → level (all|custom|none)
    private final Set<Capability> granted;
    private final boolean phiAccess;

    public EffectivePermissions(Map<String, String> levels, Set<Capability> granted, boolean phiAccess) {
        this.levels = Collections.unmodifiableMap(levels);
        this.granted = Collections.unmodifiableSet(granted);
        this.phiAccess = phiAccess;
    }

    /** True when the user holds {@code capability}. */
    public boolean can(Capability capability) {
        return granted.contains(capability);
    }

    /** Resolved level for a category ({@code all|custom|none}); {@code none} if unknown. */
    public String level(String category) {
        return levels.getOrDefault(category, "none");
    }

    /** Derived: may the user view/process protected health information. */
    public boolean phiAccess() {
        return phiAccess;
    }

    public Map<String, String> levels() {
        return levels;
    }

    public Set<Capability> granted() {
        return granted;
    }
}
