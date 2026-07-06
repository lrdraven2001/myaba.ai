package ai.myaba.service;

import ai.myaba.model.dto.AclxResponse;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class AuditService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /**
     * Org-scoped audit events live under {@code organizations/{orgId}/auditLog}
     * so tenant isolation is structural, not query-discipline. Platform-level
     * events (no org, e.g. approved-creator changes) go to {@code platformAuditLog}.
     * Legacy rows written to the old top-level {@code auditLog} collection are
     * still read (merged) by {@link #readOrgAudit} and purged via the
     * collection-group retention job until they age out.
     */
    private com.google.cloud.firestore.CollectionReference auditCollection(Firestore db, String orgId) {
        if (orgId != null && !orgId.isBlank()) {
            return db.collection("organizations").document(orgId).collection("auditLog");
        }
        return db.collection("platformAuditLog");
    }

    /**
     * Read an org's audit entries, newest-first: the per-org subcollection merged
     * with legacy top-level {@code auditLog} rows (filtered by orgId). Optional
     * {@code userId} narrows to one member; optional {@code sinceMs} bounds the
     * window; {@code limit <= 0} means unbounded. Each entry carries {@code id}.
     */
    public List<Map<String, Object>> readOrgAudit(String orgId, Long sinceMs,
                                                  String userId, int limit) throws Exception {
        Firestore db = FirestoreClient.getFirestore();
        int cap = limit > 0 ? limit : Integer.MAX_VALUE;
        List<Map<String, Object>> out = new java.util.ArrayList<>();

        com.google.cloud.firestore.Query sub = auditCollection(db, orgId);
        if (userId  != null) sub = sub.whereEqualTo("userId", userId);
        if (sinceMs != null) sub = sub.whereGreaterThan("timestampMs", sinceMs);
        if (limit > 0)       sub = sub.limit(cap);
        for (var d : sub.get().get().getDocuments()) {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            out.add(m);
        }

        // Legacy top-level collection (pre-migration rows). This query is
        // equality(orgId) + range(timestampMs), which needs a composite index.
        // Wrapped in its own try/catch so a missing index (or any legacy-query
        // failure) degrades to "subcollection only" instead of emptying the whole
        // read — otherwise Insights and the Audit Log go blank in production while
        // the current per-org data is perfectly readable.
        try {
            com.google.cloud.firestore.Query legacy = db.collection("auditLog").whereEqualTo("orgId", orgId);
            if (userId  != null) legacy = legacy.whereEqualTo("userId", userId);
            if (sinceMs != null) legacy = legacy.whereGreaterThan("timestampMs", sinceMs);
            if (limit > 0)       legacy = legacy.limit(cap);
            for (var d : legacy.get().get().getDocuments()) {
                Map<String, Object> m = new HashMap<>(d.getData());
                m.put("id", d.getId());
                out.add(m);
            }
        } catch (Exception e) {
            log.warn("Legacy auditLog query failed (continuing with per-org subcollection only) "
                    + "for org={}: {}", orgId, e.getMessage());
        }

        out.sort((a, b) -> Long.compare(
                b.get("timestampMs") instanceof Number nb ? nb.longValue() : 0L,
                a.get("timestampMs") instanceof Number na ? na.longValue() : 0L));
        return out.size() > cap ? new java.util.ArrayList<>(out.subList(0, cap)) : out;
    }

    /**
     * Write an audit event to Firestore asynchronously so it never blocks
     * the API response path.
     *
     * <p>Backward-compatible overload — source IP and correlation ID default
     * to {@code null} when not provided by the caller.</p>
     */
    @Async
    public void log(String eventType, String orgId, String userId, String clientId,
                    String documentId, String aclxContentId,
                    String decision, Object aclxLabel) {
        log(eventType, orgId, userId, clientId, documentId, aclxContentId,
            decision, aclxLabel, null, null);
    }

    /**
     * Fully-enriched ACLX overload — logs all governance fields from an
     * {@link AclxResponse} alongside the standard audit fields.
     *
     * <p>Stores: detector findings, synthesis detection flag, redaction count,
     * signed content label, authorization audit detail, and the ACLX decision ID.
     * Callers should prefer this overload over the generic {@link #log} when a
     * real ACLX response is available (i.e. not a dev-bypass pass-through).
     *
     * <p>When {@code aclxResult.isAuditWritten() == true} the ACLX gateway already
     * persisted its own audit record.  We still write ours for the myABA audit log
     * (different store, different retention schedule, required for SOC 2 CC7.2).
     */
    @Async
    public void logAclx(String eventType, String orgId, String userId, String clientId,
                        String documentId, AclxResponse aclxResult,
                        String sourceIp, String correlationId) {
        if (devMode) {
            int redactCount = (aclxResult != null && aclxResult.getDecision() != null
                    && aclxResult.getDecision().getRedactedTokens() != null)
                    ? aclxResult.getDecision().getRedactedTokens().size() : 0;
            log.info("[AUDIT-DEV] {} | user={} client={} decision={} redacted={} synthesis={} ip={} corr={}",
                    eventType, userId, clientId,
                    aclxResult != null && aclxResult.getDecision() != null
                            ? aclxResult.getDecision().getDecision() : "null",
                    redactCount,
                    aclxResult != null && aclxResult.isSynthesisDetected(),
                    sourceIp, correlationId);
            return;
        }

        try {
            Instant now = Instant.now();
            Firestore db = FirestoreClient.getFirestore();
            Map<String, Object> entry = new HashMap<>();
            entry.put("eventType",     eventType);
            entry.put("orgId",         orgId);
            entry.put("userId",        userId);
            entry.put("clientId",      clientId);
            entry.put("documentId",    documentId);
            entry.put("sourceIp",      sourceIp);
            entry.put("correlationId", correlationId);
            entry.put("timestamp",     now.toString());
            entry.put("timestampMs",   now.toEpochMilli());

            if (aclxResult != null) {
                entry.put("aclxContentId", aclxResult.getContentId());
                entry.put("aclxAuditWritten", aclxResult.isAuditWritten());
                entry.put("aclxSynthesisDetected", aclxResult.isSynthesisDetected());
                if (aclxResult.getContentLabel() != null) {
                    entry.put("aclxContentLabel", aclxResult.getContentLabel());
                }

                // Decision fields
                AclxResponse.Decision d = aclxResult.getDecision();
                if (d != null) {
                    entry.put("decision",           d.getDecision());
                    entry.put("aclxPolicyVersion",  d.getPolicyVersion());
                    List<String> redacted = d.getRedactedTokens();
                    entry.put("aclxRedactionCount", redacted != null ? redacted.size() : 0);
                }

                // Detector findings (abbreviated — store count + finding types only,
                // not full token content, to keep Firestore doc size bounded)
                List<Map<String, Object>> findings = aclxResult.getDetectorFindings();
                if (findings != null && !findings.isEmpty()) {
                    entry.put("aclxDetectorFindingCount", findings.size());
                    // Store only non-PII metadata: detector name + triggered flag.
                    // (Gateway findings use "triggered"; older records used "matched".)
                    entry.put("aclxDetectorSummary", findings.stream()
                            .map(f -> Map.of(
                                    "detector", f.getOrDefault("detector", "unknown"),
                                    "matched",  f.getOrDefault("triggered", f.getOrDefault("matched", false))))
                            .toList());
                }

                // Label fields
                AclxResponse.AclxLabel label = aclxResult.getAclx();
                if (label != null) {
                    entry.put("aclxLabel",  label);
                    AclxResponse.AclxAudit audit = label.getAudit();
                    if (audit != null) {
                        entry.put("aclxDecisionId", audit.getDecisionId());
                        if (audit.getIdentitySnapshot() != null) {
                            entry.put("aclxIdentitySnapshot", audit.getIdentitySnapshot());
                        }
                        AclxResponse.AuthorizationAudit authAudit = audit.getAuthorizationAudit();
                        if (authAudit != null && authAudit.isAuthCheckPerformed()) {
                            entry.put("aclxAuthValid",      authAudit.isAuthValid());
                            entry.put("aclxAuthId",         authAudit.getAuthId());
                            entry.put("aclxAuthType",       authAudit.getAuthType());
                            entry.put("aclxAuthDenyReason", authAudit.getDenyReason());
                        }
                    }
                }
            }

            auditCollection(db, orgId).add(entry);
        } catch (Exception e) {
            log.error("Failed to write ACLX audit log: {}", e.getMessage());
        }
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
    public void log(String eventType, String orgId, String userId, String clientId,
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
            entry.put("orgId",         orgId);
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

            auditCollection(db, orgId).add(entry);
        } catch (Exception e) {
            // Audit failure must never crash the request
            log.error("Failed to write audit log: {}", e.getMessage());
        }
    }
}
