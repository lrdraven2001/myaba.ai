package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.security.AuthorizationUtil;
import ai.myaba.service.RoleConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Per-organisation role configuration: the role-permission matrix, custom roles,
 * and identity-provider group → role mappings.
 *
 * <pre>
 *   GET  /api/orgs/{orgId}/role-config   stored role configuration (or empty)
 *   PUT  /api/orgs/{orgId}/role-config   replace role configuration (admin only)
 * </pre>
 */
@RestController
@RequestMapping("/api/orgs")
@RequiredArgsConstructor
@Slf4j
public class RoleConfigController {

    private final RoleConfigService roleConfigService;

    @GetMapping("/{orgId}/role-config")
    public ResponseEntity<?> getRoleConfig(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String orgId) {
        AuthorizationUtil.verifyOrgMembership(user, orgId);
        return ResponseEntity.ok(roleConfigService.getConfig(orgId));
    }

    @PutMapping("/{orgId}/role-config")
    public ResponseEntity<?> saveRoleConfig(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String orgId,
            @RequestBody Map<String, Object> body) {
        AuthorizationUtil.verifyOrgMembership(user, orgId);
        Map<String, Object> saved = roleConfigService.saveConfig(user, body);
        log.info("Role config saved for org {}", orgId);
        return ResponseEntity.ok(saved);
    }
}
