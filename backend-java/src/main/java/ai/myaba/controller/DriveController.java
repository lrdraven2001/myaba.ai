package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.DriveConnectionRequest;
import ai.myaba.service.DriveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * REST endpoints for HIPAA-compliant Drive (Google Drive / OneDrive) connections.
 *
 * All routes are under /api/drive.
 * Any authenticated org member can list connections.
 * Any authenticated org member can link a document (permission enforcement is on the doc itself).
 * Only the linking user or an admin can remove a connection.
 */
@RestController
@RequestMapping("/api/drive")
@RequiredArgsConstructor
@Slf4j
public class DriveController {

    private final DriveService driveService;

    // ── Endpoints ─────────────────────────────────────────────────────────

    /**
     * GET /api/drive/connections
     * Returns all drive connections for the caller's organization.
     */
    @GetMapping("/connections")
    public ResponseEntity<List<Map<String, Object>>> listConnections(
            @AuthenticationPrincipal AppUser user) throws Exception {
        return ResponseEntity.ok(driveService.getConnections(user));
    }

    /**
     * POST /api/drive/connections
     * Links a new Drive document/folder. Returns { id }.
     */
    @PostMapping("/connections")
    public ResponseEntity<Map<String, Object>> createConnection(
            @AuthenticationPrincipal AppUser user,
            @RequestBody DriveConnectionRequest req) throws Exception {
        String id = driveService.createConnection(user, req);
        return ResponseEntity.ok(Map.of("id", id));
    }

    /**
     * DELETE /api/drive/connections/{id}
     * Removes a Drive connection. Only the linking user or an admin may delete.
     */
    @DeleteMapping("/connections/{id}")
    public ResponseEntity<Void> deleteConnection(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String id) throws Exception {
        driveService.deleteConnection(user, id);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/drive/verify
     * Checks whether a Drive item has a HIPAA label applied.
     * Body: { driveSource: "google"|"microsoft", url: "..." }
     */
    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verifyHipaa(
            @AuthenticationPrincipal AppUser user,
            @RequestBody Map<String, String> body) {
        String driveSource = body.get("driveSource");
        String url = body.get("url");
        Map<String, Object> result = driveService.verifyHipaaLabels(driveSource, url);
        return ResponseEntity.ok(result);
    }

    // ── Exception handlers ────────────────────────────────────────────────

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException ex) {
        log.warn("Drive access denied: {}", ex.getMessage());
        return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(404).body(Map.of("error", ex.getMessage()));
    }
}
