package ai.myaba.security;

import ai.myaba.model.dto.UserRole;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Migration-safety guarantee for the permission-engine rollout: with an EMPTY per-org role
 * config, the resolver's capabilities MUST reproduce today's hardcoded {@code UserRole}
 * behavior exactly for every built-in role. This test is kept green through every phase — if
 * it breaks, some existing org's access (possibly PHI) is about to change.
 *
 * <p>orgId is null so no Firestore/config lookup happens: pure built-in {@link PermissionDefaults}.
 */
class PermissionServiceParityTest {

    private final PermissionService svc = new PermissionService(null);

    private static final List<String> ROLES = List.of(
            UserRole.ORG_SUPER_ADMIN, UserRole.CLINICAL_DIRECTOR,
            UserRole.SUPERVISING_BCBA, UserRole.RBT, UserRole.GENERAL_STAFF);

    private EffectivePermissions p(String role) {
        return svc.resolveForRole(role, null);
    }

    @Test
    void capabilitiesMatchLegacyUserRolePredicates() {
        for (String role : ROLES) {
            EffectivePermissions perm = p(role);

            assertEquals(UserRole.canInitiateClinicalChat(role), perm.can(Capability.AI_CLINICAL_CHAT), role + " AI_CLINICAL_CHAT");
            assertEquals(UserRole.canUseGeneralChat(role),       perm.can(Capability.AI_GENERAL_CHAT),  role + " AI_GENERAL_CHAT");
            assertEquals(UserRole.hasPhiAccess(role),            perm.phiAccess(),                       role + " phiAccess");
            // documents != none reproduces the PHI/clinical-generate role set exactly.
            assertEquals(UserRole.hasPhiAccess(role),            perm.can(Capability.DOCUMENT_GENERATE), role + " DOCUMENT_GENERATE");
            // administration != none == the legacy isAdmin set.
            assertEquals(UserRole.isAdmin(role),                 perm.can(Capability.ADMIN_MANAGE),      role + " ADMIN_MANAGE");
            assertEquals(UserRole.isAdmin(role),                 perm.can(Capability.TEAM_MANAGE),       role + " TEAM_MANAGE");
            assertEquals(UserRole.isAdmin(role),                 perm.can(Capability.CLIENT_VIEW_ALL),   role + " CLIENT_VIEW_ALL");
            assertEquals(UserRole.isAdmin(role),                 perm.can(Capability.PROJECT_VIEW_ALL),  role + " PROJECT_VIEW_ALL");
            assertEquals(UserRole.isAdmin(role),                 perm.can(Capability.ORG_CONTENT_WRITE), role + " ORG_CONTENT_WRITE");
            // administration == all == the legacy ORG_SUPER_ADMIN-only sites.
            assertEquals(UserRole.ORG_SUPER_ADMIN.equals(role),  perm.can(Capability.ADMIN_SUPER),       role + " ADMIN_SUPER");
            assertEquals(UserRole.ORG_SUPER_ADMIN.equals(role),  perm.can(Capability.PROJECT_RESTORE),   role + " PROJECT_RESTORE");
        }
    }

    @Test
    void derivedCapabilityTruthTables() {
        // clients == all
        assertCapability(Capability.CLIENT_MANAGE, Set.of(
                UserRole.ORG_SUPER_ADMIN, UserRole.CLINICAL_DIRECTOR, UserRole.SUPERVISING_BCBA));
        // documents == all (RBT's 'custom' means generate-but-not-approve)
        assertCapability(Capability.DOCUMENT_APPROVE, Set.of(
                UserRole.ORG_SUPER_ADMIN, UserRole.CLINICAL_DIRECTOR, UserRole.SUPERVISING_BCBA));
        // projects == all
        assertCapability(Capability.PROJECT_CREATE, Set.of(
                UserRole.ORG_SUPER_ADMIN, UserRole.CLINICAL_DIRECTOR, UserRole.SUPERVISING_BCBA, UserRole.RBT));
        // resources != none (RBT is the only role with no library access)
        assertCapability(Capability.RESOURCE_LIBRARY_ADD, Set.of(
                UserRole.ORG_SUPER_ADMIN, UserRole.CLINICAL_DIRECTOR, UserRole.SUPERVISING_BCBA, UserRole.GENERAL_STAFF));
    }

    @Test
    void customRoleResolvesFromBaselineWhenNoOrgConfig() {
        // With no org config, an unknown/custom role key falls through to "none" everywhere
        // (no NPE, least privilege). Full custom-role resolution is exercised in Phase 4.
        EffectivePermissions perm = svc.resolveForRole("custom_office_manager_ab12", null);
        for (Capability cap : Capability.values()) {
            assertEquals(false, perm.can(cap), "unknown role should hold no capability: " + cap);
        }
        assertEquals(false, perm.phiAccess(), "unknown role should not have phiAccess");
    }

    private void assertCapability(Capability cap, Set<String> expectedTrue) {
        for (String role : ROLES) {
            assertEquals(expectedTrue.contains(role), p(role).can(cap), role + " " + cap);
        }
    }
}
