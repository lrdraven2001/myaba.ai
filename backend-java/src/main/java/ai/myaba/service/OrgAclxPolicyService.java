package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Manages the per-organisation ACLX policy layer.
 *
 * <p>This is myABA's side of the ACLX org-policy contract. It stores rules the
 * organisation has defined (either explicitly by an admin or promoted from review
 * decisions). On every {@code AclxService.evaluate()} call, the current policy
 * is fetched and included in the {@code org_policy} field of the request so ACLX
 * can apply it on top of its baseline HIPAA ruleset.
 *
 * <p>A "policy rule" has:
 * <pre>
 *   id                  String  unique rule ID
 *   type                String  "ALLOW" | "BLOCK"
 *   slug                String  machine-readable pattern label (no spaces)
 *   description         String  human-readable description of the pattern
 *   addedBy             String  uid of admin who added/promoted the rule
 *   addedAt             String  ISO-8601
 *   sourceReviewItemId  String? review queue item that this rule was derived from
 * </pre>
 *
 * <p>Top-level policy doc also contains:
 * <pre>
 *   escalateAtSensitivity  String?  e.g. "HIGH" — only escalate at this sensitivity+
 *   updatedAt              String   ISO-8601
 *   updatedBy              String   uid
 * </pre>
 *
 * <p>Firestore path: {@code organizations/{orgId}/config/aclxPolicy}
 */
@Service
@Slf4j
public class OrgAclxPolicyService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    // In-memory store keyed by orgId
    private final Map<String, Map<String, Object>> devPolicies = new HashMap<>();

    // ── Dev seed ──────────────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        // Seed dev-org-001 with two rules derived from the seeded review history
        List<Map<String, Object>> allowRules = new ArrayList<>();
        allowRules.add(rule("rule-001", "ALLOW",
                "progress_data_without_direct_phi",
                "Progress data (percentages, trial counts) without direct PHI identifiers are acceptable in clinical context",
                "admin-user-001", "rq-004"));

        List<Map<String, Object>> blockRules = new ArrayList<>();
        blockRules.add(rule("rule-002", "BLOCK",
                "insurance_member_id_in_generated_content",
                "Insurance member IDs must not appear in AI-generated documentation",
                "admin-user-001", "rq-005"));

        Map<String, Object> policy = new HashMap<>();
        policy.put("allowRules",             allowRules);
        policy.put("blockRules",             blockRules);
        policy.put("escalateAtSensitivity",  "HIGH");
        policy.put("updatedAt",              TimestampUtil.now());
        policy.put("updatedBy",              "admin-user-001");

        devPolicies.put("dev-org-001", policy);
        log.info("Dev mode: seeded ACLX org policy for dev-org-001 ({} allow, {} block rules)",
                allowRules.size(), blockRules.size());
    }

    private Map<String, Object> rule(String id, String type, String slug,
                                     String description, String addedBy,
                                     String sourceItemId) {
        Map<String, Object> r = new HashMap<>();
        r.put("id",                 id);
        r.put("type",               type);
        r.put("slug",               slug);
        r.put("description",        description);
        r.put("addedBy",            addedBy);
        r.put("addedAt",            TimestampUtil.now());
        r.put("sourceReviewItemId", sourceItemId != null ? sourceItemId : "");
        return r;
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /** Returns the full policy document for the org, or an empty policy if none exists. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getPolicy(String orgId) {
        if (devMode) {
            return devPolicies.getOrDefault(orgId, emptyPolicy());
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                         .collection(FirestoreCollections.CONFIG).document("aclxPolicy").get().get();
            if (!snap.exists()) return emptyPolicy();
            Map<String, Object> data = new HashMap<>(snap.getData());
            if (!data.containsKey("allowRules")) data.put("allowRules", new ArrayList<>());
            if (!data.containsKey("blockRules"))  data.put("blockRules",  new ArrayList<>());
            return data;
        } catch (Exception e) {
            log.warn("Failed to load ACLX org policy for {}: {}", orgId, e.getMessage());
            return emptyPolicy();
        }
    }

    /**
     * Extract allowedPattern slugs for inclusion in {@code AclxRequest.OrgPolicy}.
     */
    @SuppressWarnings("unchecked")
    public List<String> getAllowedPatternSlugs(String orgId) {
        Map<String, Object> policy = getPolicy(orgId);
        List<Map<String, Object>> rules =
                (List<Map<String, Object>>) policy.getOrDefault("allowRules", List.of());
        return rules.stream()
                .map(r -> (String) r.get("slug"))
                .filter(Objects::nonNull)
                .toList();
    }

    /**
     * Extract blockedPattern slugs for inclusion in {@code AclxRequest.OrgPolicy}.
     */
    @SuppressWarnings("unchecked")
    public List<String> getBlockedPatternSlugs(String orgId) {
        Map<String, Object> policy = getPolicy(orgId);
        List<Map<String, Object>> rules =
                (List<Map<String, Object>>) policy.getOrDefault("blockRules", List.of());
        return rules.stream()
                .map(r -> (String) r.get("slug"))
                .filter(Objects::nonNull)
                .toList();
    }

    /**
     * The org's configured escalation threshold, or {@code null} when unset. The effective
     * default for an unset value is LOW (minimum HIPAA): callers building an org policy
     * coalesce null → "LOW", and a fully-unconfigured org falls through to the ACLX baseline,
     * which is that same LOW floor. Accepted values: LOW | MEDIUM | HIGH.
     */
    public String getEscalateAtSensitivity(String orgId) {
        return (String) getPolicy(orgId).get("escalateAtSensitivity");
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /** Add or replace a policy rule (ALLOW or BLOCK). Admin-only. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> addRule(AppUser admin, String type, String slug,
                                       String description, String sourceItemId) {
        requireAdmin(admin);
        if (!type.equals("ALLOW") && !type.equals("BLOCK")) {
            throw new IllegalArgumentException("Rule type must be ALLOW or BLOCK");
        }

        String ruleId = "rule-" + UUID.randomUUID().toString().substring(0, 8);
        Map<String, Object> newRule = rule(ruleId, type, slug, description,
                admin.getUid(), sourceItemId);

        if (devMode) {
            Map<String, Object> policy = devPolicies.computeIfAbsent(admin.getOrgId(),
                    k -> emptyPolicy());
            String listKey = "ALLOW".equals(type) ? "allowRules" : "blockRules";
            List<Map<String, Object>> list = (List<Map<String, Object>>) policy.get(listKey);
            // Remove any existing rule with the same slug
            list.removeIf(r -> slug.equals(r.get("slug")));
            list.add(newRule);
            policy.put("updatedAt", TimestampUtil.now());
            policy.put("updatedBy", admin.getUid());
            return newRule;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(admin.getOrgId())
                        .collection(FirestoreCollections.CONFIG).document("aclxPolicy");
            // Firestore arrayUnion would be cleaner; for simplicity do a read-modify-write
            var snap = ref.get().get();
            Map<String, Object> policy = snap.exists()
                    ? new HashMap<>(snap.getData()) : emptyPolicy();

            String listKey = "ALLOW".equals(type) ? "allowRules" : "blockRules";
            List<Map<String, Object>> list =
                    (List<Map<String, Object>>) policy.getOrDefault(listKey, new ArrayList<>());
            list.removeIf(r -> slug.equals(r.get("slug")));
            list.add(newRule);
            policy.put(listKey, list);
            policy.put("updatedAt", TimestampUtil.now());
            policy.put("updatedBy", admin.getUid());
            ref.set(policy).get();
        } catch (Exception e) {
            log.error("Failed to add ACLX rule for org {}: {}", admin.getOrgId(), e.getMessage());
            throw new RuntimeException("Failed to save policy rule", e);
        }
        return newRule;
    }

    /** Remove a rule by ID. Admin-only. */
    @SuppressWarnings("unchecked")
    public void removeRule(AppUser admin, String ruleId) {
        requireAdmin(admin);

        if (devMode) {
            Map<String, Object> policy = devPolicies.get(admin.getOrgId());
            if (policy == null) return;
            for (String key : List.of("allowRules", "blockRules")) {
                List<Map<String, Object>> list =
                        (List<Map<String, Object>>) policy.getOrDefault(key, new ArrayList<>());
                list.removeIf(r -> ruleId.equals(r.get("id")));
            }
            return;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(admin.getOrgId())
                        .collection(FirestoreCollections.CONFIG).document("aclxPolicy");
            var snap = ref.get().get();
            if (!snap.exists()) return;
            Map<String, Object> policy = new HashMap<>(snap.getData());
            for (String key : List.of("allowRules", "blockRules")) {
                List<Map<String, Object>> list =
                        (List<Map<String, Object>>) policy.getOrDefault(key, new ArrayList<>());
                list.removeIf(r -> ruleId.equals(r.get("id")));
                policy.put(key, list);
            }
            ref.set(policy).get();
        } catch (Exception e) {
            log.error("Failed to remove ACLX rule: {}", e.getMessage());
            throw new RuntimeException("Failed to remove policy rule", e);
        }
    }

    /** Update the sensitivity threshold. Admin-only. */
    public void setEscalateAtSensitivity(AppUser admin, String sensitivity) {
        requireAdmin(admin);
        if (!List.of("HIGH", "MEDIUM", "LOW").contains(sensitivity)) {
            throw new IllegalArgumentException("sensitivity must be HIGH, MEDIUM, or LOW");
        }

        if (devMode) {
            devPolicies.computeIfAbsent(admin.getOrgId(), k -> emptyPolicy())
                       .put("escalateAtSensitivity", sensitivity);
            return;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(admin.getOrgId())
              .collection(FirestoreCollections.CONFIG).document("aclxPolicy")
              .update(Map.of(
                      "escalateAtSensitivity", sensitivity,
                      "updatedAt", TimestampUtil.now(),
                      "updatedBy", admin.getUid()
              )).get();
        } catch (Exception e) {
            log.error("Failed to set escalation threshold: {}", e.getMessage());
            throw new RuntimeException("Failed to update threshold", e);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> emptyPolicy() {
        Map<String, Object> p = new HashMap<>();
        p.put("allowRules", new ArrayList<>());
        p.put("blockRules",  new ArrayList<>());
        p.put("escalateAtSensitivity", null);
        return p;
    }

    private void requireAdmin(AppUser user) {
        ai.myaba.security.AuthorizationUtil.requireAdmin(user);
    }
}
