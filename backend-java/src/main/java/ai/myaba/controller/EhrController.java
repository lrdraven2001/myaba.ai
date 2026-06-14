package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.EhrClientRecord;
import ai.myaba.model.dto.EhrConnectionStatus;
import ai.myaba.service.EhrService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST API for EHR integration management.
 *
 * <p>All endpoints require authentication.
 * Connect/disconnect requires admin role.
 * Search and sync require at minimum a clinical role.
 *
 * <pre>
 *   GET    /api/ehr/connections                    — list all integration statuses
 *   POST   /api/ehr/connections/{type}             — connect (admin only)
 *   DELETE /api/ehr/connections/{type}             — disconnect (admin only)
 *   GET    /api/ehr/connections/{type}/clients     — search EHR clients
 *   POST   /api/ehr/connections/{type}/sync        — sync EHR client to myABA client
 * </pre>
 */
@RestController
@RequestMapping("/api/ehr")
@RequiredArgsConstructor
@Slf4j
public class EhrController {

    private final EhrService ehrService;

    // ── GET /api/ehr/connections ──────────────────────────────────────────────

    /**
     * List connection status for all supported EHR types.
     * Available to all authenticated users (no credentials included in response).
     */
    @GetMapping("/connections")
    public ResponseEntity<?> getConnections(@AuthenticationPrincipal AppUser user) {
        if (user == null) return unauthorized();
        try {
            List<EhrConnectionStatus> statuses = ehrService.getConnectionStatuses(user.getOrgId());
            return ResponseEntity.ok(statuses);
        } catch (Exception e) {
            log.error("Failed to get EHR connections for org {}: {}", user.getOrgId(), e.getMessage());
            return serverError("Failed to load EHR connection status");
        }
    }

    // ── POST /api/ehr/connections/{type} ─────────────────────────────────────

    /**
     * Connect an EHR.  Tests credentials before storing.
     * Admin only.
     *
     * <p>Request body for CentralReach:
     * <pre>{ "apiToken": "...", "subdomain": "myagency" }</pre>
     *
     * <p>Request body for Rethink:
     * <pre>{ "apiKey": "...", "accountId": "..." }</pre>
     */
    @PostMapping("/connections/{type}")
    public ResponseEntity<?> connect(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String type,
            @RequestBody Map<String, String> credentials) {

        if (user == null) return unauthorized();
        if (!user.isAdmin()) return forbidden("Admin access required to configure EHR integrations");

        // Strip any null values and validate non-empty
        Map<String, String> clean = new HashMap<>();
        credentials.forEach((k, v) -> {
            if (v != null && !v.isBlank()) clean.put(k, v.trim());
        });
        if (clean.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No credentials provided"));
        }

        try {
            EhrConnectionStatus status = ehrService.connect(user.getOrgId(), type, clean);
            return ResponseEntity.ok(status);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.warn("EHR connect failed: org={} type={}: {}", user.getOrgId(), type, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "Could not connect to " + type + ": " + e.getMessage()));
        }
    }

    // ── DELETE /api/ehr/connections/{type} ───────────────────────────────────

    @DeleteMapping("/connections/{type}")
    public ResponseEntity<?> disconnect(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String type) {

        if (user == null) return unauthorized();
        if (!user.isAdmin()) return forbidden("Admin access required to remove EHR integrations");

        try {
            ehrService.disconnect(user.getOrgId(), type);
            return ResponseEntity.ok(Map.of("message", type + " disconnected"));
        } catch (Exception e) {
            log.error("EHR disconnect failed: org={} type={}: {}", user.getOrgId(), type, e.getMessage());
            return serverError("Failed to disconnect " + type);
        }
    }

    // ── GET /api/ehr/connections/{type}/clients?q= ───────────────────────────

    /**
     * Search for clients by name in the connected EHR.
     * Used by the client-linking UI.
     */
    @GetMapping("/connections/{type}/clients")
    public ResponseEntity<?> searchClients(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String type,
            @RequestParam(name = "q", defaultValue = "") String query) {

        if (user == null) return unauthorized();
        if (query.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Search query required"));
        }

        try {
            List<EhrClientRecord> results = ehrService.searchClients(user.getOrgId(), type, query);
            return ResponseEntity.ok(Map.of("results", results, "count", results.size()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("EHR client search failed: org={} type={} q={}: {}",
                    user.getOrgId(), type, query, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "EHR search failed: " + e.getMessage()));
        }
    }

    // ── POST /api/ehr/connections/{type}/sync ────────────────────────────────

    /**
     * Link an EHR client to a myABA client and pull their record.
     *
     * <p>Request body:
     * <pre>{ "ehrClientId": "12345", "myabaClientId": "abc123" }</pre>
     */
    @PostMapping("/connections/{type}/sync")
    public ResponseEntity<?> syncClient(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String type,
            @RequestBody Map<String, String> body) {

        if (user == null) return unauthorized();

        String ehrClientId   = body.get("ehrClientId");
        String myabaClientId = body.get("myabaClientId");

        if (ehrClientId == null || ehrClientId.isBlank()
                || myabaClientId == null || myabaClientId.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "ehrClientId and myabaClientId are required"));
        }

        try {
            EhrClientRecord record = ehrService.syncClient(
                    user.getOrgId(), type, ehrClientId, myabaClientId);
            return ResponseEntity.ok(Map.of(
                    "record",  record,
                    "message", "Client record synced from " + type
            ));
        } catch (Exception e) {
            log.error("EHR client sync failed: org={} type={} ehrId={}: {}",
                    user.getOrgId(), type, ehrClientId, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "Sync failed: " + e.getMessage()));
        }
    }

    // ── Error helpers ─────────────────────────────────────────────────────────

    private ResponseEntity<Map<String, Object>> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Not authenticated"));
    }

    private ResponseEntity<Map<String, Object>> forbidden(String message) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", message));
    }

    private ResponseEntity<Map<String, Object>> serverError(String message) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", message));
    }
}
