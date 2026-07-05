package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Compliance dashboard API.
 *
 * <p>Queries the myABA {@code auditLog} Firestore collection and returns
 * aggregated governance metrics for the requesting org's admin console.
 *
 * <h3>Endpoints</h3>
 * <ul>
 *   <li>{@code GET /api/compliance/summary?days=30} — decision distribution,
 *       top detectors, synthesis events, redaction volume, policy version</li>
 *   <li>{@code GET /api/compliance/events?days=7&limit=50} — recent audit
 *       events (metadata only — no PHI content)</li>
 * </ul>
 *
 * <p>Admin access required for both endpoints.
 */
@RestController
@RequestMapping("/api/compliance")
@Slf4j
public class ComplianceController {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    @org.springframework.beans.factory.annotation.Autowired
    private ai.myaba.service.AuditService auditService;

    // ── GET /api/compliance/summary ───────────────────────────────────────────

    @GetMapping("/summary")
    public ResponseEntity<?> getSummary(
            @RequestParam(defaultValue = "30") int days,
            @AuthenticationPrincipal AppUser user) {

        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        if (!user.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }

        if (devMode) {
            return ResponseEntity.ok(buildDevSummary());
        }

        try {
            long cutoffMs = Instant.now().minus(days, ChronoUnit.DAYS).toEpochMilli();

            // Per-org audit subcollection merged with legacy top-level rows.
            List<Map<String, Object>> docs = auditService.readOrgAudit(
                    user.getOrgId(), cutoffMs, null, 0);

            // Aggregate metrics
            Map<String, Long> decisionCounts = new LinkedHashMap<>();
            Map<String, Long> detectorCounts = new LinkedHashMap<>();
            Map<String, Long> eventTypeCounts = new LinkedHashMap<>();
            long synthesisCount   = 0;
            long totalRedactions  = 0;
            long totalEvents      = docs.size();
            String latestPolicy   = null;
            List<Map<String, Object>> recentEscalations = new ArrayList<>();

            for (Map<String, Object> data : docs) {

                // Decision distribution
                String decision = (String) data.get("decision");
                if (decision != null) {
                    decisionCounts.merge(decision, 1L, Long::sum);
                }

                // Event type distribution
                String eventType = (String) data.get("eventType");
                if (eventType != null) {
                    eventTypeCounts.merge(eventType, 1L, Long::sum);
                }

                // Synthesis detection count
                if (Boolean.TRUE.equals(data.get("aclxSynthesisDetected"))) {
                    synthesisCount++;
                }

                // Redaction volume
                Object redactCount = data.get("aclxRedactionCount");
                if (redactCount instanceof Number) {
                    totalRedactions += ((Number) redactCount).longValue();
                }

                // Latest OPA policy version seen
                String pv = (String) data.get("aclxPolicyVersion");
                if (pv != null && latestPolicy == null) latestPolicy = pv;

                // Detector aggregation from aclxDetectorSummary
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> detectorSummary =
                        (List<Map<String, Object>>) data.get("aclxDetectorSummary");
                if (detectorSummary != null) {
                    for (Map<String, Object> finding : detectorSummary) {
                        if (Boolean.TRUE.equals(finding.get("matched"))) {
                            String detector = (String) finding.getOrDefault("detector", "unknown");
                            detectorCounts.merge(detector, 1L, Long::sum);
                        }
                    }
                }

                // Collect recent escalations (last 10, metadata only)
                if ("ESCALATE".equals(decision) && recentEscalations.size() < 10) {
                    Map<String, Object> esc = new HashMap<>();
                    esc.put("eventType",   eventType);
                    esc.put("timestamp",   data.get("timestamp"));
                    esc.put("sensitivity", extractSensitivity(data));
                    esc.put("contentId",   data.get("aclxContentId"));
                    esc.put("synthesis",   data.get("aclxSynthesisDetected"));
                    recentEscalations.add(esc);
                }
            }

            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("periodDays",         days);
            summary.put("totalEvents",         totalEvents);
            summary.put("decisionCounts",      decisionCounts);
            summary.put("eventTypeCounts",      eventTypeCounts);
            summary.put("topDetectors",        sortedTop(detectorCounts, 8));
            summary.put("synthesisEvents",     synthesisCount);
            summary.put("totalRedactions",     totalRedactions);
            summary.put("latestPolicyVersion", latestPolicy);
            summary.put("recentEscalations",   recentEscalations);

            return ResponseEntity.ok(summary);

        } catch (Exception e) {
            log.error("Compliance summary query failed for org={}: {}", user.getOrgId(), e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to load compliance data"));
        }
    }

    // ── GET /api/compliance/events ────────────────────────────────────────────

    @GetMapping("/events")
    public ResponseEntity<?> getEvents(
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "50") int limit,
            @AuthenticationPrincipal AppUser user) {

        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        if (!user.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }

        if (devMode) {
            return ResponseEntity.ok(Map.of("events", List.of(), "total", 0));
        }

        try {
            long cutoffMs = Instant.now().minus(days, ChronoUnit.DAYS).toEpochMilli();
            int safeLimit = Math.min(limit, 200);

            // Per-org audit subcollection merged with legacy top-level rows,
            // already sorted newest-first and capped.
            List<Map<String, Object>> docs = auditService.readOrgAudit(
                    user.getOrgId(), cutoffMs, null, safeLimit);

            List<Map<String, Object>> events = docs.stream()
                    .map(data -> {
                        Map<String, Object> safe = new LinkedHashMap<>();
                        // Return metadata only — never client content or PHI
                        safe.put("id",            data.get("id"));
                        safe.put("eventType",     data.get("eventType"));
                        safe.put("timestamp",     data.get("timestamp"));
                        safe.put("decision",      data.get("decision"));
                        safe.put("sensitivity",   extractSensitivity(data));
                        safe.put("contentId",     data.get("aclxContentId"));
                        safe.put("policyVersion", data.get("aclxPolicyVersion"));
                        safe.put("redacted",      data.get("aclxRedactionCount"));
                        safe.put("synthesis",     data.get("aclxSynthesisDetected"));
                        safe.put("detectors",     data.get("aclxDetectorSummary"));
                        return safe;
                    })
                    .toList();

            return ResponseEntity.ok(Map.of("events", events, "total", events.size()));

        } catch (Exception e) {
            log.error("Compliance events query failed for org={}: {}", user.getOrgId(), e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to load compliance events"));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String extractSensitivity(Map<String, Object> data) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> label = (Map<String, Object>) data.get("aclxLabel");
            if (label != null) return (String) label.get("sensitivity");
        } catch (Exception ignored) {}
        return null;
    }

    private Map<String, Long> sortedTop(Map<String, Long> counts, int limit) {
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(limit)
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        Map.Entry::getValue,
                        (a, b) -> a,
                        LinkedHashMap::new
                ));
    }

    /** Dev-mode stub that returns representative data for UI development. */
    private Map<String, Object> buildDevSummary() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("periodDays",    30);
        m.put("totalEvents",   143);
        m.put("decisionCounts", Map.of("ALLOW", 128, "REDACT", 9, "BLOCK", 3, "ESCALATE", 3));
        m.put("eventTypeCounts", Map.of("CHAT_RESPONSE", 98, "DOCUMENT_GENERATED", 45));
        m.put("topDetectors",   Map.of("hipaa_phi", 21, "groundedness", 18, "semantic", 6, "synthesis", 3));
        m.put("synthesisEvents", 3);
        m.put("totalRedactions", 12);
        m.put("latestPolicyVersion", "acl-policy-v1.5.0");
        m.put("recentEscalations", List.of());
        return m;
    }
}
