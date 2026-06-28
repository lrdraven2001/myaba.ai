package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import com.google.firebase.auth.FirebaseAuth;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Dev/test helper controller for managing Firebase custom claims without the Admin SDK script.
 *
 * <p><b>Only available when {@code dev.auth-enabled=true}.</b>  Every mutating endpoint
 * returns 403 in production (when {@code dev.auth-enabled=false}).
 *
 * <p>Endpoints:
 * <ul>
 *   <li>POST /api/dev/claims  — set custom claims for a user by uid
 *   <li>GET  /api/dev/me      — return the current user's resolved claims (useful for debugging)
 * </ul>
 *
 * Used during local emulator testing when {@code seed-auth-users.mjs} hasn't been run yet,
 * or to quickly switch roles for manual QA.
 */
@RestController
@RequestMapping("/api/dev")
@Slf4j
public class DevAdminController {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /**
     * GET /api/dev/me
     *
     * Returns the currently authenticated user's resolved AppUser (role, orgId, purpose, etc.).
     * Works in both dev-stub mode and real Firebase mode — useful for verifying claims propagation.
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(@AuthenticationPrincipal AppUser user) {
        Map<String, Object> result = new HashMap<>();
        result.put("uid",          user.getUid());
        result.put("email",        user.getEmail());
        result.put("displayName",  user.getDisplayName());
        result.put("role",         user.getRole());
        result.put("purpose",      user.getPurpose());
        result.put("orgId",        user.getOrgId());
        result.put("supervisorId", user.getSupervisorId());
        result.put("isClinical",   user.isClinical());
        result.put("isBcba",       user.isBcba());
        result.put("isAdmin",      user.isAdmin());
        result.put("devMode",      devMode);
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/dev/claims
     *
     * Sets Firebase custom claims for the given user uid. Only works in dev mode
     * (when the Firebase Auth emulator is running).
     *
     * Request body:
     * <pre>
     * {
     *   "uid":          "firebase-uid",
     *   "role":         "TREATING_BCBA",
     *   "orgId":        "dev-org-001",
     *   "purpose":      "treatment",
     *   "supervisorId": "optional-uid"   // RBT / BCBA_STUDENT only
     * }
     * </pre>
     *
     * Valid role values: ORG_SUPER_ADMIN, ORG_ADMIN, TREATING_BCBA, SUPERVISING_BCBA,
     *                    BCBA_STUDENT, RBT, SCHEDULING_ADMIN, BILLING_ADMIN
     */
    @PostMapping("/claims")
    public ResponseEntity<Map<String, Object>> setClaims(
            @AuthenticationPrincipal AppUser currentUser,
            @RequestBody Map<String, String> body) throws Exception {

        if (!devMode) {
            return ResponseEntity.status(403)
                    .body(Map.of("error", "This endpoint is only available in dev mode"));
        }

        // In dev mode FirebaseApp may be null; require real Firebase when using emulator
        try {
            FirebaseAuth.getInstance();
        } catch (Exception e) {
            return ResponseEntity.status(503)
                    .body(Map.of("error",
                            "Firebase not configured. Run with emulator credentials or use the seed-auth-users.mjs script."));
        }

        String uid         = body.get("uid");
        String role        = body.getOrDefault("role", UserRole.CLINICAL_DIRECTOR);
        String orgId       = body.getOrDefault("orgId", "dev-org-001");
        String purpose     = body.getOrDefault("purpose", "treatment");
        String supervisorId = body.get("supervisorId");

        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "uid is required"));
        }
        if (!UserRole.isValid(role)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unknown role: " + role,
                                 "validRoles", String.join(", ",
                                         UserRole.CLINICAL_ROLES.toString(),
                                         UserRole.ADMIN_ROLES.toString())));
        }

        Map<String, Object> claims = new HashMap<>();
        claims.put("role",    role);
        claims.put("orgId",   orgId);
        claims.put("purpose", purpose);
        if (supervisorId != null && !supervisorId.isBlank()) {
            claims.put("supervisorId", supervisorId);
        }

        FirebaseAuth.getInstance().setCustomUserClaims(uid, claims);
        log.info("DEV: set claims for uid={} role={} orgId={}", uid, role, orgId);

        return ResponseEntity.ok(Map.of(
                "uid",     uid,
                "role",    role,
                "orgId",   orgId,
                "purpose", purpose,
                "message", "Custom claims set. User must re-login (or call getIdToken(true)) to get updated token."
        ));
    }
}
