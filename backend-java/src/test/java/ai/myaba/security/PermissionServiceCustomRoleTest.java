package ai.myaba.security;

import ai.myaba.model.dto.UserRole;
import ai.myaba.service.RoleConfigService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Phase 4: a custom role resolves via its baseline built-in role, honors per-category
 * overrides, computes phiAccess correctly, and is accepted by {@link PermissionService#isKnownRole}.
 */
class PermissionServiceCustomRoleTest {

    /** Stub the org's stored config: one custom role "Lead RBT" (baseline RBT) with a
     *  documents=all override so it can approve documents (RBT baseline cannot). */
    private PermissionService withCustomRole() {
        RoleConfigService stub = new RoleConfigService() {
            @Override
            public Map<String, Object> getConfig(String orgId) {
                return Map.of(
                        "roles", Map.of("custom_lead_rbt", Map.of("documents", "all")),
                        "customRoles", List.of(Map.of(
                                "key", "custom_lead_rbt", "label", "Lead RBT",
                                "baseline", UserRole.RBT, "permissions", Map.of())));
            }
        };
        return new PermissionService(stub);
    }

    @Test
    void customRoleInheritsBaselineAndAppliesOverrides() {
        PermissionService svc = withCustomRole();
        EffectivePermissions p = svc.resolveForRole("custom_lead_rbt", "org-1");

        // Baseline RBT: ai_features=all, projects=all → clinical chat + phiAccess.
        assertTrue(p.can(Capability.AI_CLINICAL_CHAT), "inherits RBT clinical chat");
        assertTrue(p.phiAccess(), "inherits RBT phiAccess");
        assertTrue(p.can(Capability.PROJECT_CREATE), "inherits RBT project create");
        // Override documents=all → can now approve (baseline RBT documents=custom cannot).
        assertTrue(p.can(Capability.DOCUMENT_APPROVE), "documents override grants approve");
        // Baseline RBT has no admin/team.
        assertFalse(p.can(Capability.ADMIN_MANAGE), "RBT baseline is not admin");
        assertFalse(p.can(Capability.TEAM_MANAGE), "RBT baseline cannot manage team");
    }

    @Test
    void isKnownRoleAcceptsBuiltInAndCustomOnly() {
        PermissionService svc = withCustomRole();
        assertTrue(svc.isKnownRole(UserRole.RBT, "org-1"), "built-in role is known");
        assertTrue(svc.isKnownRole("custom_lead_rbt", "org-1"), "org's custom role is known");
        assertFalse(svc.isKnownRole("custom_not_defined", "org-1"), "undefined custom key rejected");
        assertFalse(svc.isKnownRole("", "org-1"), "blank rejected");
    }
}
