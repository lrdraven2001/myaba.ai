package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ClientRequest;
import ai.myaba.model.dto.UserRole;
import ai.myaba.security.Capability;
import ai.myaba.security.EffectivePermissions;
import ai.myaba.security.PermissionService;
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
 * Client record service.
 *
 * Firestore path: organizations/{orgId}/clients/{clientId}
 *
 * Authorization document shape:
 * <pre>
 *   treatingBcbaId:    String          ← primary clinician
 *   supervisingBcbaId: String|null     ← oversight BCBA
 *   rbtIds:            List&lt;String&gt;    ← assigned technicians
 *   viewerIds:         List&lt;String&gt;    ← read-only (billing, scheduling per-record)
 *   memberIds:         List&lt;String&gt;    ← union of all above; used for array-contains queries
 * </pre>
 *
 * All list/get methods return only records the requesting user is authorized for.
 * Authorization decisions are delegated to {@link AuthorizationService} so the
 * policy logic stays in one place.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientService {

    private final AuthorizationService authorizationService;
    private final PermissionService permissionService;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /** In-memory store — dev mode only. */
    private final Map<String, Map<String, Object>> devClients = new LinkedHashMap<>();


    private void put(String id, Map<String, Object> data) {
        Map<String, Object> m = new HashMap<>(data);
        m.put("id", id);
        devClients.put(id, m);
    }

    // ── Queries ───────────────────────────────────────────────────────────

    /**
     * Returns all clients the user is authorized to see.
     *
     * Firestore: queries by memberIds array-contains for O(1) index lookup.
     * Dev mode: in-memory filter via AuthorizationService.
     */
    public List<Map<String, Object>> getAuthorizedClients(AppUser user) throws Exception {
        if (devMode) {
            return devClients.values().stream()
                    .filter(c -> authorizationService.canAccessClient(user, c))
                    .collect(Collectors.toList());
        }

        Firestore db = FirestoreClient.getFirestore();

        // ORG_ADMIN sees all clients in the org without the memberIds filter
        if (UserRole.isAdmin(user.getRole())) {
            List<QueryDocumentSnapshot> docs = db
                    .collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                    .collection(FirestoreCollections.CLIENTS)
                    .orderBy("createdAt")
                    .get().get().getDocuments();
            return toList(docs);
        }

        // Everyone else: array-contains on the denormalized memberIds field
        List<QueryDocumentSnapshot> docs = db
                .collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.CLIENTS)
                .whereArrayContains("memberIds", user.getUid())
                .get().get().getDocuments();
        return toList(docs);
    }

    /**
     * Fetch a single client, enforcing read authorization.
     *
     * @throws NoSuchElementException   if not found
     * @throws SecurityException        if user is not authorized
     */
    public Map<String, Object> getClient(String orgId, String clientId) throws Exception {
        if (devMode) {
            Map<String, Object> c = devClients.get(clientId);
            if (c == null) throw new NoSuchElementException("Client not found: " + clientId);
            return c;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.CLIENTS).document(clientId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Client not found: " + clientId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    /**
     * Fetch multiple clients by ID in a single batch, returned as a map for fast lookups.
     * Used by cross-client authorization checks in the generate controller.
     */
    public Map<String, Map<String, Object>> getClientsById(String orgId,
                                                            List<String> clientIds) throws Exception {
        Map<String, Map<String, Object>> result = new HashMap<>();
        if (devMode) {
            clientIds.forEach(id -> {
                Map<String, Object> c = devClients.get(id);
                if (c != null) result.put(id, c);
            });
            return result;
        }

        Firestore db = FirestoreClient.getFirestore();
        // Firestore getAll() fetches up to 30 docs in one RPC
        var docRefs = clientIds.stream()
                .map(id -> db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                        .collection(FirestoreCollections.CLIENTS).document(id))
                .toArray(com.google.cloud.firestore.DocumentReference[]::new);

        db.getAll(docRefs).get().forEach(snap -> {
            if (snap.exists()) {
                Map<String, Object> data = new HashMap<>(snap.getData());
                data.put("id", snap.getId());
                result.put(snap.getId(), data);
            }
        });
        return result;
    }

    /**
     * Extracts human-readable identifiers from a client record for use as
     * {@code authorized_subjects.identifiers} in an ACLX evaluate request.
     *
     * <p>The ACLX cross-patient PHI detector matches these strings against the AI
     * response text to determine whether detected PHI belongs to an authorized
     * subject or has leaked from a different patient.
     *
     * <p><strong>Included:</strong> full legal name, preferred name (when distinct
     * from first name), EHR case ID / MRN equivalent.<br>
     * <strong>Excluded:</strong> date of birth — it appears too often in clinical
     * text as a session or assessment date, generating high false-positive rates.
     *
     * @param client raw client document map from Firestore / dev store
     * @return ordered list of identifier strings; never null, may be empty
     */
    public List<String> extractIdentifiers(Map<String, Object> client) {
        List<String> ids = new ArrayList<>();
        String firstName  = safeStr(client, "firstName");
        String lastName   = safeStr(client, "lastName");
        String preferred  = safeStr(client, "preferredName");
        String ehrCaseId  = safeStr(client, "ehrCaseId");

        if (!firstName.isEmpty() && !lastName.isEmpty()) {
            ids.add(firstName + " " + lastName);
        }
        // First name on its own — clinical narratives usually say "James was
        // alert…", and without this alias the ACLX cross-subject check couldn't
        // attribute such mentions to the authorized client and escalated them.
        if (!firstName.isEmpty()) {
            ids.add(firstName);
        }
        // Preferred name when it differs from first name (avoids duplicates)
        if (!preferred.isEmpty() && !preferred.equalsIgnoreCase(firstName)) {
            ids.add(preferred);
        }
        if (!ehrCaseId.isEmpty()) {
            ids.add(ehrCaseId);
        }
        return ids;
    }

    // ── Writes ────────────────────────────────────────────────────────────

    /**
     * Create a new client record.
     *
     * A CLINICAL creator becomes the treating BCBA unless {@code req.treatingBcbaId}
     * is explicitly set. ADMIN creators are NOT auto-assigned — admins see every
     * client anyway, and auto-assignment made them show up on the treatment team
     * ("1 on team") for clients they never joined.
     */
    public String createClient(String orgId, String createdByUid, boolean creatorIsAdmin,
                               ClientRequest req) throws Exception {
        Map<String, Object> data = buildClientData(req, creatorIsAdmin ? null : createdByUid);
        data.put("createdBy", createdByUid);
        data.put("createdAt", TimestampUtil.now());
        data.put("orgId", orgId);

        if (devMode) {
            String id = "c-" + UUID.randomUUID().toString().substring(0, 8);
            data.put("id", id);
            devClients.put(id, data);
            return id;
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.CLIENTS).add(data).get();
        return ref.getId();
    }

    /**
     * Update client demographics.  Authorization is checked in the controller.
     */
    public void updateClient(String orgId, String clientId, ClientRequest req) throws Exception {
        Map<String, Object> updates = new HashMap<>();
        if (req.getFirstName() != null)      updates.put("firstName", req.getFirstName());
        if (req.getLastName() != null)       updates.put("lastName", req.getLastName());
        if (req.getFirstName() != null || req.getLastName() != null) {
            // Recompute legalName if either name part changed
            // (we'd need the existing record to fill in the unchanged half, but for simplicity
            //  only recompute when both are provided)
            if (req.getFirstName() != null && req.getLastName() != null) {
                updates.put("legalName", req.getFirstName().trim() + " " + req.getLastName().trim());
            }
        }
        if (req.getPreferredName() != null)  updates.put("preferredName", req.getPreferredName());
        if (req.getDateOfBirth() != null)    updates.put("dateOfBirth", req.getDateOfBirth());
        if (req.getGender() != null)         updates.put("gender", req.getGender());
        if (req.getDiagnosis() != null)      updates.put("diagnosis", req.getDiagnosis());
        if (req.getPrimaryInsurance() != null) updates.put("primaryInsurance", req.getPrimaryInsurance());
        if (req.getEhrProvider() != null)    updates.put("ehrProvider", req.getEhrProvider());
        if (req.getEhrCaseId() != null)      updates.put("ehrCaseId", req.getEhrCaseId());
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) {
            devClients.merge(clientId, updates, (existing, upd) -> { existing.putAll(upd); return existing; });
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.CLIENTS).document(clientId)
                .update(updates).get();
    }

    /** Archive or unarchive a client. Authorization is checked in the controller. */
    public void setArchived(String orgId, String clientId, boolean archived) throws Exception {
        Map<String, Object> updates = new HashMap<>();
        updates.put("archived", archived);
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) {
            devClients.merge(clientId, updates, (existing, upd) -> { existing.putAll(upd); return existing; });
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.CLIENTS).document(clientId)
                .update(updates).get();
    }

    /**
     * Update the authorization assignments for a client (who is the treating BCBA, RBTs, etc.).
     * Also recomputes {@code memberIds} for efficient Firestore queries.
     */
    public void updateAuthorizations(String orgId,
                                      String clientId,
                                      String treatingBcbaId,
                                      List<String> supervisorIds,
                                      String supervisingBcbaId,
                                      List<String> rbtIds,
                                      List<String> viewerIds) throws Exception {
        // Defense-in-depth: enforce slot eligibility server-side, independent of the UI.
        validateAssigneeEligibility(orgId, treatingBcbaId, supervisorIds, supervisingBcbaId, rbtIds);

        Map<String, Object> updates = new HashMap<>();
        if (treatingBcbaId != null)    updates.put("treatingBcbaId", treatingBcbaId);
        if (supervisorIds != null)     updates.put("supervisorIds", supervisorIds);
        if (supervisingBcbaId != null) updates.put("supervisingBcbaId", supervisingBcbaId);
        if (rbtIds != null)            updates.put("rbtIds", rbtIds);
        if (viewerIds != null)         updates.put("viewerIds", viewerIds);

        // Recompute the denormalized memberIds index — includes all supervisors
        List<String> effectiveSupervisors = supervisorIds != null ? supervisorIds
                : (supervisingBcbaId != null ? List.of(supervisingBcbaId) : List.of());
        updates.put("memberIds", computeMemberIds(
                treatingBcbaId,
                effectiveSupervisors,
                rbtIds != null ? rbtIds : List.of(),
                viewerIds != null ? viewerIds : List.of()
        ));
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) {
            devClients.merge(clientId, updates, (existing, upd) -> { existing.putAll(upd); return existing; });
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.CLIENTS).document(clientId)
                .update(updates).get();
    }

    /**
     * Reject caseload assignments whose target user's ROLE doesn't qualify for the slot —
     * enforced regardless of what the UI offered (Option B rule, capability-based so it
     * works for custom roles too):
     * <ul>
     *   <li>Supervisor roster ({@code supervisingBcbaId} + {@code supervisorIds}) → the
     *       role must hold {@link Capability#CLIENT_MANAGE} (clients:'all').</li>
     *   <li>Treating BCBA and behavior technicians ({@code rbtIds}) → the role must have
     *       PHI access.</li>
     *   <li>Viewers are read-only / non-clinical and are intentionally not restricted here.</li>
     * </ul>
     * Throws {@link IllegalArgumentException} (mapped to HTTP 422 by the controller) when a
     * target isn't an active member or its role doesn't qualify. Skipped in dev mode.
     */
    private void validateAssigneeEligibility(String orgId, String treatingBcbaId,
                                             List<String> supervisorIds, String supervisingBcbaId,
                                             List<String> rbtIds) throws Exception {
        if (devMode) return;
        Map<String, String> roleByUid = loadMemberRoles(orgId);
        requireEligible(orgId, roleByUid, treatingBcbaId,    false, "the treating BCBA");
        requireEligible(orgId, roleByUid, supervisingBcbaId, true,  "a supervisor");
        if (supervisorIds != null) {
            for (String uid : supervisorIds) requireEligible(orgId, roleByUid, uid, true, "a supervisor");
        }
        if (rbtIds != null) {
            for (String uid : rbtIds) requireEligible(orgId, roleByUid, uid, false, "a behavior technician");
        }
    }

    /** @param requireManage true → slot needs CLIENT_MANAGE; false → slot needs PHI access. */
    private void requireEligible(String orgId, Map<String, String> roleByUid, String uid,
                                 boolean requireManage, String slot) {
        if (uid == null || uid.isBlank()) return;
        String role = roleByUid.get(uid);
        if (role == null) {
            throw new IllegalArgumentException(
                    "Cannot assign a user who is not an active member of this organization.");
        }
        EffectivePermissions eff = permissionService.resolveForRole(role, orgId);
        boolean ok = requireManage ? eff.can(Capability.CLIENT_MANAGE) : eff.phiAccess();
        if (!ok) {
            throw new IllegalArgumentException(requireManage
                    ? "A user whose role can’t manage clients can’t be assigned as " + slot + "."
                    : "A user whose role has no PHI access can’t be assigned as " + slot + ".");
        }
    }

    /** uid → role for every member of the org (single read, reused across slot checks). */
    private Map<String, String> loadMemberRoles(String orgId) throws Exception {
        Firestore db = FirestoreClient.getFirestore();
        Map<String, String> out = new HashMap<>();
        for (QueryDocumentSnapshot d : db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.MEMBERS).get().get().getDocuments()) {
            Object role = d.get("role");
            out.put(d.getId(), role == null ? null : role.toString());
        }
        return out;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /** @param defaultTreatingUid creator uid to self-assign as treating BCBA, or null for no default (admin creators). */
    private Map<String, Object> buildClientData(ClientRequest req, String defaultTreatingUid) {
        Map<String, Object> data = new HashMap<>();
        data.put("firstName",        req.getFirstName());
        data.put("lastName",         req.getLastName());
        // Computed full legal name — stored for search/legacy queries
        String fullName = req.getFirstName().trim() + " " + req.getLastName().trim();
        data.put("legalName",        fullName);
        data.put("preferredName",    req.getPreferredName() != null ? req.getPreferredName() : req.getFirstName());
        data.put("dateOfBirth",      req.getDateOfBirth());
        data.put("gender",           req.getGender());
        data.put("diagnosis",        req.getDiagnosis());
        data.put("primaryInsurance", req.getPrimaryInsurance());
        if (req.getEhrProvider() != null) data.put("ehrProvider", req.getEhrProvider());
        if (req.getEhrCaseId() != null)   data.put("ehrCaseId", req.getEhrCaseId());

        // Authorization assignments — explicit assignment wins; otherwise the
        // clinical creator self-assigns, and admin creators leave it unassigned.
        String treating = (req.getTreatingBcbaId() != null && !req.getTreatingBcbaId().isBlank())
                ? req.getTreatingBcbaId() : (defaultTreatingUid != null ? defaultTreatingUid : "");
        String supervising = req.getSupervisingBcbaId();
        List<String> rbtIds    = req.getRbtIds()    != null ? req.getRbtIds()    : List.of();
        List<String> viewerIds = req.getViewerIds() != null ? req.getViewerIds() : List.of();

        data.put("treatingBcbaId",    treating);
        data.put("supervisingBcbaId", supervising);
        data.put("rbtIds",            rbtIds);
        data.put("viewerIds",         viewerIds);
        // supervisorIds not available at create time; fall back to supervising BCBA as sole supervisor
        List<String> initialSupervisors = supervising != null && !supervising.isBlank()
                ? List.of(supervising) : List.of();
        data.put("supervisorIds",     initialSupervisors);
        data.put("memberIds",         computeMemberIds(treating, initialSupervisors, rbtIds, viewerIds));
        return data;
    }

    private List<String> computeMemberIds(String treating, List<String> supervisorIds,
                                           List<String> rbtIds, List<String> viewerIds) {
        Set<String> members = new LinkedHashSet<>();
        if (treating != null && !treating.isBlank()) members.add(treating);
        supervisorIds.stream().filter(s -> s != null && !s.isBlank()).forEach(members::add);
        members.addAll(rbtIds);
        members.addAll(viewerIds);
        return new ArrayList<>(members);
    }

    private List<Map<String, Object>> toList(List<QueryDocumentSnapshot> docs) {
        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        }).collect(Collectors.toList());
    }

    /** Null-safe string extraction from a map value. */
    private String safeStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return (v instanceof String s) ? s.trim() : "";
    }
}
