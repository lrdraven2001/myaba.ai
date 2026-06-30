package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.EhrClientRecord;
import ai.myaba.model.dto.EhrConnectionStatus;
import ai.myaba.service.ehr.EhrConnector;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Manages EHR integration configuration and client synchronisation.
 *
 * <h3>Firestore layout</h3>
 * <pre>
 *   organizations/{orgId}/integrations/{ehrType}
 *     status        : String  "connected" | "disconnected" | "error"
 *     connectedAt   : String  ISO-8601
 *     lastSyncAt    : String  ISO-8601
 *     errorMessage  : String?
 *     subdomain     : String? (CentralReach only — not a secret)
 *     credentials   : String  AES-256-GCM encrypted JSON of credential map
 *
 *   organizations/{orgId}/clients/{clientId}
 *     ehrLinks/{ehrType}
 *       ehrId         : String
 *       linkedAt      : String
 *       lastSyncAt    : String
 *     (standard client fields updated on sync)
 * </pre>
 *
 * <h3>Credential encryption</h3>
 * <p>API keys are AES-256-GCM encrypted before writing to Firestore.
 * The encryption key is read from {@code EHR_CREDENTIAL_KEY} env var (32 bytes, Base64-encoded).
 * In dev mode, a fixed insecure key is used and no actual EHR calls are made.
 */
@Service
@Slf4j
public class EhrService {

    private static final String COLLECTION = "integrations";
    private static final String AES_ALGO   = "AES/GCM/NoPadding";
    private static final int    GCM_IV_LEN = 12; // bytes
    private static final int    GCM_TAG_BITS = 128;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /**
     * 32-byte AES-256 key, Base64-encoded.
     * Generate with: openssl rand -base64 32
     * Set via EHR_CREDENTIAL_KEY env var.
     */
    @Value("${ehr.credential-key:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}")
    private String credentialKeyBase64;

    private final List<EhrConnector> connectors;

    public EhrService(List<EhrConnector> connectors) {
        this.connectors = connectors;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Return the connection status for all supported EHR types for this org.
     * Credentials are never included.
     */
    public List<EhrConnectionStatus> getConnectionStatuses(String orgId) {
        List<EhrConnectionStatus> statuses = new ArrayList<>();
        for (EhrConnector connector : connectors) {
            statuses.add(loadStatus(orgId, connector));
        }
        return statuses;
    }

    /**
     * Save credentials and verify the connection works.
     * Stores encrypted credentials in Firestore on success.
     *
     * @param orgId       organisation
     * @param ehrType     "centralreach" | "rethink"
     * @param credentials map of credential keys (e.g. apiToken, subdomain)
     * @throws Exception if the credentials are invalid or the EHR is unreachable
     */
    public EhrConnectionStatus connect(String orgId, String ehrType,
                                        Map<String, String> credentials) throws Exception {
        EhrConnector connector = requireConnector(ehrType);

        // Test the credentials before storing them
        connector.testConnection(credentials);

        // Encrypt and persist
        String encryptedCredentials = encrypt(serializeCredentials(credentials));
        Map<String, Object> doc = new HashMap<>();
        doc.put("status",      "connected");
        doc.put("connectedAt", TimestampUtil.now());
        doc.put("credentials", encryptedCredentials);
        doc.put("errorMessage", null);
        // Store non-secret metadata alongside (subdomain for CentralReach)
        if (credentials.containsKey("subdomain")) {
            doc.put("subdomain", credentials.get("subdomain"));
        }

        firestore().collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(COLLECTION).document(ehrType)
                .set(doc, SetOptions.merge())
                .get();

        log.info("EHR connected: org={} type={}", orgId, ehrType);
        return loadStatus(orgId, connector);
    }

    /**
     * Remove the EHR integration for this org.
     * Deletes credentials and resets status to disconnected.
     */
    public void disconnect(String orgId, String ehrType) throws Exception {
        requireConnector(ehrType); // validates type

        Map<String, Object> doc = new HashMap<>();
        doc.put("status",      "disconnected");
        doc.put("credentials", null);
        doc.put("connectedAt", null);
        doc.put("errorMessage", null);

        firestore().collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(COLLECTION).document(ehrType)
                .set(doc, SetOptions.merge())
                .get();

        log.info("EHR disconnected: org={} type={}", orgId, ehrType);
    }

    /**
     * Search for clients in the connected EHR by name fragment.
     */
    public List<EhrClientRecord> searchClients(String orgId, String ehrType,
                                                String query) throws Exception {
        EhrConnector connector = requireConnector(ehrType);
        Map<String, String> credentials = loadCredentials(orgId, ehrType);
        return connector.searchClients(credentials, query);
    }

    /**
     * Fetch a single EHR client record and cache selected fields onto the
     * myABA client document.
     *
     * @param orgId       organisation
     * @param ehrType     source EHR
     * @param ehrClientId the client's ID inside the EHR
     * @param myabaClientId the corresponding myABA client document ID
     */
    public EhrClientRecord syncClient(String orgId, String ehrType,
                                       String ehrClientId, String myabaClientId) throws Exception {
        EhrConnector connector = requireConnector(ehrType);
        Map<String, String> credentials = loadCredentials(orgId, ehrType);

        EhrClientRecord record = connector.getClient(credentials, ehrClientId);

        // Persist the EHR link and synced fields onto the client document
        Firestore db = firestore();
        Map<String, Object> updates = new HashMap<>();
        updates.put("ehrLinks." + ehrType + ".ehrId",     ehrClientId);
        updates.put("ehrLinks." + ehrType + ".linkedAt",  TimestampUtil.now());
        updates.put("ehrLinks." + ehrType + ".lastSyncAt", record.getSyncedAt());

        // Merge safe demographic fields — only fill blanks, never overwrite
        // existing manually-entered data (clinicians may have corrected EHR errors)
        if (record.getDateOfBirth() != null)
            updates.put("dob", record.getDateOfBirth());
        if (record.getGender() != null)
            updates.put("gender", record.getGender());
        if (record.getPrimaryInsurance() != null)
            updates.put("insuranceProvider", record.getPrimaryInsurance());
        if (record.getMemberId() != null)
            updates.put("memberId", record.getMemberId());
        if (record.getDiagnosisCodes() != null && !record.getDiagnosisCodes().isEmpty())
            updates.put("diagnosisCodes", record.getDiagnosisCodes());
        if (record.getDiagnosisDescriptions() != null && !record.getDiagnosisDescriptions().isEmpty())
            updates.put("diagnosis", String.join(", ", record.getDiagnosisDescriptions()));

        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.CLIENTS).document(myabaClientId)
                .update(updates)
                .get();

        // Update lastSyncAt on the integration doc
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(COLLECTION).document(ehrType)
                .update(Map.of("lastSyncAt", TimestampUtil.now()))
                .get();

        log.info("EHR client synced: org={} type={} ehrId={} clientId={}",
                orgId, ehrType, ehrClientId, myabaClientId);
        return record;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private EhrConnector requireConnector(String ehrType) {
        return connectors.stream()
                .filter(c -> c.getEhrType().equals(ehrType))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown EHR type: " + ehrType));
    }

    private EhrConnectionStatus loadStatus(String orgId, EhrConnector connector) {
        try {
            var snap = firestore().collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection(COLLECTION).document(connector.getEhrType())
                    .get().get();

            if (!snap.exists() || !"connected".equals(snap.getString("status"))) {
                return EhrConnectionStatus.builder()
                        .ehrType(connector.getEhrType())
                        .displayName(connector.getDisplayName())
                        .connected(false)
                        .status("disconnected")
                        .build();
            }

            return EhrConnectionStatus.builder()
                    .ehrType(connector.getEhrType())
                    .displayName(connector.getDisplayName())
                    .connected(true)
                    .status("connected")
                    .connectedAt(snap.getString("connectedAt"))
                    .lastSyncAt(snap.getString("lastSyncAt"))
                    .subdomain(snap.getString("subdomain"))
                    .build();

        } catch (Exception e) {
            log.warn("Failed to load EHR status: org={} type={}: {}",
                    orgId, connector.getEhrType(), e.getMessage());
            return EhrConnectionStatus.builder()
                    .ehrType(connector.getEhrType())
                    .displayName(connector.getDisplayName())
                    .connected(false)
                    .status("error")
                    .errorMessage("Unable to read connection status")
                    .build();
        }
    }

    private Map<String, String> loadCredentials(String orgId, String ehrType) throws Exception {
        var snap = firestore().collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(COLLECTION).document(ehrType)
                .get().get();

        if (!snap.exists()) {
            throw new IllegalStateException("No EHR integration configured for type: " + ehrType);
        }
        String encryptedCredentials = snap.getString("credentials");
        if (encryptedCredentials == null || encryptedCredentials.isBlank()) {
            throw new IllegalStateException("EHR credentials not found for type: " + ehrType);
        }
        return deserializeCredentials(decrypt(encryptedCredentials));
    }

    // ── Credential serialization ───────────────────────────────────────────────

    private String serializeCredentials(Map<String, String> creds) {
        StringBuilder sb = new StringBuilder();
        creds.forEach((k, v) -> sb.append(k).append("=").append(v).append("\n"));
        return sb.toString();
    }

    @SuppressWarnings("ResultOfMethodCallIgnored")
    private Map<String, String> deserializeCredentials(String raw) {
        Map<String, String> map = new HashMap<>();
        for (String line : raw.split("\n")) {
            int idx = line.indexOf('=');
            if (idx > 0) {
                map.put(line.substring(0, idx), line.substring(idx + 1));
            }
        }
        return map;
    }

    // ── AES-256-GCM encryption ────────────────────────────────────────────────

    private byte[] keyBytes() {
        return Base64.getDecoder().decode(credentialKeyBase64);
    }

    /**
     * Encrypt plaintext with AES-256-GCM.
     * Output format: Base64(IV || ciphertext+tag)
     */
    private String encrypt(String plaintext) throws Exception {
        byte[] iv = new byte[GCM_IV_LEN];
        new SecureRandom().nextBytes(iv);

        Cipher cipher = Cipher.getInstance(AES_ALGO);
        cipher.init(Cipher.ENCRYPT_MODE,
                new SecretKeySpec(keyBytes(), "AES"),
                new GCMParameterSpec(GCM_TAG_BITS, iv));

        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

        // Prepend IV to ciphertext
        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        return Base64.getEncoder().encodeToString(combined);
    }

    private String decrypt(String encoded) throws Exception {
        byte[] combined = Base64.getDecoder().decode(encoded);

        byte[] iv         = new byte[GCM_IV_LEN];
        byte[] ciphertext = new byte[combined.length - GCM_IV_LEN];
        System.arraycopy(combined, 0, iv, 0, GCM_IV_LEN);
        System.arraycopy(combined, GCM_IV_LEN, ciphertext, 0, ciphertext.length);

        Cipher cipher = Cipher.getInstance(AES_ALGO);
        cipher.init(Cipher.DECRYPT_MODE,
                new SecretKeySpec(keyBytes(), "AES"),
                new GCMParameterSpec(GCM_TAG_BITS, iv));

        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    private Firestore firestore() {
        return FirestoreClient.getFirestore();
    }
}
