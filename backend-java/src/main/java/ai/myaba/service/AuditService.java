package ai.myaba.service;

import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Service
@Slf4j
public class AuditService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /**
     * Write an audit event to Firestore asynchronously so it never blocks
     * the API response path.
     *
     * <p>Backward-compatible overload — source IP and correlation ID default
     * to {@code null} when not provided by the caller.</p>
     */
    @Async
    public void log(String eventType, String userId, String clientId,
                    String documentId, String aclxContentId,
                    String decision, Object aclxLabel) {
        log(eventType, userId, clientId, documentId, aclxContentId,
            decision, aclxLabel, null, null);
    }

    /**
     * Enriched overload that also captures the source IP and request correlation
     * ID for full SOC 2 traceability.
     *
     * <h3>Fields written</h3>
     * <ul>
     *   <li>{@code eventType} — semantic event name (e.g. {@code DOCUMENT_GENERATED})</li>
     *   <li>{@code userId}, {@code clientId}, {@code documentId} — entity references</li>
     *   <li>{@code aclxContentId}, {@code decision}, {@code aclxLabel} — ACLX governance outcome</li>
     *   <li>{@code sourceIp} — originating client IP (via {@link ai.myaba.security.RequestCorrelationFilter})</li>
     *   <li>{@code correlationId} — links this event to the full request log trail</li>
     *   <li>{@code timestamp} — ISO-8601 string (human-readable)</li>
     *   <li>{@code timestampMs} — epoch milliseconds (used by {@link DataRetentionService} for range queries)</li>
     * </ul>
     */
    @Async
    public void log(String eventType, String userId, String clientId,
                    String documentId, String aclxContentId,
                    String decision, Object aclxLabel,
                    String sourceIp, String correlationId) {
        if (devMode) {
            log.info("[AUDIT-DEV] {} | user={} client={} decision={} ip={} corr={}",
                    eventType, userId, clientId, decision, sourceIp, correlationId);
            return;
        }

        try {
            Instant now = Instant.now();
            Firestore db = FirestoreClient.getFirestore();
            Map<String, Object> entry = new HashMap<>();
            entry.put("eventType",     eventType);
            entry.put("userId",        userId);
            entry.put("clientId",      clientId);
            entry.put("documentId",    documentId);
            entry.put("aclxContentId", aclxContentId);
            entry.put("decision",      decision);
            entry.put("aclxLabel",     aclxLabel);
            entry.put("sourceIp",      sourceIp);
            entry.put("correlationId", correlationId);
            entry.put("timestamp",     now.toString());
            entry.put("timestampMs",   now.toEpochMilli());  // used by DataRetentionService queries

            db.collection("auditLog").add(entry);
        } catch (Exception e) {
            // Audit failure must never crash the request
            log.error("Failed to write audit log: {}", e.getMessage());
        }
    }
}
