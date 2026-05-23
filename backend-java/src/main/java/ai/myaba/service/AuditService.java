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
     */
    @Async
    public void log(String eventType, String userId, String clientId,
                    String documentId, String aclxContentId,
                    String decision, Object aclxLabel) {
        if (devMode) {
            log.info("[AUDIT-DEV] {} | user={} client={} decision={}",
                    eventType, userId, clientId, decision);
            return;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            Map<String, Object> entry = new HashMap<>();
            entry.put("eventType", eventType);
            entry.put("userId", userId);
            entry.put("clientId", clientId);
            entry.put("documentId", documentId);
            entry.put("aclxContentId", aclxContentId);
            entry.put("decision", decision);
            entry.put("aclxLabel", aclxLabel);
            entry.put("timestamp", Instant.now().toString());

            db.collection("auditLog").add(entry);
        } catch (Exception e) {
            // Audit failure must never crash the request
            log.error("Failed to write audit log: {}", e.getMessage());
        }
    }
}
