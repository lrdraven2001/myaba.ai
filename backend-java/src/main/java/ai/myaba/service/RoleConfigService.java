package ai.myaba.service;

import ai.myaba.model.dto.AppUser;
import ai.myaba.security.AuthorizationUtil;
import ai.myaba.util.FirestoreCollections;
import ai.myaba.util.TimestampUtil;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * Per-organisation role configuration: permission-matrix overrides for the five
 * canonical roles, any admin-defined custom roles, and identity-provider
 * group → role mappings.
 *
 * <p>Stored as a single JSON blob so the Settings UI can read the whole role
 * configuration in one call and save it in one call. The frontend holds the
 * canonical role defaults and merges the stored overrides on top.
 *
 * <p><b>Scope:</b> this layer PERSISTS the configuration. Enforcing custom
 * permission levels across chat / ACLX / endpoints is a separate follow-on —
 * today authorization is still derived from {@link UserRole}. Persisting here
 * means a saved permission change is real, durable data rather than a no-op.
 *
 * <p>Firestore path: {@code organizations/{orgId}/config/roleConfig}
 *
 * <p>Shape:
 * <pre>
 *   {
 *     roles:           { ORG_SUPER_ADMIN: { clients:"all", projects:"all", ... }, ... },
 *     customRoles:     [ { key, label, description, baseline, permissions:{...} } ],
 *     idpRoleMappings: [ { group:"aba-admins", role:"ORG_SUPER_ADMIN" }, ... ],
 *     updatedAt, updatedBy
 *   }
 * </pre>
 */
@Service
@Slf4j
public class RoleConfigService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /** In-memory store keyed by orgId (dev mode only). */
    private final Map<String, Map<String, Object>> devConfigs = new HashMap<>();

    private static final String DOC = "roleConfig";

    // ── Read ──────────────────────────────────────────────────────────────────

    /** Returns the stored role config for the org, or an empty config if none exists. */
    public Map<String, Object> getConfig(String orgId) {
        if (devMode) {
            return devConfigs.getOrDefault(orgId, emptyConfig());
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                         .collection(FirestoreCollections.CONFIG).document(DOC).get().get();
            if (!snap.exists() || snap.getData() == null) return emptyConfig();
            return new HashMap<>(snap.getData());
        } catch (Exception e) {
            log.warn("Failed to load role config for {}: {}", orgId, e.getMessage());
            return emptyConfig();
        }
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /** Replace the org's role configuration. Admin-only. Returns the saved doc. */
    public Map<String, Object> saveConfig(AppUser admin, Map<String, Object> incoming) {
        AuthorizationUtil.requireAdmin(admin);

        Map<String, Object> config = new HashMap<>();
        config.put("roles",           incoming.getOrDefault("roles",           new HashMap<>()));
        config.put("customRoles",     incoming.getOrDefault("customRoles",     new java.util.ArrayList<>()));
        config.put("idpRoleMappings", incoming.getOrDefault("idpRoleMappings", new java.util.ArrayList<>()));
        config.put("updatedAt",       TimestampUtil.now());
        config.put("updatedBy",       admin.getUid());

        if (devMode) {
            devConfigs.put(admin.getOrgId(), config);
            return config;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(admin.getOrgId())
              .collection(FirestoreCollections.CONFIG).document(DOC).set(config).get();
        } catch (Exception e) {
            log.error("Failed to save role config for org {}: {}", admin.getOrgId(), e.getMessage());
            throw new RuntimeException("Failed to save role configuration", e);
        }
        return config;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> emptyConfig() {
        Map<String, Object> c = new HashMap<>();
        c.put("roles",           new HashMap<>());
        c.put("customRoles",     new java.util.ArrayList<>());
        c.put("idpRoleMappings", new java.util.ArrayList<>());
        return c;
    }
}
