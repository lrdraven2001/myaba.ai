package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.SubjectAuthorizationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * REST endpoints for subject (client) authorization records.
 *
 * <p>Authorizations record that a legally-required consent, waiver, or
 * authorization document exists for a subject. They are attached to every
 * ACLX evaluate call as {@code authorization_context} so the gateway can
 * verify the authorization before permitting access to protected data categories.
 *
 * <pre>
 *   GET  /api/clients/{clientId}/authorizations               list all records
 *   POST /api/clients/{clientId}/authorizations               add a new record (admin)
 *   POST /api/clients/{clientId}/authorizations/{id}/revoke   revoke a record (admin)
 * </pre>
 */
@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
@Slf4j
public class SubjectAuthorizationController {

    private final SubjectAuthorizationService authService;

    // ── GET all authorization records for a client ────────────────────────────

    @GetMapping("/{clientId}/authorizations")
    public ResponseEntity<?> getAuthorizations(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String clientId) {
        try {
            // Return all records (including expired/revoked) for admin UI;
            // active-only filtering happens inside evaluate() via AclxService
            List<Map<String, Object>> records = authService.getAllAuthorizations(
                    user.getOrgId(), clientId);
            return ResponseEntity.ok(records);
        } catch (Exception e) {
            log.error("getAuthorizations failed for client {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to load authorizations"));
        }
    }

    // ── POST add an authorization record ─────────────────────────────────────

    /**
     * Body: {@code { type, scope[], expiry?, evidenceRef? }}
     *
     * <p>{@code type} and {@code scope} values are domain-defined strings.
     * For HIPAA: type = RESEARCH | PART_2_CONSENT | HIPAA_AUTHORIZATION;
     * scope = PHI | CLINICAL | SUD | PSYCHOTHERAPY | HIV | GENETIC.
     */
    @PostMapping("/{clientId}/authorizations")
    public ResponseEntity<?> addAuthorization(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String clientId,
            @RequestBody Map<String, Object> body) {
        try {
            String type        = str(body, "type");
            String expiry      = str(body, "expiry");
            String evidenceRef = str(body, "evidenceRef");

            if (type.isBlank())
                return ResponseEntity.badRequest().body(Map.of("error", "type is required"));

            @SuppressWarnings("unchecked")
            List<String> scope = body.get("scope") instanceof List<?>
                    ? (List<String>) body.get("scope")
                    : List.of();

            Map<String, Object> record = authService.addAuthorization(
                    user, clientId, type, scope,
                    expiry.isBlank() ? null : expiry,
                    evidenceRef.isBlank() ? null : evidenceRef);

            log.info("Authorization added: client={} type={} by={}", clientId, type, user.getUid());
            return ResponseEntity.ok(record);

        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("addAuthorization failed for client {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save authorization"));
        }
    }

    // ── POST revoke an authorization record ───────────────────────────────────

    @PostMapping("/{clientId}/authorizations/{authId}/revoke")
    public ResponseEntity<?> revokeAuthorization(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String clientId,
            @PathVariable String authId) {
        try {
            authService.revokeAuthorization(user, clientId, authId);
            log.info("Authorization revoked: client={} authId={} by={}", clientId, authId, user.getUid());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("revokeAuthorization failed: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to revoke authorization"));
        }
    }

    private String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString().strip() : "";
    }
}
