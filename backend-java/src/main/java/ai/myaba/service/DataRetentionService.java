package ai.myaba.service;

import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
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
public class DataRetentionService {

    private static final int BATCH_SIZE = 400;

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

        log.info("DataRetentionService: purge complete — {} auditLog documents deleted.", totalDeleted);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private int purgeBatch(long cutoffMs) {
        try {
            Firestore db = FirestoreClient.getFirestore();

            List<QueryDocumentSnapshot> docs = db.collection("auditLog")
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
