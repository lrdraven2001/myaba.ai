package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.PolicyRequest;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Organizational policy / document service.
 *
 * Firestore path: organizations/{orgId}/policies/{policyId}
 *
 * Policy document shape:
 * <pre>
 *   id:          String
 *   title:       String
 *   category:    String  (policy_manual|sop|handbook|clinical_sop|hipaa|billing)
 *   textContent: String  (full text — will pass through DLP once configured)
 *   isActive:    Boolean
 *   orgId:       String
 *   createdBy:   String
 *   createdAt:   String (ISO-8601)
 *   updatedAt:   String (ISO-8601)
 * </pre>
 *
 * Read access:  any authenticated org member.
 * Write access: ORG_ADMIN / ORG_SUPER_ADMIN only.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PolicyService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    private final Map<String, Map<String, Object>> devPolicies = new LinkedHashMap<>();

    /** Injected lazily to avoid circular dependency with PolicyRagService. */
    private PolicyRagService policyRagService;

    public void setPolicyRagService(PolicyRagService policyRagService) {
        this.policyRagService = policyRagService;
    }

    // ── Dev data seed ─────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        put("pol-001", Map.ofEntries(
            Map.entry("title",        "HIPAA Privacy Policy"),
            Map.entry("category",     "hipaa"),
            Map.entry("textContent",  "This policy establishes the privacy practices for protected health information (PHI) in accordance with the Health Insurance Portability and Accountability Act (HIPAA).\n\n1. Minimum Necessary Standard\nAll staff must access only the PHI necessary to perform their job functions.\n\n2. Safeguards\nAll PHI must be protected through administrative, physical, and technical safeguards.\n\n3. Breach Notification\nAny potential breach of PHI must be reported immediately to the Privacy Officer."),
            Map.entry("isActive",     true),
            Map.entry("purposes",     List.of()),
            Map.entry("resourceType", "POLICY"),
            Map.entry("orgId",        "dev-org-001"),
            Map.entry("createdBy",    "dev-user-001"),
            Map.entry("createdAt",    "2026-01-01T00:00:00Z"),
            Map.entry("updatedAt",    "2026-01-01T00:00:00Z")
        ));

        put("pol-002", Map.ofEntries(
            Map.entry("title",        "Clinical Documentation SOP"),
            Map.entry("category",     "clinical_sop"),
            Map.entry("textContent",  "Standard Operating Procedure for Clinical Documentation\n\n1. Session Notes\nAll session notes must be completed within 24 hours of service delivery.\n\n2. Required Elements\nEach note must include: date, start/end times, service code, client initials, present behaviors, interventions used, and progress toward goals.\n\n3. Supervisor Review\nRBT notes require BCBA review and co-signature within 7 days."),
            Map.entry("isActive",     true),
            Map.entry("purposes",     List.of()),
            Map.entry("resourceType", "POLICY"),
            Map.entry("orgId",        "dev-org-001"),
            Map.entry("createdBy",    "dev-user-001"),
            Map.entry("createdAt",    "2026-01-15T00:00:00Z"),
            Map.entry("updatedAt",    "2026-01-15T00:00:00Z")
        ));

        put("pol-003", Map.ofEntries(
            Map.entry("title",        "Employee Handbook"),
            Map.entry("category",     "handbook"),
            Map.entry("textContent",  "Welcome to our organization. This handbook outlines our policies, procedures, and expectations for all employees.\n\n1. Code of Conduct\nAll staff are expected to maintain professional behavior at all times.\n\n2. Confidentiality\nAll client information is strictly confidential.\n\n3. Professional Development\nAll BCBAs must maintain CEU requirements for BACB certification."),
            Map.entry("isActive",     true),
            Map.entry("purposes",     List.of()),
            Map.entry("resourceType", "POLICY"),
            Map.entry("orgId",        "dev-org-001"),
            Map.entry("createdBy",    "dev-user-001"),
            Map.entry("createdAt",    "2026-02-01T00:00:00Z"),
            Map.entry("updatedAt",    "2026-02-01T00:00:00Z")
        ));

        put("pol-004", Map.ofEntries(
            Map.entry("title",        "ABA Documentation Standards"),
            Map.entry("category",     "clinical_sop"),
            Map.entry("textContent",  "ABA Documentation Standards\n\nThis document defines the required format and content for all ABA therapy documentation within this organization.\n\n1. Session Note Format\nAll session notes must follow the ABC (Antecedent-Behavior-Consequence) framework. Notes must include:\n- Client identifier and date of service\n- Service code and duration\n- Environmental conditions and session context\n- Antecedent conditions for targeted behaviors\n- Specific behaviors observed with frequency/duration/intensity\n- Consequences applied and clinician responses\n- Skill acquisition trial data (correct/incorrect/prompted)\n- Progress toward individualized goals\n\n2. Behavioral Data Recording\nData must be recorded using the approved method for each target (frequency, duration, partial-interval, whole-interval, momentary time sampling, or trial-by-trial).\n\n3. Required Signatures\nRBT notes require supervising BCBA co-signature within 7 days. BCBA notes must be signed same day.\n\n4. Session Structure\nSession documentation must reflect the planned session structure: warm-up, skill acquisition blocks, maintenance probes, behavior reduction procedures, and caregiver training if applicable."),
            Map.entry("isActive",     true),
            Map.entry("purposes",     List.of("GENERATION", "GROUNDING", "CLASSIFICATION")),
            Map.entry("resourceType", "STANDARD"),
            Map.entry("orgId",        "dev-org-001"),
            Map.entry("createdBy",    "dev-user-001"),
            Map.entry("createdAt",    "2026-03-01T00:00:00Z"),
            Map.entry("updatedAt",    "2026-03-01T00:00:00Z")
        ));

        put("pol-005", Map.ofEntries(
            Map.entry("title",        "Session Note Template"),
            Map.entry("category",     "clinical_sop"),
            Map.entry("textContent",  "Session Note Template\n\nDate: [DATE] | Client: [CLIENT_INITIALS] | Clinician: [CLINICIAN_NAME] | Service Code: [CODE]\nSession Time: [START] - [END] | Location: [LOCATION]\n\nAntecedent:\n[Describe the environmental conditions, instructions given, and events preceding the targeted behaviors]\n\nBehavior:\n[Describe the specific behaviors observed. Include frequency counts, duration, or interval data as specified in the behavior plan]\n\nConsequence:\n[Describe the consequences delivered and clinician responses to behaviors]\n\nSkill Acquisition Data:\nTarget: [SKILL_TARGET_1] | Trials: [X] correct / [Y] total | Prompt level: [LEVEL]\nTarget: [SKILL_TARGET_2] | Trials: [X] correct / [Y] total | Prompt level: [LEVEL]\n\nBehavior Reduction:\nTarget: [BEHAVIOR_1] | Occurrences: [N] | Procedure: [PROCEDURE_NAME]\n\nProgress Notes:\n[Brief narrative of overall session progress, motivation levels, and clinician observations]\n\nCaregiver Training:\n[If applicable, describe training provided and caregiver demonstration]"),
            Map.entry("isActive",     true),
            Map.entry("purposes",     List.of("GENERATION")),
            Map.entry("resourceType", "TEMPLATE"),
            Map.entry("orgId",        "dev-org-001"),
            Map.entry("createdBy",    "dev-user-001"),
            Map.entry("createdAt",    "2026-03-15T00:00:00Z"),
            Map.entry("updatedAt",    "2026-03-15T00:00:00Z")
        ));

        log.info("Dev mode: seeded {} policies", devPolicies.size());
    }

    private void put(String id, Map<String, Object> data) {
        Map<String, Object> m = new HashMap<>(data);
        m.put("id", id);
        devPolicies.put(id, m);
    }

    // ── Queries ───────────────────────────────────────────────────────────

    /** Returns all active policies (or all policies for admins). */
    public List<Map<String, Object>> getPolicies(AppUser user) throws Exception {
        if (devMode) {
            return devPolicies.values().stream()
                    .filter(p -> user.isAdmin() || Boolean.TRUE.equals(p.get("isActive")))
                    .collect(Collectors.toList());
        }

        Firestore db = FirestoreClient.getFirestore();
        var query = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.POLICIES).orderBy("category");

        List<Map<String, Object>> all = toList(query.get().get().getDocuments());
        if (user.isAdmin()) return all;
        return all.stream()
                .filter(p -> Boolean.TRUE.equals(p.get("isActive")))
                .collect(Collectors.toList());
    }

    /**
     * Batch-fetch policies by ID for use in RAG / system prompt building.
     * Returns all requested policies regardless of isActive (already authorized at chat creation).
     */
    public List<Map<String, Object>> getPoliciesForContext(String orgId, List<String> policyIds) throws Exception {
        if (policyIds == null || policyIds.isEmpty()) return List.of();
        if (devMode) {
            return policyIds.stream()
                    .map(devPolicies::get)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }
        Firestore db = FirestoreClient.getFirestore();
        List<Map<String, Object>> result = new ArrayList<>();
        for (String pid : policyIds) {
            try {
                var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                        .collection(FirestoreCollections.POLICIES).document(pid).get().get();
                if (snap.exists()) {
                    Map<String, Object> data = new HashMap<>(snap.getData());
                    data.put("id", snap.getId());
                    result.add(data);
                }
            } catch (Exception e) {
                log.warn("Could not fetch policy {} for context: {}", pid, e.getMessage());
            }
        }
        return result;
    }

    /**
     * Get all active resources for an org that carry the given purpose tag.
     * Used by PolicyRagService to build ACLX grounding sources and by the
     * Resources Tab UI to display the library.
     *
     * @param orgId    organisation whose library to search
     * @param purpose  GENERATION | GROUNDING | CLASSIFICATION, or null for all resources
     * @param clientId if non-null, includes both client-scoped and org-wide resources
     * @return active resources whose purposes array contains the given purpose
     */
    /** Back-compat overload — filter by purpose only. */
    public List<Map<String, Object>> getResourcesByPurpose(String orgId, String purpose, String clientId) throws Exception {
        return getResources(orgId, null, purpose, clientId);
    }

    /**
     * List active resources for an org, optionally filtered by bucket (LIBRARY|GROUNDING|POLICY)
     * and/or purpose tag, and scoped to a client. Bucket filtering is done in memory so legacy
     * resources without a {@code bucket} field still resolve sensibly (treated as POLICY).
     */
    public List<Map<String, Object>> getResources(String orgId, String bucket, String purpose, String clientId) throws Exception {
        List<Map<String, Object>> all = getResourcesRaw(orgId, purpose, clientId);
        if (bucket == null || bucket.isBlank()) return all;
        return all.stream()
                .filter(p -> bucket.equals(p.getOrDefault("bucket", "POLICY")))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> getResourcesRaw(String orgId, String purpose, String clientId) throws Exception {
        if (devMode) {
            return devPolicies.values().stream()
                .filter(p -> Boolean.TRUE.equals(p.get("isActive")))
                .filter(p -> {
                    if (purpose == null) return true;
                    Object raw = p.get("purposes");
                    if (!(raw instanceof List)) return false;
                    return ((List<?>) raw).contains(purpose);
                })
                .filter(p -> {
                    if (clientId == null || clientId.isBlank()) return true;
                    Object cid = p.get("clientId");
                    return cid == null || clientId.equals(cid);
                })
                .collect(Collectors.toList());
        }
        Firestore db = FirestoreClient.getFirestore();
        var base = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).collection(FirestoreCollections.POLICIES)
                .whereEqualTo("isActive", true);
        var query = (purpose != null)
                ? base.whereArrayContains("purposes", purpose)
                : base;
        List<Map<String, Object>> all = toList(query.get().get().getDocuments());
        if (clientId == null || clientId.isBlank()) return all;
        return all.stream()
            .filter(p -> p.get("clientId") == null || clientId.equals(p.get("clientId")))
            .collect(Collectors.toList());
    }

    /** Fetch a single policy by ID. All org members can read active policies. */
    public Map<String, Object> getPolicy(AppUser user, String policyId) throws Exception {
        Map<String, Object> policy = fetchPolicy(user.getOrgId(), policyId);
        if (!user.isAdmin() && !Boolean.TRUE.equals(policy.get("isActive")))
            throw new SecurityException("Policy is not active: " + policyId);
        return policy;
    }

    // ── Writes (ORG_ADMIN only) ───────────────────────────────────────────

    /** Create a new policy. Caller must have already verified admin access. */
    public String createPolicy(AppUser user, PolicyRequest req) throws Exception {
        String now = TimestampUtil.now();
        Map<String, Object> data = new HashMap<>();
        data.put("title",       req.getTitle());
        data.put("category",    req.getCategory());
        data.put("textContent", req.getTextContent() != null ? req.getTextContent() : "");
        data.put("isActive",    req.getIsActive() != null ? req.getIsActive() : true);
        data.put("purposes",      req.getPurposes() != null ? req.getPurposes() : List.of());
        data.put("resourceType",  req.getResourceType() != null ? req.getResourceType() : "POLICY");
        data.put("bucket",        req.getBucket() != null ? req.getBucket() : "POLICY");
        if (req.getDocumentType() != null) data.put("documentType", req.getDocumentType());
        data.put("customized",    req.getCustomized() != null ? req.getCustomized() : false);
        if (req.getClientId() != null) data.put("clientId", req.getClientId());
        // Resource-manager metadata (additive)
        data.put("description",   req.getDescription()   != null ? req.getDescription()   : "");
        data.put("topicCategory", req.getTopicCategory() != null ? req.getTopicCategory() : "");
        data.put("fileType",      req.getFileType()      != null ? req.getFileType()      : "TEXT");
        data.put("source",        req.getSource()        != null ? req.getSource()        : "MANUAL");
        if (req.getUrl()    != null) data.put("url", req.getUrl());
        if (req.getFolder() != null) data.put("folder", req.getFolder());
        data.put("shared",        req.getShared()   != null ? req.getShared()   : true);
        data.put("archived",      req.getArchived() != null ? req.getArchived() : false);
        data.put("hipaaMarked",   req.getHipaaMarked() != null ? req.getHipaaMarked() : false);
        data.put("linkedIds",     req.getLinkedIds() != null ? req.getLinkedIds() : List.of());
        data.put("orgId",       user.getOrgId());
        data.put("createdBy",   user.getUid());
        data.put("createdAt",   now);
        data.put("updatedAt",   now);

        if (devMode) {
            String id = "pol-" + UUID.randomUUID().toString().substring(0, 8);
            data.put("id", id);
            devPolicies.put(id, data);
            indexForRag(user.getOrgId(), id, (String) data.get("title"),
                        (String) data.get("textContent"));
            return id;
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.POLICIES).add(data).get();
        indexForRag(user.getOrgId(), ref.getId(), (String) data.get("title"),
                    (String) data.get("textContent"));
        return ref.getId();
    }

    /** Update an existing policy. Caller must have already verified admin access. */
    public void updatePolicy(AppUser user, String policyId, PolicyRequest req) throws Exception {
        Map<String, Object> policy = fetchPolicy(user.getOrgId(), policyId);
        Map<String, Object> updates = new HashMap<>();
        if (req.getTitle() != null)       updates.put("title", req.getTitle());
        if (req.getCategory() != null)    updates.put("category", req.getCategory());
        if (req.getTextContent() != null) updates.put("textContent", req.getTextContent());
        if (req.getIsActive() != null)    updates.put("isActive", req.getIsActive());
        if (req.getPurposes() != null)     updates.put("purposes", req.getPurposes());
        if (req.getResourceType() != null) updates.put("resourceType", req.getResourceType());
        if (req.getClientId() != null)     updates.put("clientId", req.getClientId());
        if (req.getBucket() != null)        updates.put("bucket", req.getBucket());
        if (req.getDocumentType() != null)  updates.put("documentType", req.getDocumentType());
        if (req.getCustomized() != null)    updates.put("customized", req.getCustomized());
        if (req.getDescription() != null)   updates.put("description", req.getDescription());
        if (req.getTopicCategory() != null) updates.put("topicCategory", req.getTopicCategory());
        if (req.getFileType() != null)      updates.put("fileType", req.getFileType());
        if (req.getSource() != null)        updates.put("source", req.getSource());
        if (req.getUrl() != null)           updates.put("url", req.getUrl());
        if (req.getFolder() != null)        updates.put("folder", req.getFolder());
        if (req.getShared() != null)        updates.put("shared", req.getShared());
        if (req.getArchived() != null) {
            updates.put("archived", req.getArchived());
            // Stamp when archiving; clear on restore. Drives the HIPAA 7-day delete gate.
            updates.put("archivedAt", req.getArchived() ? TimestampUtil.now() : null);
        }
        if (req.getHipaaMarked() != null)   updates.put("hipaaMarked", req.getHipaaMarked());
        if (req.getLinkedIds() != null)     updates.put("linkedIds", req.getLinkedIds());
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) {
            policy.putAll(updates);
            if (updates.containsKey("textContent")) {
                indexForRag(user.getOrgId(), policyId,
                        (String) policy.get("title"), (String) updates.get("textContent"));
            }
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.POLICIES).document(policyId).update(updates).get();
        if (updates.containsKey("textContent")) {
            // Re-fetch merged title for RAG
            Map<String, Object> merged = fetchPolicy(user.getOrgId(), policyId);
            indexForRag(user.getOrgId(), policyId,
                    (String) merged.get("title"), (String) updates.get("textContent"));
        }
    }

    /** Delete a policy. Caller must have already verified admin access. */
    public void deletePolicy(AppUser user, String policyId) throws Exception {
        Map<String, Object> policy = fetchPolicy(user.getOrgId(), policyId); // ensure it exists
        enforceHipaaDeleteGate(policy);
        if (devMode) {
            devPolicies.remove(policyId);
            if (policyRagService != null) policyRagService.removePolicy(user.getOrgId(), policyId);
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.POLICIES).document(policyId).delete().get();
        if (policyRagService != null) policyRagService.removePolicy(user.getOrgId(), policyId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /** Retention window before a HIPAA-marked resource may be hard-deleted from the archive. */
    private static final long HIPAA_DELETE_WAIT_DAYS = 7;

    /**
     * HIPAA-marked resources are archive-first: they must be archived, and hard
     * deletion only unlocks {@value #HIPAA_DELETE_WAIT_DAYS} days after archiving.
     *
     * @throws IllegalArgumentException (→ HTTP 400) when the gate blocks deletion
     */
    private void enforceHipaaDeleteGate(Map<String, Object> policy) {
        if (!Boolean.TRUE.equals(policy.get("hipaaMarked"))) return;
        if (!Boolean.TRUE.equals(policy.get("archived"))) {
            throw new IllegalArgumentException(
                    "This item is HIPAA-marked — archive it first. Deletion unlocks "
                    + HIPAA_DELETE_WAIT_DAYS + " days after archiving.");
        }
        Object archivedAt = policy.get("archivedAt");
        java.time.Instant since;
        try {
            since = java.time.Instant.parse(String.valueOf(archivedAt));
        } catch (Exception e) {
            // No/invalid stamp (archived before this feature) — start the clock now.
            throw new IllegalArgumentException(
                    "This HIPAA-marked item has no archive timestamp yet — re-archive it to start the "
                    + HIPAA_DELETE_WAIT_DAYS + "-day deletion window.");
        }
        java.time.Instant unlocksAt = since.plus(HIPAA_DELETE_WAIT_DAYS, java.time.temporal.ChronoUnit.DAYS);
        if (java.time.Instant.now().isBefore(unlocksAt)) {
            long daysLeft = java.time.Duration.between(java.time.Instant.now(), unlocksAt).toDays() + 1;
            throw new IllegalArgumentException(
                    "This HIPAA-marked item was archived less than " + HIPAA_DELETE_WAIT_DAYS
                    + " days ago — deletion unlocks in about " + daysLeft + " day(s).");
        }
    }

    private Map<String, Object> fetchPolicy(String orgId, String policyId) throws Exception {
        if (devMode) {
            Map<String, Object> p = devPolicies.get(policyId);
            if (p == null) throw new NoSuchElementException("Policy not found: " + policyId);
            return p;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.POLICIES).document(policyId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Policy not found: " + policyId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    /**
     * Index all seeded dev policies. Called from ServiceWiringConfig after
     * PolicyRagService has been injected (avoids a chicken-and-egg @PostConstruct race).
     */
    public void indexSeedPolicies() {
        if (!devMode) return;
        devPolicies.forEach((id, policy) -> {
            String text  = (String) policy.get("textContent");
            String title = (String) policy.get("title");
            String orgId = (String) policy.getOrDefault("orgId", "dev-org-001");
            indexForRag(orgId, id, title, text);
        });
        log.info("Dev mode: indexed {} seeded policies into RAG", devPolicies.size());
    }

    private void indexForRag(String orgId, String policyId, String title, String text) {
        if (policyRagService != null && text != null && !text.isBlank()) {
            policyRagService.indexPolicy(orgId, policyId, title != null ? title : "", text);
        }
    }

    private List<Map<String, Object>> toList(List<QueryDocumentSnapshot> docs) {
        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        }).collect(Collectors.toList());
    }
}
