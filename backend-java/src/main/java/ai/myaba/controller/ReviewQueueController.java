package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.ReviewQueueService;
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
 * ACLX escalation review queue endpoints.
 * All endpoints require ORG_ADMIN or ORG_SUPER_ADMIN role
 * (enforced inside ReviewQueueService).
 *
 * GET  /api/review-queue              — list all items for the org (newest first)
 * GET  /api/review-queue/pending-count — count of PENDING items (for sidebar badge)
 * POST /api/review-queue/{id}/review  — submit APPROVED or DENIED verdict
 */
@RestController
@RequestMapping("/api/review-queue")
@RequiredArgsConstructor
@Slf4j
public class ReviewQueueController {

    private final ReviewQueueService reviewQueueService;

    @GetMapping
    public ResponseEntity<?> getQueue(@AuthenticationPrincipal AppUser user) {
        try {
            List<Map<String, Object>> items = reviewQueueService.getQueue(user);
            return ResponseEntity.ok(items);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("getQueue failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch review queue"));
        }
    }

    @GetMapping("/pending-count")
    public ResponseEntity<Map<String, Integer>> getPendingCount(@AuthenticationPrincipal AppUser user) {
        int count = reviewQueueService.getPendingCount(user);
        return ResponseEntity.ok(Map.of("count", count));
    }

    @PostMapping("/{itemId}/review")
    public ResponseEntity<?> submitReview(
            @AuthenticationPrincipal AppUser user,
            @PathVariable String itemId,
            @RequestBody Map<String, String> body) {

        String verdict = body.getOrDefault("verdict", "").strip().toUpperCase();
        String notes   = body.getOrDefault("notes", "").strip();

        if (verdict.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "verdict is required"));
        }

        try {
            Map<String, Object> updated = reviewQueueService.submitReview(user, itemId, verdict, notes);
            log.info("Review submitted: item={} verdict={} reviewer={}", itemId, verdict, user.getUid());
            return ResponseEntity.ok(updated);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("submitReview failed for item {}: {}", itemId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Review submission failed"));
        }
    }
}
