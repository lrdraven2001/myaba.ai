package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import ai.myaba.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * In-app notification bell endpoints.
 *   GET  /api/notifications                       — current user's notifications
 *   POST /api/notifications/{id}/read             — mark one read
 *   POST /api/notifications/read-all              — mark all read
 *   POST /api/orgs/{orgId}/notifications/broadcast — admin: send a system message to the team
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/api/notifications")
    public ResponseEntity<?> list(@AuthenticationPrincipal AppUser user) {
        try {
            List<Map<String, Object>> items = notificationService.list(user);
            long unread = items.stream().filter(n -> !Boolean.TRUE.equals(n.get("read"))).count();
            return ResponseEntity.ok(Map.of("items", items, "unread", unread));
        } catch (Exception e) {
            log.error("list notifications failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to load notifications"));
        }
    }

    @PostMapping("/api/notifications/{id}/read")
    public ResponseEntity<?> markRead(@PathVariable String id, @AuthenticationPrincipal AppUser user) {
        try {
            notificationService.markRead(user, id);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to mark read"));
        }
    }

    @PostMapping("/api/notifications/read-all")
    public ResponseEntity<?> markAllRead(@AuthenticationPrincipal AppUser user) {
        try {
            notificationService.markAllRead(user);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to mark all read"));
        }
    }

    /** Admin: send a system message to every active member of the org. */
    @PostMapping("/api/orgs/{orgId}/notifications/broadcast")
    public ResponseEntity<?> broadcast(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {

        boolean admin = orgId.equals(user.getOrgId()) && UserRole.isAdmin(user.getRole());
        if (!admin) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }
        String title = body.get("title");
        if (title == null || title.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "title is required"));
        }
        try {
            int sent = notificationService.broadcast(
                    orgId, title.trim(), body.getOrDefault("body", ""),
                    body.getOrDefault("level", "info"), user.getUid());
            return ResponseEntity.ok(Map.of("sent", sent));
        } catch (Exception e) {
            log.error("broadcast failed for org {}: {}", orgId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to send notification"));
        }
    }
}
