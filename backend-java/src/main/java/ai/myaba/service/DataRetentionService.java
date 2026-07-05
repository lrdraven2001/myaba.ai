package ai.myaba.service;

import ai.myaba.util.FirestoreCollections;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;

/**
 * Enforces configurable data retention windows by purging Firestore records
 * that have exceeded their maximum age.
 *
 * <h3>What is purged</h3>
 * <ul>
 *   <li><b>auditLog</b> — individual audit events.  Default: 7 years (required
 *       minimum under HIPAA and aligned with the proposed 2025 Security Rule
 *       which specifies a 6-year minimum; we retain 7 to provide a one-year
 *       buffer).</li>
 * </ul>
 *
 * <h3>How it works</h3>
 * Records written by {@link AuditService} include a {@code timestampMs} field
 * (epoch milliseconds) that this service uses for range queries.  Documents
 * that predate the {@code timestampMs} field are not affected by this service —
 * they must be cleaned up manually or via a one-time migration script.
 *
 * Purges are executed in batches of 400 to stay within Firestore's 500-write
 * batch limit while leaving headroom for concurrent writes.
 *
 * <h3>Configuration</h3>
 * <pre>
 *   retention.audit-log-days: 2555   # 7 years (default)
 * </pre>
 *
 * <h3>SOC 2 relevance</h3>
 * Demonstrates a documented, automated, and auditable data retention policy —
 * a requirement of Common Criteria CC6.5 (disposal of assets) and the AICPA
 * Privacy criteria.  Retention of audit logs for 7+ years also satisfies the
 * HIPAA minimum documentation retention requirement of 6 years.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class DataRetentionService {

    private static final int BATCH_SIZE = 400;

    /** Server-side floor for org-configurable retention — never purge younger than this. */
    private static final int MIN_ORG_RETENTION_DAYS = 30;

    private final AuditService auditService;

    @Value("${retention.audit-log-days:2555}")
    private int auditLogRetentionDays;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /**
     * Runs daily at 02:15 AM UTC.  The off-hour time reduces contention with
     * active clinical documentation sessions.  A 15-minute offset from the top
     * of the hour avoids thundering-herd with other cron-style jobs.
     */
    @Scheduled(cron = "0 15 2 * * *", zone = "UTC")
    public void purgeExpiredAuditLogs() {
        if (devMode) {
            log.info("[DEV] DataRetentionService skipped — dev mode active.");
            return;
        }

        Instant cutoff = Instant.now().minus(auditLogRetentionDays, ChronoUnit.DAYS);
        long cutoffMs  = cutoff.toEpochMilli();

        log.info("DataRetentionService: purging auditLog entries older than {} days (before {})",
                auditLogRetentionDays, cutoff);

        int totalDeleted = 0;
        int batchDeleted;

        do {
            batchDeleted = purgeBatch(cutoffMs);
            totalDeleted += batchDeleted;
        } while (batchDeleted == BATCH_SIZE);   // keep going if the batch was full

        // Platform-level audit events (no org) live in their own collection.
        int platformDeleted = 0;
        do {
            batchDeleted = purgePlatformBatch(cutoffMs);
            platformDeleted += batchDeleted;
        } while (batchDeleted == BATCH_SIZE);

        log.info("DataRetentionService: purge complete — {} auditLog + {} platformAuditLog documents deleted.",
                totalDeleted, platformDeleted);
    }

    private int purgePlatformBatch(long cutoffMs) {
        try {
            Firestore db = FirestoreClient.getFirestore();
            List<QueryDocumentSnapshot> docs = db.collection("platformAuditLog")
                    .whereLessThan("timestampMs", cutoffMs)
                    .limit(BATCH_SIZE)
                    .get().get().getDocuments();
            return deleteAll(db, docs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return 0;
        } catch (Exception e) {
            log.error("DataRetentionService platformAuditLog purge failed: {}", e.getMessage());
            return 0;
        }
    }

    // ── Per-org retention (settings.retentionDays) ───────────────────────────

    /**
     * Enforces each org's configurable retention window over the org's OWN data:
     * client-generated documents and chats (with their message history).
     *
     * <p>Runs daily at 03:15 UTC (one hour after the audit-log purge). Rules:
     * <ul>
     *   <li>Only orgs with an explicit {@code settings.retentionDays} are purged —
     *       absent means "keep everything" (the platform default).</li>
     *   <li>The window is clamped to a {@value #MIN_ORG_RETENTION_DAYS}-day floor,
     *       even if a lower value was somehow written to Firestore.</li>
     *   <li>Audit / compliance logs are NEVER touched here — they keep the
     *       platform-wide HIPAA floor enforced by {@link #purgeExpiredAuditLogs()}.</li>
     *   <li>Each org purge is independent — one org's failure never blocks the rest —
     *       and every run that deletes anything writes a RETENTION_PURGE audit event.</li>
     * </ul>
     */
    @Scheduled(cron = "0 15 3 * * *", zone = "UTC")
    public void purgeOrgDataByRetention() {
        if (devMode) {
            log.info("[DEV] Org retention purge skipped — dev mode active.");
            return;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            for (QueryDocumentSnapshot org : db.collection(FirestoreCollections.ORGANIZATIONS)
                    .get().get().getDocuments()) {
                try {
                    purgeOneOrg(db, org);
                } catch (Exception e) {
                    log.error("Org retention purge failed for {} (continuing): {}", org.getId(), e.getMessage());
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Org retention purge interrupted: {}", e.getMessage());
        } catch (Exception e) {
            log.error("Org retention purge failed to enumerate orgs: {}", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void purgeOneOrg(Firestore db, QueryDocumentSnapshot org) throws Exception {
        Object settingsObj = org.get("settings");
        if (!(settingsObj instanceof Map)) return;
        Object retention = ((Map<String, Object>) settingsObj).get("retentionDays");
        if (!(retention instanceof Number n)) return;   // unset → keep everything

        String orgId  = org.getId();
        int effective = Math.max(n.intValue(), MIN_ORG_RETENTION_DAYS);
        Instant cutoff = Instant.now().minus(effective, ChronoUnit.DAYS);
        long   cutoffMs  = cutoff.toEpochMilli();
        String cutoffIso = cutoff.toString();  // ISO-8601 — lexicographic order matches time order

        // 1. Client documents — orgs/{orgId}/clients/{clientId}/documents by createdAtMs.
        int docsDeleted = 0;
        for (QueryDocumentSnapshot client : db.collection(FirestoreCollections.ORGANIZATIONS)
                .document(orgId).collection(FirestoreCollections.CLIENTS).get().get().getDocuments()) {
            CollectionReference docCol = db.collection(FirestoreCollections.DOCUMENTS_ROOT).document(orgId)
                    .collection(FirestoreCollections.CLIENTS).document(client.getId())
                    .collection(FirestoreCollections.DOCUMENTS);
            int batch;
            do {
                List<QueryDocumentSnapshot> expired = docCol
                        .whereLessThan("createdAtMs", cutoffMs).limit(BATCH_SIZE).get().get().getDocuments();
                batch = deleteAll(db, expired);
                docsDeleted += batch;
            } while (batch == BATCH_SIZE);
        }

        // 2. Chats older than the window (by updatedAt), including their messages.
        int chatsDeleted = 0;
        List<QueryDocumentSnapshot> expiredChats;
        do {
            expiredChats = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("chats").whereLessThan("updatedAt", cutoffIso)
                    .limit(BATCH_SIZE).get().get().getDocuments();
            for (QueryDocumentSnapshot chat : expiredChats) {
                // Firestore doesn't cascade — clear the messages subcollection first.
                int msgBatch;
                do {
                    List<QueryDocumentSnapshot> msgs = chat.getReference().collection("messages")
                            .limit(BATCH_SIZE).get().get().getDocuments();
                    msgBatch = deleteAll(db, msgs);
                } while (msgBatch == BATCH_SIZE);
                chat.getReference().delete().get();
                chatsDeleted++;
            }
        } while (expiredChats.size() == BATCH_SIZE);

        if (docsDeleted > 0 || chatsDeleted > 0) {
            log.info("Org retention purge {} ({}d window): {} documents, {} chats deleted.",
                    orgId, effective, docsDeleted, chatsDeleted);
            auditService.log("RETENTION_PURGE", orgId, "system", null, null, null,
                    "retention=" + effective + "d",
                    Map.of("documentsDeleted", docsDeleted, "chatsDeleted", chatsDeleted));
        }
    }

    /** Batch-delete the given documents; returns how many were deleted. */
    private int deleteAll(Firestore db, List<QueryDocumentSnapshot> docs) throws Exception {
        if (docs.isEmpty()) return 0;
        var batch = db.batch();
        docs.forEach(d -> batch.delete(d.getReference()));
        batch.commit().get();
        return docs.size();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private int purgeBatch(long cutoffMs) {
        try {
            Firestore db = FirestoreClient.getFirestore();

            // Collection-group query covers every org's auditLog subcollection AND
            // the legacy top-level auditLog collection (same collection ID).
            // Requires the COLLECTION_GROUP index on timestampMs (firestore.indexes.json).
            List<QueryDocumentSnapshot> docs = db.collectionGroup("auditLog")
                    .whereLessThan("timestampMs", cutoffMs)
                    .limit(BATCH_SIZE)
                    .get()
                    .get()
                    .getDocuments();

            if (docs.isEmpty()) return 0;

            var batch = db.batch();
            docs.forEach(doc -> batch.delete(doc.getReference()));
            batch.commit().get();

            log.debug("DataRetentionService: deleted {} auditLog documents in batch.", docs.size());
            return docs.size();

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("DataRetentionService interrupted during audit log purge: {}", e.getMessage());
            return 0;
        } catch (ExecutionException e) {
            log.error("DataRetentionService failed during audit log purge: {}", e.getMessage());
            return 0;
        }
    }
}
