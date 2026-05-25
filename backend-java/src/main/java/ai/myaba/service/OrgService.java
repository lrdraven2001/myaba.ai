package ai.myaba.service;

import ai.myaba.model.dto.OrgRequest;
import ai.myaba.model.dto.UserRole;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Organization lifecycle service.
 *
 * Firestore paths:
 *   organizations/{orgId}
 *   organizations/{orgId}/inviteTokens/{token}
 *
 * Org document shape:
 * <pre>
 *   id:          String
 *   name:        String
 *   plan:        String  (solo | team | enterprise)
 *   adminUid:    String
 *   createdAt:   String (ISO-8601)
 *   settings: {
 *     sessionTimeoutMinutes: 15,
 *     mfaRequired: false
 *   }
 * </pre>
 *
 * Invite token shape:
 * <pre>
 *   token:     String
 *   orgId:     String
 *   role:      String
 *   createdBy: String
 *   expiresAt: String (ISO-8601, 7 days)
 *   usedBy:    String|null
 * </pre>
 */
@Service
@Slf4j
public class OrgService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    @Value("${app.base-url:http://localhost:5173}")
    private String appBaseUrl;

    private final Map<String, Map<String, Object>> devOrgs   = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> devTokens = new ConcurrentHashMap<>();

    // ── Dev seed ──────────────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;
        Map<String, Object> org = new HashMap<>();
        org.put("id",         "dev-org-001");
        org.put("name",       "MyABA Dev Organization");
        org.put("plan",       "team");
        org.put("adminUid",   "dev-user-001");
        org.put("createdAt",  "2026-01-01T00:00:00Z");
        org.put("settings",   Map.of("sessionTimeoutMinutes", 15, "mfaRequired", false));
        devOrgs.put("dev-org-001", org);
        log.info("Dev mode: seeded org dev-org-001");
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    public Map<String, Object> getOrg(String orgId) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            return new HashMap<>(org);
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection("organizations").document(orgId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Org not found: " + orgId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    // ── Create org ────────────────────────────────────────────────────────────

    /**
     * Create a new organization and make the calling user its first ORG_ADMIN.
     * Sets Firebase custom claims: { role: ORG_ADMIN, orgId, purpose: oversight }.
     *
     * @return new orgId
     */
    public String createOrg(String adminUid, OrgRequest req) throws Exception {
        String orgId  = "org-" + UUID.randomUUID().toString().substring(0, 8);
        String now    = Instant.now().toString();

        Map<String, Object> data = new HashMap<>();
        data.put("id",        orgId);
        data.put("name",      req.getName());
        data.put("plan",      req.getPlan());
        data.put("adminUid",  adminUid);
        data.put("createdAt", now);
        data.put("settings",  Map.of("sessionTimeoutMinutes", 15, "mfaRequired", false));

        if (devMode) {
            devOrgs.put(orgId, data);
            log.info("Dev: created org {} for user {}", orgId, adminUid);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId).set(data).get();
            setUserClaims(adminUid, orgId, UserRole.ORG_ADMIN, "oversight");
        }
        return orgId;
    }

    // ── Org settings ──────────────────────────────────────────────────────────

    public void updateOrgSettings(String orgId, Map<String, Object> settings) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            @SuppressWarnings("unchecked")
            Map<String, Object> existing = new HashMap<>((Map<String, Object>) org.getOrDefault("settings", Map.of()));
            existing.putAll(settings);
            org.put("settings", existing);
            org.put("updatedAt", Instant.now().toString());
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        Map<String, Object> updates = new HashMap<>();
        settings.forEach((k, v) -> updates.put("settings." + k, v));
        updates.put("updatedAt", Instant.now().toString());
        db.collection("organizations").document(orgId).update(updates).get();
    }

    // ── Invite tokens ─────────────────────────────────────────────────────────

    /**
     * Generate a single-use invite token for a given role.
     * Returns the full invite URL.
     */
    public String generateInviteToken(String orgId, String role, String createdByUid) throws Exception {
        if (!UserRole.isValid(role)) throw new IllegalArgumentException("Invalid role: " + role);
        String token     = UUID.randomUUID().toString().replace("-", "");
        String expiresAt = Instant.now().plusSeconds(7 * 24 * 3600).toString(); // 7 days

        Map<String, Object> data = new HashMap<>();
        data.put("token",     token);
        data.put("orgId",     orgId);
        data.put("role",      role);
        data.put("createdBy", createdByUid);
        data.put("expiresAt", expiresAt);
        data.put("usedBy",    null);

        if (devMode) {
            devTokens.put(token, data);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .collection("inviteTokens").document(token).set(data).get();
        }
        return appBaseUrl + "/invite/" + token;
    }

    /**
     * Look up an invite token without consuming it.
     * Returns token metadata so the frontend can show the org name.
     *
     * @throws NoSuchElementException if token doesn't exist or has expired
     */
    public Map<String, Object> resolveInviteToken(String token) throws Exception {
        Map<String, Object> data = loadToken(token);
        validateToken(data);
        // Don't expose the raw token data; return a safe subset
        Map<String, Object> result = new HashMap<>();
        result.put("orgId", data.get("orgId"));
        result.put("role",  data.get("role"));
        // Fetch org name
        try {
            Map<String, Object> org = getOrg((String) data.get("orgId"));
            result.put("orgName", org.get("name"));
        } catch (Exception ignored) {}
        return result;
    }

    /**
     * Claim an invite token: apply the role + orgId claims to the user.
     * Marks the token as used (single-use).
     */
    public void claimInviteToken(String token, String claimingUid) throws Exception {
        Map<String, Object> data = loadToken(token);
        validateToken(data);
        if (data.get("usedBy") != null)
            throw new IllegalStateException("Invite token has already been used");

        String orgId = (String) data.get("orgId");
        String role  = (String) data.get("role");

        if (!devMode) {
            setUserClaims(claimingUid, orgId, role, defaultPurpose(role));

            // Mark token as used in Firestore
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .collection("inviteTokens").document(token)
              .update(Map.of("usedBy", claimingUid, "usedAt", Instant.now().toString())).get();
        }
        data.put("usedBy", claimingUid);
        data.put("usedAt", Instant.now().toString());
        if (devMode) devTokens.put(token, data);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> loadToken(String token) throws Exception {
        if (devMode) {
            Map<String, Object> data = devTokens.get(token);
            if (data == null) throw new NoSuchElementException("Invite token not found");
            return data;
        }
        // Need orgId to find token in Firestore.
        // Tokens are indexed under the org but we don't have orgId here, so we do a
        // collection-group query (requires a Firestore index).
        // Fallback: store tokens in a top-level /inviteTokens collection.
        Firestore db = FirestoreClient.getFirestore();
        var docs = db.collectionGroup("inviteTokens")
                     .whereEqualTo("token", token).get().get().getDocuments();
        if (docs.isEmpty()) throw new NoSuchElementException("Invite token not found");
        Map<String, Object> data = new HashMap<>(docs.get(0).getData());
        data.put("_docPath", docs.get(0).getReference().getPath());
        return data;
    }

    private void validateToken(Map<String, Object> data) {
        String expiresAt = (String) data.get("expiresAt");
        if (expiresAt != null && Instant.parse(expiresAt).isBefore(Instant.now())) {
            throw new IllegalStateException("Invite token has expired");
        }
    }

    private void setUserClaims(String uid, String orgId, String role, String purpose) {
        try {
            Map<String, Object> claims = new HashMap<>();
            claims.put("orgId",   orgId);
            claims.put("role",    role);
            claims.put("purpose", purpose);
            FirebaseAuth.getInstance().setCustomUserClaims(uid, claims);
        } catch (Exception e) {
            log.error("Failed to set custom claims for user {}: {}", uid, e.getMessage());
            throw new RuntimeException("Failed to update user role", e);
        }
    }

    private String defaultPurpose(String role) {
        return switch (role) {
            case UserRole.TREATING_BCBA, UserRole.SUPERVISING_BCBA,
                 UserRole.BCBA_STUDENT, UserRole.RBT     -> "treatment";
            case UserRole.SCHEDULING_ADMIN                -> "scheduling";
            case UserRole.BILLING_ADMIN                   -> "payment";
            case UserRole.ORG_ADMIN, UserRole.ORG_SUPER_ADMIN -> "oversight";
            default                                        -> "treatment";
        };
    }
}
