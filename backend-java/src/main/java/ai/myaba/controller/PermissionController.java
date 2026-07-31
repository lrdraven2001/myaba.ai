package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.security.EffectivePermissions;
import ai.myaba.security.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Exposes the caller's resolved permissions to the frontend so the UI can gate on the
 * same capabilities the backend enforces (matrix + custom roles), instead of hardcoded
 * role names. The backend remains the authority — this is for showing/hiding controls.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PermissionController {

    private final PermissionService permissionService;

    /** The current user's granted capabilities, PHI flag, and per-category levels. */
    @GetMapping("/me/permissions")
    public ResponseEntity<?> myPermissions(@AuthenticationPrincipal AppUser user) {
        if (user == null || user.getOrgId() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
        }
        EffectivePermissions p = permissionService.resolve(user);
        return ResponseEntity.ok(Map.of(
                "capabilities", p.granted().stream().map(Enum::name).sorted().toList(),
                "phiAccess",    p.phiAccess(),
                "levels",       p.levels()));
    }
}
