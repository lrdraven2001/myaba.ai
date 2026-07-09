package ai.myaba.service;

import ai.myaba.util.FirestoreCollections;
import ai.myaba.util.TimestampUtil;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Asynchronous document text-extraction jobs.
 *
 * <p>Heavy extraction (scanned-PDF OCR, figure/chart vision description, large
 * files) can take far longer than an HTTP request budget — doing it inline times
 * the upload out at the gateway (HTTP 502). Instead, the upload creates a
 * {@code PROCESSING} job and returns a {@code jobId} immediately; a background
 * worker runs {@link DocumentFormatService#extractText} and writes the result
 * ({@code READY} + text, or {@code FAILED} + error) into the job document. The
 * caller polls for the result.
 *
 * <p>Jobs live at {@code organizations/{orgId}/extractionJobs/{jobId}}, which is
 * also the coordination point across instances — the polling GET reads the same
 * document the background worker writes.
 *
 * <p><b>Cloud Run note:</b> the background worker runs AFTER the HTTP response, so
 * the service must run with CPU always allocated
 * ({@code run.googleapis.com/cpu-throttling: "false"}); otherwise the worker is
 * throttled and the job never completes.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExtractionJobService {

    /** Firestore's per-document limit is 1 MB; cap stored text well under it. */
    private static final int MAX_TEXT_CHARS = 400_000;
    private static final String JOBS = "extractionJobs";

    private final DocumentFormatService documentFormatService;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    // Dev in-memory job store (no Firestore emulator dependency in dev mode).
    private final Map<String, Map<String, Object>> devJobs = new ConcurrentHashMap<>();

    /** Create a PROCESSING job and return its id. Fast/synchronous. */
    public String createJob(String orgId, String filename) {
        String jobId = "ex-" + UUID.randomUUID().toString().replace("-", "");
        Map<String, Object> job = new HashMap<>();
        job.put("status", "PROCESSING");
        job.put("name", filename);
        job.put("orgId", orgId);
        job.put("createdAt", TimestampUtil.now());
        if (devMode) {
            devJobs.put(jobId, job);
        } else {
            try {
                jobRef(orgId, jobId).set(job).get();
            } catch (Exception e) {
                log.error("createJob failed org={} file={}: {}", orgId, filename, e.getMessage());
            }
        }
        return jobId;
    }

    /**
     * Run extraction in the background and write the result into the job. Called
     * cross-bean (from the controller) so the {@code @Async} proxy applies.
     */
    @Async
    public void runExtraction(String orgId, String jobId, String filename, byte[] bytes) {
        Map<String, Object> update = new HashMap<>();
        try {
            String text = documentFormatService.extractText(filename, bytes, true);
            if (text == null || text.isBlank()) {
                update.put("status", "FAILED");
                update.put("error", "No readable text found in \"" + filename + "\".");
            } else {
                boolean truncated = text.length() > MAX_TEXT_CHARS;
                if (truncated) text = text.substring(0, MAX_TEXT_CHARS) + "\n…[truncated]";
                update.put("status", "READY");
                update.put("text", text);
                update.put("chars", text.length());
                update.put("truncated", truncated);
            }
        } catch (IllegalArgumentException e) {
            // Expected, user-actionable (e.g. password-protected PDF).
            update.put("status", "FAILED");
            update.put("error", e.getMessage());
        } catch (Exception e) {
            log.error("extraction job {} failed for {}: {}", jobId, filename, e.getMessage());
            update.put("status", "FAILED");
            update.put("error", "Could not read the file: " + e.getMessage());
        }
        update.put("completedAt", TimestampUtil.now());
        writeResult(orgId, jobId, update);
    }

    private void writeResult(String orgId, String jobId, Map<String, Object> update) {
        if (devMode) {
            Map<String, Object> job = devJobs.get(jobId);
            if (job != null) job.putAll(update);
            return;
        }
        try {
            jobRef(orgId, jobId).set(update, com.google.cloud.firestore.SetOptions.merge()).get();
        } catch (Exception e) {
            log.error("writeResult failed for job {}: {}", jobId, e.getMessage());
        }
    }

    /** Fetch a job's current state (status + text/error), or null if not found. */
    public Map<String, Object> get(String orgId, String jobId) {
        if (devMode) return devJobs.get(jobId);
        try {
            var snap = jobRef(orgId, jobId).get().get();
            return snap.exists() ? snap.getData() : null;
        } catch (Exception e) {
            log.warn("get extraction job {} failed: {}", jobId, e.getMessage());
            return null;
        }
    }

    private com.google.cloud.firestore.DocumentReference jobRef(String orgId, String jobId) {
        return FirestoreClient.getFirestore()
                .collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(JOBS).document(jobId);
    }
}
