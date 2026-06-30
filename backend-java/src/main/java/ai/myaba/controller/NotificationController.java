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
    public ResponseEntity<?> list(@AuthenticationPrincipal AppUser user) throws Exception {
        List<Map<String, Object>> items = notificationService.list(user);
        long unread = items.stream().filter(n -> !Boolean.TRUE.equals(n.get("read"))).count();
        return ResponseEntity.ok(Map.of("items", items, "unread", unread));
    }

    @PostMapping("/api/notifications/{id}/read")
    public ResponseEntity<?> markRead(@PathVariable String id, @AuthenticationPrincipal AppUser user) throws Exception {
        notificationService.markRead(user, id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/notifications/read-all")
    public ResponseEntity<?> markAllRead(@AuthenticationPrincipal AppUser user) throws Exception {
        notificationService.markAllRead(user);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /** Admin: send a system message to every active member of the org. */
    @PostMapping("/api/orgs/{orgId}/notifications/broadcast")
    public ResponseEntity<?> broadcast(
            @PathVariable String orgId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) throws Exception {

        boolean admin = orgId.equals(user.getOrgId()) && UserRole.isAdmin(user.getRole());
        if (!admin) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }
        String title = body.get("title");
        if (title == null || title.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "title is required"));
        }
        int sent = notificationService.broadcast(
                orgId, title.trim(), body.getOrDefault("body", ""),
                body.getOrDefault("level", "info"), user.getUid());
        return ResponseEntity.ok(Map.of("sent", sent));
    }
}
