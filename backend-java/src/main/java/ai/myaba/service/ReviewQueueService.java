package ai.myaba.service;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Manages the ACLX escalation review queue.
 *
 * <p>When ACLX returns an ESCALATE decision for any AI-generated output, the raw
 * content is stored here for human review by an ORG_ADMIN or ORG_SUPER_ADMIN.
 * Reviewers can APPROVE (release the content) or DENY (permanently block it).
 * Every decision — including reviewer notes — is persisted so the org can
 * identify ACLX policy patterns over time and refine tuning accordingly.
 *
 * <p>Firestore path: {@code organizations/{orgId}/reviewQueue/{itemId}}
 *
 * <p>Item shape:
 * <pre>
 *   id                String
 *   orgId             String
 *   contentId         String   ACLX content_id
 *   eventType         String   CHAT_RESPONSE | DOCUMENT_GENERATED | SEARCH_SUMMARY
 *   requestingUserId  String   who triggered the AI call
 *   clientId          String?  client context (may be null)
 *   rawContent        String   the AI output text that was escalated
 *   aclxReason        String?  reason phrase from ACLX decision
 *   aclxSensitivity   String?  HIGH | MEDIUM | LOW
 *   aclxCategory      String?  PHI | etc.
 *   authDenyReason    String?  authorization_audit.deny_reason from ACLX label
 *                              (NOT_PROVIDED | REVOKED | EXPIRED) — surface to reviewers
 *   status            String   PENDING | APPROVED | DENIED
 *   reviewedBy        String?  uid of reviewer
 *   reviewedAt        String?  ISO-8601
 *   reviewerNotes     String?
 *   createdAt         String   ISO-8601
 * </pre>
 */
@Service
@Slf4j
public class ReviewQueueService {

    private final AclxService aclxService;

    public ReviewQueueService(AclxService aclxService) {
        this.aclxService = aclxService;
    }

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    private final Map<String, Map<String, Object>> devQueue = new LinkedHashMap<>();

    // ── Dev seed ──────────────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        String now  = Instant.now().toString();
        String yday = Instant.now().minus(1, ChronoUnit.DAYS).toString();
        String wk   = Instant.now().minus(7, ChronoUnit.DAYS).toString();

        // --- Pending items ---------------------------------------------------

        put("rq-001", Map.ofEntries(
            Map.entry("orgId",            "dev-org-001"),
            Map.entry("contentId",        "aclx-cid-001"),
            Map.entry("eventType",        "CHAT_RESPONSE"),
            Map.entry("requestingUserId", "dev-user-001"),
            Map.entry("clientId",         "c-001"),
            Map.entry("rawContent",
                "Based on the client's records, Alex Morgan (DOB 2018-03-15) has a documented "
                + "history of self-injurious behaviour including head-banging and wrist-biting. "
                + "Current frequency data shows an average of 4 incidents per session. "
                + "The treating BCBA recommends reviewing the crisis protocol immediately."),
            Map.entry("aclxReason",       "Response contains direct PHI identifiers combined with sensitive behavioural data"),
            Map.entry("aclxSensitivity",  "HIGH"),
            Map.entry("aclxCategory",     "PHI"),
            Map.entry("status",           "PENDING"),
            Map.entry("createdAt",        yday)
        ));

        // rq-002: SUD client (c-002) — auth check failed with EXPIRED.
        // Demonstrates authDenyReason surfacing in the review UI.
        put("rq-002", Map.ofEntries(
            Map.entry("orgId",            "dev-org-001"),
            Map.entry("contentId",        "aclx-cid-002"),
            Map.entry("eventType",        "SEARCH_SUMMARY"),
            Map.entry("requestingUserId", "dev-user-001"),
            Map.entry("clientId",         "c-002"),
            Map.entry("rawContent",
                "Search results include Jordan Thompson's intake assessment, "
                + "a progress note from 2026-03-10, and the BIP template last updated by the "
                + "supervising BCBA. The FBA report references specific behavioural functions "
                + "linked to medical history."),
            Map.entry("aclxReason",       "Cross-entity summary combines identifiable client data with clinical document content"),
            Map.entry("aclxSensitivity",  "HIGH"),
            Map.entry("aclxCategory",     "PHI"),
            Map.entry("authDenyReason",   "EXPIRED"),
            Map.entry("status",           "PENDING"),
            Map.entry("createdAt",        now)
        ));

        put("rq-003", Map.ofEntries(
            Map.entry("orgId",            "dev-org-001"),
            Map.entry("contentId",        "aclx-cid-003"),
            Map.entry("eventType",        "DOCUMENT_GENERATED"),
            Map.entry("requestingUserId", "dev-user-001"),
            Map.entry("clientId",         "c-003"),
            Map.entry("rawContent",
                "Progress Note - Session 2026-04-14\nClient: Sam Rivera\n"
                + "Today's session targeted mand training and functional communication. "
                + "Sam demonstrated 85% accuracy on PECS Phase III exchanges. "
                + "Caregiver reported a medical event over the weekend requiring ER visit."),
            Map.entry("aclxReason",       "Document references a medical event that may constitute sensitive PHI requiring clinical oversight"),
            Map.entry("aclxSensitivity",  "MEDIUM"),
            Map.entry("aclxCategory",     "PHI"),
            Map.entry("status",           "PENDING"),
            Map.entry("createdAt",        now)
        ));

        // --- Historical decisions (APPROVED) ---------------------------------

        put("rq-004", Map.ofEntries(
            Map.entry("orgId",            "dev-org-001"),
            Map.entry("contentId",        "aclx-cid-004"),
            Map.entry("eventType",        "CHAT_RESPONSE"),
            Map.entry("requestingUserId", "dev-user-001"),
            Map.entry("clientId",         "c-001"),
            Map.entry("rawContent",
                "Alex has shown significant progress on eye-contact targets, moving from "
                + "15% to 72% over the past 8 weeks. The treatment team should consider "
                + "advancing to naturalistic environment training."),
            Map.entry("aclxReason",       "Response references specific progress data that may identify the client"),
            Map.entry("aclxSensitivity",  "MEDIUM"),
            Map.entry("aclxCategory",     "PHI"),
            Map.entry("status",           "APPROVED"),
            Map.entry("reviewedBy",       "admin-user-001"),
            Map.entry("reviewedAt",       wk),
            Map.entry("reviewerNotes",    "Approved - progress percentages without direct identifiers are acceptable in clinical context. Recommend ACLX threshold review for progress data."),
            Map.entry("createdAt",        Instant.now().minus(8, ChronoUnit.DAYS).toString())
        ));

        put("rq-005", Map.ofEntries(
            Map.entry("orgId",            "dev-org-001"),
            Map.entry("contentId",        "aclx-cid-005"),
            Map.entry("eventType",        "DOCUMENT_GENERATED"),
            Map.entry("requestingUserId", "dev-user-001"),
            Map.entry("clientId",         "c-002"),
            Map.entry("rawContent",
                "FBA Summary - Jordan Thompson, DOB 2019-07-22\n"
                + "Insurance: BCBS PPO #JT-4492871\nPrimary diagnosis: ASD Level 1 with ADHD comorbidity. "
                + "Hypothesized function of behaviour: escape from non-preferred academic tasks."),
            Map.entry("aclxReason",       "Contains insurance ID number and full legal name with date of birth"),
            Map.entry("aclxSensitivity",  "HIGH"),
            Map.entry("aclxCategory",     "PHI"),
            Map.entry("status",           "DENIED"),
            Map.entry("reviewedBy",       "admin-user-001"),
            Map.entry("reviewedAt",       Instant.now().minus(5, ChronoUnit.DAYS).toString()),
            Map.entry("reviewerNotes",    "Denied - insurance member ID is not appropriate in AI-generated documentation. Clinical team should use de-identified references. Flagging for DLP rule addition."),
            Map.entry("createdAt",        Instant.now().minus(6, ChronoUnit.DAYS).toString())
        ));

        log.info("Dev mode: seeded {} review queue items ({} pending)",
                devQueue.size(),
                devQueue.values().stream().filter(i -> "PENDING".equals(i.get("status"))).count());
    }

    private void put(String id, Map<String, Object> data) {
        Map<String, Object> m = new HashMap<>(data);
        m.put("id", id);
        devQueue.put(id, m);
    }

    // ── Enqueue ───────────────────────────────────────────────────────────────

    /**
     * Store an escalated AI output for human review.
     * Called by any controller that receives an ACLX ESCALATE decision.
     *
     * @param authDenyReason  value from {@code aclx.audit.authorization_audit.deny_reason}
     *                        in the ACLX response; {@code NOT_PROVIDED | REVOKED | EXPIRED}.
     *                        Null when no authorization check was performed.
     */
    public String enqueue(String orgId, String contentId, String eventType,
                          String requestingUserId, String clientId,
                          String rawContent, String aclxReason,
                          String aclxSensitivity, String aclxCategory,
                          String authDenyReason) {
        String id  = "rq-" + UUID.randomUUID().toString().substring(0, 8);
        String now = Instant.now().toString();

        Map<String, Object> item = new HashMap<>();
        item.put("id",               id);
        item.put("orgId",            orgId);
        item.put("contentId",        contentId != null ? contentId : "");
        item.put("eventType",        eventType);
        item.put("requestingUserId", requestingUserId);
        item.put("clientId",         clientId != null ? clientId : "");
        item.put("rawContent",       rawContent != null ? rawContent : "");
        item.put("aclxReason",       aclxReason != null ? aclxReason : "");
        item.put("aclxSensitivity",  aclxSensitivity != null ? aclxSensitivity : "");
        item.put("aclxCategory",     aclxCategory != null ? aclxCategory : "");
        if (authDenyReason != null && !authDenyReason.isBlank()) {
            item.put("authDenyReason", authDenyReason);
        }
        item.put("status",           "PENDING");
        item.put("createdAt",        now);

        if (devMode) {
            devQueue.put(id, item);
            log.info("Dev: enqueued review item {} for event {}", id, eventType);
            return id;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .collection("reviewQueue").document(id).set(item);
        } catch (Exception e) {
            log.error("Failed to enqueue review item: {}", e.getMessage());
        }
        return id;
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /** Returns all queue items for the org, newest first. Admin-only. */
    public List<Map<String, Object>> getQueue(AppUser user) throws Exception {
        requireAdmin(user);

        if (devMode) {
            return devQueue.values().stream()
                    .filter(i -> user.getOrgId().equals(i.get("orgId")))
                    .sorted(Comparator.comparing(
                            i -> (String) i.getOrDefault("createdAt", ""),
                            Comparator.reverseOrder()))
                    .collect(Collectors.toList());
        }

        Firestore db = FirestoreClient.getFirestore();
        List<QueryDocumentSnapshot> docs = db
                .collection("organizations").document(user.getOrgId())
                .collection("reviewQueue")
                .orderBy("createdAt", com.google.cloud.firestore.Query.Direction.DESCENDING)
                .get().get().getDocuments();

        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        }).collect(Collectors.toList());
    }

    /** Count of PENDING items for the org. Used for the sidebar badge. */
    public int getPendingCount(AppUser user) {
        if (!UserRole.isAdmin(user.getRole())) return 0;
        try {
            return (int) getQueue(user).stream()
                    .filter(i -> "PENDING".equals(i.get("status")))
                    .count();
        } catch (Exception e) {
            log.warn("getPendingCount failed: {}", e.getMessage());
            return 0;
        }
    }

    // ── Review ────────────────────────────────────────────────────────────────

    /**
     * Submit a review verdict (APPROVED or DENIED) for a pending item.
     * Admin-only. Notes are stored alongside the verdict to build the
     * learning/tuning record.
     */
    public Map<String, Object> submitReview(AppUser reviewer, String itemId,
                                            String verdict, String notes) throws Exception {
        requireAdmin(reviewer);

        if (!verdict.equals("APPROVED") && !verdict.equals("DENIED")) {
            throw new IllegalArgumentException("Verdict must be APPROVED or DENIED");
        }

        if (devMode) {
            Map<String, Object> item = devQueue.get(itemId);
            if (item == null) throw new NoSuchElementException("Review item not found: " + itemId);
            if (!"PENDING".equals(item.get("status")))
                throw new IllegalStateException("Item " + itemId + " is not pending");

            item.put("status",        verdict);
            item.put("reviewedBy",    reviewer.getUid());
            item.put("reviewedAt",    Instant.now().toString());
            item.put("reviewerNotes", notes != null ? notes : "");

            // Forward verdict to ACLX gateway as a learning signal (best-effort)
            aclxService.submitFeedback(
                    reviewer.getOrgId(),
                    (String) item.get("contentId"),
                    verdict,
                    (String) item.get("eventType"),
                    notes,
                    reviewer.getUid());

            return item;
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection("organizations").document(reviewer.getOrgId())
                    .collection("reviewQueue").document(itemId);
        var snap = ref.get().get();
        if (!snap.exists()) throw new NoSuchElementException("Review item not found: " + itemId);

        Map<String, Object> updates = new HashMap<>();
        updates.put("status",        verdict);
        updates.put("reviewedBy",    reviewer.getUid());
        updates.put("reviewedAt",    Instant.now().toString());
        updates.put("reviewerNotes", notes != null ? notes : "");
        ref.update(updates).get();

        // Forward verdict to ACLX gateway as a learning signal (best-effort)
        Map<String, Object> allData = snap.getData();
        aclxService.submitFeedback(
                reviewer.getOrgId(),
                (String) allData.get("contentId"),
                verdict,
                (String) allData.get("eventType"),
                notes,
                reviewer.getUid());

        Map<String, Object> result = new HashMap<>(allData);
        result.put("id", itemId);
        result.putAll(updates);
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void requireAdmin(AppUser user) {
        if (!UserRole.isAdmin(user.getRole())) {
            throw new SecurityException("Review queue access requires ORG_ADMIN or ORG_SUPER_ADMIN role");
        }
    }
}
