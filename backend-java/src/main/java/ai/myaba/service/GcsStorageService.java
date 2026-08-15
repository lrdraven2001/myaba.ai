package ai.myaba.service;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Stores ORIGINAL uploaded files in Google Cloud Storage. The extracted text
 * continues to live in Firestore (that feeds the auto-reuse / chat-context
 * pipeline); GCS holds the byte-for-byte original for download and audit.
 *
 * <h2>Tenant isolation</h2>
 * Every object path is built from the caller's <b>token</b> orgId, never from
 * client input:
 * <pre>
 *   orgs/{orgId}/clients/{clientId}/documents/{docId}/{filename}
 *   orgs/{orgId}/projects/{projectId}/knowledge/{docId}/{filename}
 * </pre>
 * A single shared bucket is used, isolated by these prefixes plus a backend
 * org-scope check on every access. Before minting any signed URL we assert the
 * stored object path {@code startsWith("orgs/{orgId}/")} — a one-line invariant
 * that turns any cross-org logic bug into a hard failure instead of a leak.
 *
 * <h2>Encryption at rest</h2>
 * GCS encrypts all objects at rest by default (AES-256, Google-managed keys,
 * BAA-covered). A bucket-level CMEK — provisioned manually on the bucket — is
 * transparent here. An optional per-write CMEK ({@code gcs.kms-key}) is wired so
 * an enterprise per-org key is a config change, not a rewrite.
 *
 * <h2>Fail-graceful</h2>
 * When {@code gcs.documents-bucket} is unset (or in dev mode) the service is
 * DISABLED: uploads simply skip GCS (text-only behaviour, as before) and the
 * download-original path is hidden. Nothing breaks before the bucket exists.
 */
@Service
@Slf4j
public class GcsStorageService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /** Shared bucket name. Unset → GCS disabled (fail-graceful). */
    @Value("${gcs.documents-bucket:}")
    private String bucket;

    /** Optional CMEK resource name applied on write. Empty → bucket-default encryption. */
    @Value("${gcs.kms-key:}")
    private String kmsKey;

    /** Signed download URL lifetime (minutes). */
    @Value("${gcs.signed-url-ttl-minutes:10}")
    private int signedUrlTtlMinutes;

    /** Lazily created — never constructed when GCS is disabled or in dev mode. */
    private volatile Storage storage;

    /** True when originals should be persisted to / served from GCS. */
    public boolean isEnabled() {
        return !devMode && bucket != null && !bucket.isBlank();
    }

    public String getBucket() {
        return bucket;
    }

    private Storage storage() {
        Storage s = storage;
        if (s == null) {
            synchronized (this) {
                if (storage == null) {
                    // Application Default Credentials — Workload Identity on Cloud Run,
                    // gcp-adc.json locally. No key material handled here.
                    storage = StorageOptions.getDefaultInstance().getService();
                }
                s = storage;
            }
        }
        return s;
    }

    // ── Object path builders (always token-orgId scoped) ────────────────────────

    public String clientObjectPath(String orgId, String clientId, String docId, String filename) {
        return "orgs/" + orgId + "/clients/" + clientId + "/documents/" + docId + "/" + sanitize(filename);
    }

    public String projectObjectPath(String orgId, String projectId, String docId, String filename) {
        return "orgs/" + orgId + "/projects/" + projectId + "/knowledge/" + docId + "/" + sanitize(filename);
    }

    public String chatObjectPath(String orgId, String chatId, String attId, String filename) {
        return "orgs/" + orgId + "/chats/" + chatId + "/attachments/" + attId + "/" + sanitize(filename);
    }

    // ── Operations ──────────────────────────────────────────────────────────────

    /**
     * Upload original bytes. No-op returning false when GCS is disabled.
     * Never throws — a storage hiccup must not fail the surrounding upload flow
     * (the extracted text in Firestore is the critical artefact).
     */
    public boolean upload(String objectPath, String contentType, byte[] bytes) {
        if (!isEnabled()) return false;
        try {
            BlobInfo.Builder b = BlobInfo.newBuilder(BlobId.of(bucket, objectPath));
            if (contentType != null && !contentType.isBlank()) b.setContentType(contentType);
            BlobInfo info = b.build();
            // Optional CMEK (enterprise per-org key). Empty → bucket-default encryption.
            if (kmsKey != null && !kmsKey.isBlank()) {
                storage().create(info, bytes, Storage.BlobTargetOption.kmsKeyName(kmsKey));
            } else {
                storage().create(info, bytes);
            }
            return true;
        } catch (Exception e) {
            log.warn("GCS upload failed for {}: {}", objectPath, e.getMessage());
            return false;
        }
    }

    /**
     * Read an object's raw bytes (server-side). Enforces the same org-prefix
     * tenant-isolation invariant as signing. Returns {@code null} when GCS is
     * disabled or the object is missing.
     *
     * @throws SecurityException if the object path is not within this org's prefix
     */
    public byte[] download(String orgId, String objectPath) {
        if (!isEnabled() || objectPath == null || objectPath.isBlank()) return null;
        String prefix = "orgs/" + orgId + "/";
        if (!objectPath.startsWith(prefix)) {
            throw new SecurityException("Object path outside caller org: " + objectPath);
        }
        try {
            Blob blob = storage().get(BlobId.of(bucket, objectPath));
            return (blob != null && blob.exists()) ? blob.getContent() : null;
        } catch (Exception e) {
            log.warn("GCS download failed for {}: {}", objectPath, e.getMessage());
            return null;
        }
    }

    /**
     * Mint a short-TTL V4 signed download URL for an object, forcing an
     * attachment download of {@code downloadFilename}. Returns {@code null} when
     * GCS is disabled or signing is unavailable (e.g. the runtime SA lacks
     * {@code iam.serviceAccounts.signBlob} — see the manual GCP setup checklist).
     *
     * @throws SecurityException if the object path is not within this org's prefix
     */
    public String signedDownloadUrl(String orgId, String objectPath, String downloadFilename) {
        if (!isEnabled() || objectPath == null || objectPath.isBlank()) return null;
        // Tenant-isolation invariant: never sign an object outside the caller's org tree.
        String prefix = "orgs/" + orgId + "/";
        if (!objectPath.startsWith(prefix)) {
            throw new SecurityException("Object path outside caller org: " + objectPath);
        }
        try {
            BlobInfo blobInfo = BlobInfo.newBuilder(BlobId.of(bucket, objectPath)).build();
            String safe = (downloadFilename == null || downloadFilename.isBlank())
                    ? "download" : sanitize(downloadFilename);
            Map<String, String> queryParams = new HashMap<>();
            queryParams.put("response-content-disposition", "attachment; filename=\"" + safe + "\"");
            URL url = storage().signUrl(
                    blobInfo,
                    Math.max(1, signedUrlTtlMinutes), TimeUnit.MINUTES,
                    Storage.SignUrlOption.withV4Signature(),
                    Storage.SignUrlOption.withQueryParams(queryParams));
            return url.toString();
        } catch (Exception e) {
            // On Cloud Run this most often means the SA can't signBlob yet.
            log.warn("GCS signed-URL generation failed for {} (is iam.serviceAccountTokenCreator granted "
                    + "on the runtime SA and the IAM Credentials API enabled?): {}", objectPath, e.getMessage());
            return null;
        }
    }

    /** Best-effort delete of an original. Never throws. */
    public void delete(String objectPath) {
        if (!isEnabled() || objectPath == null || objectPath.isBlank()) return;
        try {
            storage().delete(BlobId.of(bucket, objectPath));
        } catch (Exception e) {
            log.warn("GCS delete failed for {}: {}", objectPath, e.getMessage());
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /** SHA-256 hex of the bytes — stored on each doc for dedup / integrity. */
    public static String sha256Hex(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(bytes);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte x : digest) sb.append(Character.forDigit((x >> 4) & 0xF, 16)).append(Character.forDigit(x & 0xF, 16));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /** Keep only filesystem-safe chars for the trailing object segment. */
    private static String sanitize(String filename) {
        if (filename == null || filename.isBlank()) return "file";
        String cleaned = filename.replaceAll("[^A-Za-z0-9._-]", "_");
        // Strip leading dots so an object segment can't read as hidden/traversal.
        cleaned = cleaned.replaceAll("^\\.+", "");
        if (cleaned.isBlank()) cleaned = "file";
        return cleaned.length() > 180 ? cleaned.substring(0, 180) : cleaned;
    }
}
