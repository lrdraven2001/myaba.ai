package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.StyleSignalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Communication-style learning (Phase 2) endpoints.
 *
 * <ul>
 *   <li>POST /api/style-signals — any authenticated user records a PHI-free
 *       interaction signal (regeneration adjustment or thumbs) on their own chat.</li>
 *   <li>GET  /api/orgs/{orgId}/style-candidates — admin: distilled suggestions.</li>
 *   <li>POST /api/orgs/{orgId}/style-candidates/apply|dismiss — admin: confirm.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class StyleController {

    private final StyleSignalService styleSignalService;

    @PostMapping("/style-signals")
    public ResponseEntity<?> recordSignal(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        styleSignalService.record(
                user.getOrgId(), user.getUid(),
                body.get("signal"), body.getOrDefault("surface", "chat"), body.get("note"));
        return ResponseEntity.ok(Map.of("recorded", true));
    }

    @GetMapping("/orgs/{orgId}/style-candidates")
    public ResponseEntity<?> candidates(
            @PathVariable String orgId,
            @AuthenticationPrincipal AppUser user) {
        if (!user.isAdmin() || !orgId.equals(user.getOrgId())) return forbidden();
        return ResponseEntity.ok(styleSignalService.candidates(orgId));
    }

    @PostMapping("/orgs/{orgId}/style-candidates/apply")
    public ResponseEntity<?> apply(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        if (!user.isAdmin() || !orgId.equals(user.getOrgId())) return forbidden();
        String key = body.get("key");
        if (key == null || key.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "key required"));
        try {
            styleSignalService.apply(orgId, key);
            return ResponseEntity.ok(Map.of("applied", key));
        } catch (Exception e) {
            log.error("apply style candidate failed org={} key={}: {}", orgId, key, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to apply suggestion"));
        }
    }

    @PostMapping("/orgs/{orgId}/style-candidates/dismiss")
    public ResponseEntity<?> dismiss(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        if (!user.isAdmin() || !orgId.equals(user.getOrgId())) return forbidden();
        String key = body.get("key");
        if (key == null || key.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "key required"));
        try {
            styleSignalService.dismiss(orgId, key);
            return ResponseEntity.ok(Map.of("dismissed", key));
        } catch (Exception e) {
            log.error("dismiss style candidate failed org={} key={}: {}", orgId, key, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to dismiss suggestion"));
        }
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Admin access required"));
    }
}
