package ai.myaba.service;

import ai.myaba.model.dto.FederationConfigRequest;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.OidcProviderConfig;
import com.google.firebase.auth.SamlProviderConfig;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Federation identity provider configuration service (enterprise tier).
 *
 * Stores provider configs in Firestore and provisions them in Firebase Auth
 * via the Admin SDK so users can sign in with the enterprise IdP.
 *
 * Firestore path: organizations/{orgId}/federationConfigs/{configId}
 *
 * Firebase providerId conventions:
 *   OIDC → "oidc.{orgId}"
 *   SAML → "saml.{orgId}"
 *
 * Production note: Firebase supports one OIDC and one SAML provider per tenant.
 * For multi-IdP setups, Firebase Auth with multi-tenancy (Enterprise plan) is needed.
 *
 * In dev mode all Firebase calls are skipped; configs are stored in memory.
 */
@Service
@Slf4j
public class FederationService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    @Value("${app.base-url:http://localhost:5173}")
    private String appBaseUrl;

    private final Map<String, Map<String, Object>> devConfigs = new ConcurrentHashMap<>();

    // ── Queries ───────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getConfigs(String orgId) throws Exception {
        if (devMode) {
            return devConfigs.values().stream()
                    .filter(c -> orgId.equals(c.get("orgId")))
                    .collect(Collectors.toList());
        }
        Firestore db = FirestoreClient.getFirestore();
        return db.collection("organizations").document(orgId)
                 .collection("federationConfigs")
                 .get().get().getDocuments().stream()
                 .map(d -> {
                     Map<String, Object> m = new HashMap<>(d.getData());
                     m.put("id", d.getId());
                     return m;
                 }).collect(Collectors.toList());
    }

    // ── Create ────────────────────────────────────────────────────────────────

    /**
     * Create or replace a federation provider config.
     * Returns the new config's ID.
     */
    public String createConfig(String orgId, FederationConfigRequest req) throws Exception {
        validateRequest(req);
        String now      = Instant.now().toString();
        String configId = "fed-" + UUID.randomUUID().toString().substring(0, 8);

        Map<String, Object> data = buildConfigData(orgId, configId, req, now, now);

        if (devMode) {
            devConfigs.put(configId, data);
            log.info("Dev: created federation config {} ({}) for org {}", configId, req.getType(), orgId);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .collection("federationConfigs").document(configId).set(data).get();
            provisionFirebaseProvider(orgId, req);
        }
        return configId;
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public void updateConfig(String orgId, String configId, FederationConfigRequest req) throws Exception {
        validateRequest(req);
        Map<String, Object> existing = fetchConfig(orgId, configId);
        String now = Instant.now().toString();

        Map<String, Object> updated = buildConfigData(orgId, configId, req,
                (String) existing.get("createdAt"), now);

        if (devMode) {
            devConfigs.put(configId, updated);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .collection("federationConfigs").document(configId).set(updated).get();
            updateFirebaseProvider(orgId, req);
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    public void deleteConfig(String orgId, String configId) throws Exception {
        Map<String, Object> config = fetchConfig(orgId, configId);
        String type = (String) config.get("type");

        if (devMode) {
            devConfigs.remove(configId);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .collection("federationConfigs").document(configId).delete().get();
            deleteFirebaseProvider(orgId, type);
        }
    }

    // ── Firebase Admin SDK provisioning ──────────────────────────────────────

    private void provisionFirebaseProvider(String orgId, FederationConfigRequest req) {
        try {
            if ("oidc".equalsIgnoreCase(req.getType())) {
                FirebaseAuth.getInstance().createOidcProviderConfig(
                    new OidcProviderConfig.CreateRequest()
                        .setProviderId(oidcProviderId(orgId))
                        .setDisplayName(req.getDisplayName())
                        .setClientId(req.getClientId())
                        .setIssuer(req.getIssuerUrl())
                        .setEnabled(Boolean.TRUE.equals(req.getIsEnabled()))
                );
            } else {
                FirebaseAuth.getInstance().createSamlProviderConfig(
                    new SamlProviderConfig.CreateRequest()
                        .setProviderId(samlProviderId(orgId))
                        .setDisplayName(req.getDisplayName())
                        .setIdpEntityId(req.getIdpEntityId())
                        .setSsoUrl(req.getSsoUrl())
                        .addX509Certificate(req.getX509Certificate())
                        .setRpEntityId(req.getRpEntityId())
                        .setCallbackUrl(appBaseUrl + "/__/auth/handler")
                        .setEnabled(Boolean.TRUE.equals(req.getIsEnabled()))
                );
            }
        } catch (Exception e) {
            log.error("Failed to provision Firebase provider for org {}: {}", orgId, e.getMessage());
            throw new RuntimeException("Firebase provider provisioning failed: " + e.getMessage(), e);
        }
    }

    private void updateFirebaseProvider(String orgId, FederationConfigRequest req) {
        try {
            if ("oidc".equalsIgnoreCase(req.getType())) {
                FirebaseAuth.getInstance().updateOidcProviderConfig(
                    new OidcProviderConfig.UpdateRequest(oidcProviderId(orgId))
                        .setDisplayName(req.getDisplayName())
                        .setClientId(req.getClientId())
                        .setIssuer(req.getIssuerUrl())
                        .setEnabled(Boolean.TRUE.equals(req.getIsEnabled()))
                );
            } else {
                FirebaseAuth.getInstance().updateSamlProviderConfig(
                    new SamlProviderConfig.UpdateRequest(samlProviderId(orgId))
                        .setDisplayName(req.getDisplayName())
                        .setIdpEntityId(req.getIdpEntityId())
                        .setSsoUrl(req.getSsoUrl())
                        .addX509Certificate(req.getX509Certificate())
                        .setRpEntityId(req.getRpEntityId())
                        .setEnabled(Boolean.TRUE.equals(req.getIsEnabled()))
                );
            }
        } catch (Exception e) {
            log.warn("Could not update Firebase provider for org {}: {}", orgId, e.getMessage());
        }
    }

    private void deleteFirebaseProvider(String orgId, String type) {
        try {
            if ("oidc".equalsIgnoreCase(type)) {
                FirebaseAuth.getInstance().deleteOidcProviderConfig(oidcProviderId(orgId));
            } else {
                FirebaseAuth.getInstance().deleteSamlProviderConfig(samlProviderId(orgId));
            }
        } catch (Exception e) {
            log.warn("Could not delete Firebase provider for org {}: {}", orgId, e.getMessage());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> fetchConfig(String orgId, String configId) throws Exception {
        if (devMode) {
            Map<String, Object> c = devConfigs.get(configId);
            if (c == null) throw new NoSuchElementException("Federation config not found: " + configId);
            return c;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection("organizations").document(orgId)
                     .collection("federationConfigs").document(configId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Federation config not found: " + configId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    private Map<String, Object> buildConfigData(String orgId, String configId,
                                                  FederationConfigRequest req,
                                                  String createdAt, String updatedAt) {
        Map<String, Object> data = new HashMap<>();
        data.put("id",          configId);
        data.put("orgId",       orgId);
        data.put("type",        req.getType().toLowerCase());
        data.put("displayName", req.getDisplayName());
        data.put("isEnabled",   Boolean.TRUE.equals(req.getIsEnabled()));
        data.put("createdAt",   createdAt);
        data.put("updatedAt",   updatedAt);
        // OIDC fields
        if (req.getClientId()   != null) data.put("clientId",   req.getClientId());
        if (req.getIssuerUrl()  != null) data.put("issuerUrl",  req.getIssuerUrl());
        // SAML fields (omit certificate from response to avoid exposing it)
        if (req.getIdpEntityId() != null) data.put("idpEntityId", req.getIdpEntityId());
        if (req.getSsoUrl()      != null) data.put("ssoUrl",      req.getSsoUrl());
        if (req.getRpEntityId()  != null) data.put("rpEntityId",  req.getRpEntityId());
        // Derived: Firebase provider IDs
        data.put("firebaseProviderId", "oidc".equalsIgnoreCase(req.getType())
                ? oidcProviderId(orgId) : samlProviderId(orgId));
        return data;
    }

    private void validateRequest(FederationConfigRequest req) {
        if (!"oidc".equalsIgnoreCase(req.getType()) && !"saml".equalsIgnoreCase(req.getType()))
            throw new IllegalArgumentException("type must be 'oidc' or 'saml'");
        if ("oidc".equalsIgnoreCase(req.getType())) {
            if (req.getClientId() == null || req.getIssuerUrl() == null)
                throw new IllegalArgumentException("OIDC requires clientId and issuerUrl");
        } else {
            if (req.getIdpEntityId() == null || req.getSsoUrl() == null || req.getX509Certificate() == null)
                throw new IllegalArgumentException("SAML requires idpEntityId, ssoUrl, and x509Certificate");
        }
    }

    private String oidcProviderId(String orgId) { return "oidc." + orgId; }
    private String samlProviderId(String orgId) { return "saml." + orgId; }
}
