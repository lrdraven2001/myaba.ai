package ai.myaba.service;

import ai.myaba.model.dto.OrgRequest;
import ai.myaba.model.dto.UserRole;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Organization lifecycle service.
 *
 * Firestore paths:
 *   organizations/{orgId}
 *   organizations/{orgId}/members/{uid}
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

    private final Map<String, Map<String, Object>>        devOrgs       = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>>        devTokens     = new ConcurrentHashMap<>();
    /** orgId → list of member maps (dev mode only) */
    private final Map<String, List<Map<String, Object>>> devOrgMembers = new ConcurrentHashMap<>();

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
        Map<String, Object> settings = new HashMap<>();
        settings.put("sessionTimeoutMinutes", 15);
        settings.put("mfaRequired",    false);
        settings.put("reviewRequired", true);
        settings.put("aclxEnabled",    true);
        settings.put("hipaaMode",      true);
        settings.put("aiAudit",        true);
        org.put("settings", settings);
        org.put("insuranceCompanies", new ArrayList<>(List.of(
            "Aetna", "Anthem / BCBS", "BlueCross BlueShield", "Cigna", "Humana",
            "Kaiser Permanente", "Medicaid", "Medicare", "Molina Healthcare",
            "United Healthcare", "UnitedHealthcare", "WellCare"
        )));
        devOrgs.put("dev-org-001", org);

        // Dev org starts with only the admin — no seeded members
        devOrgMembers.put("dev-org-001", new ArrayList<>());

        log.info("Dev mode: seeded org dev-org-001");
    }

    private Map<String, Object> devMember(String uid, String displayName, String email,
                                          String role, String purpose, boolean active,
                                          String supervisorId) {
        Map<String, Object> m = new HashMap<>();
        m.put("id",          uid);
        m.put("displayName", displayName);
        m.put("email",       email);
        m.put("role",        role);
        m.put("purpose",     purpose);
        m.put("active",      active);
        if (supervisorId != null) m.put("supervisorId", supervisorId);
        return m;
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

    /**
     * Returns the list of member records for the given org.
     * Dev mode: returns the seeded stub members.
     * Production: reads the {@code organizations/{orgId}/members} subcollection.
     * Members are written there when they create or join an org via invite.
     */
    public List<Map<String, Object>> getOrgMembers(String orgId) throws Exception {
        if (devMode) {
            return new ArrayList<>(devOrgMembers.getOrDefault(orgId, List.of()));
        }
        Firestore db = FirestoreClient.getFirestore();
        List<QueryDocumentSnapshot> docs = db
                .collection("organizations").document(orgId)
                .collection("members").get().get().getDocuments();
        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId()); // uid is the document ID
            return m;
        }).collect(Collectors.toList());
    }

    /**
     * Assigns or clears the supervisor for a member (RBT → Clinical Supervisor relationship).
     * Dev mode: updates the in-memory member record.
     * Production: updates the Firebase custom claim {@code supervisorId} on the user.
     *
     * @param orgId        the organisation
     * @param uid          the member whose supervisor is being set (usually an RBT)
     * @param supervisorId the supervisor's UID, or {@code null} to clear the relationship
     */
    public void setSupervisor(String orgId, String uid, String supervisorId) throws Exception {
        if (devMode) {
            List<Map<String, Object>> members = devOrgMembers.get(orgId);
            if (members == null) throw new NoSuchElementException("Org not found: " + orgId);
            boolean found = false;
            for (Map<String, Object> m : members) {
                if (uid.equals(m.get("id"))) {
                    if (supervisorId != null && !supervisorId.isBlank()) {
                        m.put("supervisorId", supervisorId);
                    } else {
                        m.remove("supervisorId");
                    }
                    found = true;
                    break;
                }
            }
            if (!found) throw new NoSuchElementException("Member not found: " + uid);
            return;
        }
        // Production: set Firebase custom claim + update Firestore member record
        Map<String, Object> claims = new HashMap<>();
        claims.put("supervisorId", supervisorId != null && !supervisorId.isBlank() ? supervisorId : null);
        FirebaseAuth.getInstance().setCustomUserClaims(uid, claims);

        Firestore db = FirestoreClient.getFirestore();
        Map<String, Object> memberUpdate = new HashMap<>();
        memberUpdate.put("supervisorId", supervisorId != null && !supervisorId.isBlank() ? supervisorId : null);
        try {
            db.collection("organizations").document(orgId)
              .collection("members").document(uid)
              .update(memberUpdate);
        } catch (Exception e) {
            log.warn("setSupervisor: could not update Firestore member record for {}: {}", uid, e.getMessage());
        }
    }

    // ── Governance helpers ─────────────────────────────────────────────────────

    /**
     * Returns true when the org requires human review before ESCALATE content is released.
     * Defaults to {@code true} (safe) when the setting is absent.
     */
    @SuppressWarnings("unchecked")
    public boolean isReviewRequired(String orgId) {
        try {
            Map<String, Object> org = getOrg(orgId);
            Object settings = org.get("settings");
            if (settings instanceof Map<?,?> m) {
                Object val = m.get("reviewRequired");
                if (val instanceof Boolean b) return b;
            }
        } catch (Exception e) {
            log.warn("isReviewRequired: failed to read org {}, defaulting true: {}", orgId, e.getMessage());
        }
        return true; // safe default
    }

    // ── Create org ────────────────────────────────────────────────────────────

    /**
     * Create a new organization.
     * <p>
     * Two setup modes (controlled by {@link OrgRequest#getSetupMode()}):
     * <ul>
     *   <li>{@code clinical_director} (default) — org creator is the Clinical Director.
     *       They are assigned {@code CLINICAL_DIRECTOR} role with full PHI access.
     *       The BAA must still be signed in the next onboarding step; until then
     *       {@code baaAccepted} is {@code false} on the org doc.</li>
     *   <li>{@code it_setup} — an IT administrator is standing up the org on behalf
     *       of the Clinical Director. Creator gets {@code ORG_ADMIN} (no PHI access).
     *       {@code baaAccepted} stays {@code false} and PHI features are locked until
     *       a {@code CLINICAL_DIRECTOR} user signs the BAA.</li>
     * </ul>
     *
     * @return new orgId
     */
    public String createOrg(String adminUid, OrgRequest req) throws Exception {
        String orgId  = "org-" + UUID.randomUUID().toString().substring(0, 8);
        String now    = Instant.now().toString();

        boolean itSetup = "it_setup".equals(req.getSetupMode());
        String creatorRole = itSetup ? UserRole.ORG_ADMIN : UserRole.CLINICAL_DIRECTOR;

        Map<String, Object> data = new HashMap<>();
        data.put("id",          orgId);
        data.put("name",        req.getName());
        data.put("plan",        req.getPlan());
        data.put("adminUid",    adminUid);
        data.put("setupMode",   itSetup ? "it_setup" : "clinical_director");
        data.put("baaAccepted", false);   // set to true in acceptBaa()
        data.put("createdAt",   now);
        data.put("settings",    Map.of("sessionTimeoutMinutes", 15, "mfaRequired", false));

        if (devMode) {
            devOrgs.put(orgId, data);
            log.info("Dev: created org {} (mode={}) for user {}", orgId, data.get("setupMode"), adminUid);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId).set(data).get();
            setUserClaims(adminUid, orgId, creatorRole, "oversight");
            writeMemberRecord(db, orgId, adminUid, creatorRole, "oversight");
        }
        return orgId;
    }

    /**
     * Returns true when the org's BAA has been accepted (i.e. PHI features are enabled).
     * Falls back to {@code true} if the field is absent (pre-BAA-gate legacy orgs).
     */
    public boolean isBaaAccepted(String orgId) {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) return true; // dev mode: always allow
            Object v = org.get("baaAccepted");
            return v == null || Boolean.TRUE.equals(v); // absent = legacy = allowed
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            var snap = db.collection("organizations").document(orgId).get().get();
            if (!snap.exists()) return false;
            Object v = snap.getData().get("baaAccepted");
            return v == null || Boolean.TRUE.equals(v);
        } catch (Exception e) {
            log.warn("Could not read baaAccepted for org {}: {}", orgId, e.getMessage());
            return true; // fail-open on read error (don't lock out existing users)
        }
    }

    // ── Org name ──────────────────────────────────────────────────────────────

    public void updateOrgName(String orgId, String name) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            org.put("name", name);
            org.put("updatedAt", Instant.now().toString());
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection("organizations").document(orgId)
          .update(Map.of("name", name, "updatedAt", Instant.now().toString())).get();
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

    // ── Insurance companies ───────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<String> getInsuranceCompanies(String orgId) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            Object list = org.get("insuranceCompanies");
            return list instanceof List ? new ArrayList<>((List<String>) list) : new ArrayList<>();
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection("organizations").document(orgId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Org not found: " + orgId);
        Object list = snap.getData().get("insuranceCompanies");
        return list instanceof List ? new ArrayList<>((List<String>) list) : new ArrayList<>();
    }

    public void setInsuranceCompanies(String orgId, List<String> companies) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            org.put("insuranceCompanies", new ArrayList<>(companies));
            org.put("updatedAt", Instant.now().toString());
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection("organizations").document(orgId)
          .update(Map.of(
              "insuranceCompanies", companies,
              "updatedAt", Instant.now().toString()
          )).get();
    }

    // ── Business Associate Agreement (BAA) ───────────────────────────────────

    /**
     * Returns the org's BAA acceptance record, or {@code { "accepted": false }}
     * if the BAA has not yet been signed.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getBaaStatus(String orgId) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            Object baa = org.get("baaAcceptance");
            return baa instanceof Map<?,?> m ? new HashMap<>((Map<String, Object>) m) : Map.of("accepted", false);
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection("organizations").document(orgId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Org not found: " + orgId);
        Object baa = snap.getData().get("baaAcceptance");
        return baa instanceof Map<?,?> m
                ? new HashMap<>((Map<String, Object>) m)
                : Map.of("accepted", false);
    }

    /**
     * Record BAA acceptance for the org.
     * Writes {@code baaAcceptance} into the org document and returns the
     * acceptance record.
     *
     * @param orgId       target organisation
     * @param uid         UID of the user accepting on behalf of the org
     * @param signerName  legal name of the individual signing
     * @param signerTitle title of the individual signing (e.g. "Executive Director")
     */
    public Map<String, Object> acceptBaa(String orgId, String uid,
                                         String signerName, String signerTitle) throws Exception {
        String now = Instant.now().toString();
        Map<String, Object> baaRecord = new HashMap<>();
        baaRecord.put("accepted",    true);
        baaRecord.put("acceptedAt",  now);
        baaRecord.put("acceptedBy",  uid);
        baaRecord.put("signerName",  signerName);
        baaRecord.put("signerTitle", signerTitle);
        baaRecord.put("version",     "1.1");

        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            org.put("baaAcceptance", baaRecord);
            org.put("baaAccepted",   true);
            org.put("updatedAt",     now);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .update(Map.of(
                  "baaAcceptance", baaRecord,
                  "baaAccepted",   true,
                  "updatedAt",     now
              )).get();

            // If the signer is currently ORG_ADMIN (IT-setup flow), promote them to
            // CLINICAL_DIRECTOR now that they are taking clinical responsibility by signing.
            promoteToClinicaDirectorIfNeeded(uid, orgId);
        }
        log.info("BAA v1.1 accepted for org {} by {} (uid={})", orgId, signerName, uid);
        return baaRecord;
    }

    /**
     * If the given user currently holds ORG_ADMIN in this org, upgrade their Firebase
     * custom claims and member record to CLINICAL_DIRECTOR.  Safe to call when the
     * signer already has CLINICAL_DIRECTOR or higher — those cases are skipped.
     */
    private void promoteToClinicaDirectorIfNeeded(String uid, String orgId) {
        try {
            Firestore db = FirestoreClient.getFirestore();
            var memberSnap = db.collection("organizations").document(orgId)
                    .collection("members").document(uid).get().get();
            if (!memberSnap.exists()) return;
            String currentRole = (String) memberSnap.getData().getOrDefault("role", "");
            if (!UserRole.ORG_ADMIN.equals(currentRole)) return; // already CLINICAL_DIRECTOR or higher
            setUserClaims(uid, orgId, UserRole.CLINICAL_DIRECTOR, "oversight");
            db.collection("organizations").document(orgId)
              .collection("members").document(uid)
              .update(Map.of("role", UserRole.CLINICAL_DIRECTOR,
                             "updatedAt", Instant.now().toString())).get();
            log.info("Promoted user {} from ORG_ADMIN to CLINICAL_DIRECTOR after BAA sign (org={})", uid, orgId);
        } catch (Exception e) {
            log.warn("Could not promote user {} to CLINICAL_DIRECTOR: {}", uid, e.getMessage());
        }
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
            String purpose = defaultPurpose(role);
            setUserClaims(claimingUid, orgId, role, purpose);

            // Mark token as used and write the new member record
            Firestore db = FirestoreClient.getFirestore();
            db.collection("organizations").document(orgId)
              .collection("inviteTokens").document(token)
              .update(Map.of("usedBy", claimingUid, "usedAt", Instant.now().toString())).get();
            writeMemberRecord(db, orgId, claimingUid, role, purpose);
        }
        data.put("usedBy", claimingUid);
        data.put("usedAt", Instant.now().toString());
        if (devMode) devTokens.put(token, data);
    }

    // ── Member record helpers ─────────────────────────────────────────────────

    /**
     * Write (or overwrite) a member record in the
     * {@code organizations/{orgId}/members/{uid}} subcollection.
     * Fetches the user's display name and email from Firebase Auth so the
     * Team view can render them without a separate Auth lookup.
     * Called from {@link #createOrg}, {@link #claimInviteToken}.
     */
    private void writeMemberRecord(Firestore db, String orgId,
                                   String uid, String role, String purpose) {
        try {
            UserRecord record = FirebaseAuth.getInstance().getUser(uid);
            String email       = record.getEmail() != null ? record.getEmail() : "";
            String displayName = record.getDisplayName() != null && !record.getDisplayName().isBlank()
                    ? record.getDisplayName()
                    : email;

            Map<String, Object> member = new HashMap<>();
            member.put("uid",         uid);
            member.put("email",       email);
            member.put("displayName", displayName);
            member.put("role",        role);
            member.put("purpose",     purpose);
            member.put("active",      true);
            member.put("joinedAt",    Instant.now().toString());

            db.collection("organizations").document(orgId)
              .collection("members").document(uid).set(member).get();
            log.info("Wrote member record uid={} org={} role={}", uid, orgId, role);
        } catch (Exception e) {
            log.error("writeMemberRecord failed uid={} org={}: {}", uid, orgId, e.getMessage());
        }
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
            claims.put("orgId",     orgId);
            claims.put("role",      role);
            claims.put("purpose",   purpose);
            // Explicit PHI-access capability claim — lets downstream code gate on a boolean
            // instead of knowing every possible role name (critical for custom org roles).
            claims.put("phiAccess", UserRole.hasPhiAccess(role));
            FirebaseAuth.getInstance().setCustomUserClaims(uid, claims);
        } catch (Exception e) {
            log.error("Failed to set custom claims for user {}: {}", uid, e.getMessage());
            throw new RuntimeException("Failed to update user role", e);
        }
    }

    private String defaultPurpose(String role) {
        return switch (role) {
            case UserRole.TREATING_BCBA, UserRole.SUPERVISING_BCBA,
                 UserRole.BCBA_STUDENT, UserRole.RBT,
                 UserRole.CLINICAL_DIRECTOR               -> "treatment";
            case UserRole.SCHEDULING_ADMIN                -> "scheduling";
            case UserRole.BILLING_ADMIN                   -> "payment";
            case UserRole.ORG_ADMIN, UserRole.ORG_SUPER_ADMIN -> "oversight";
            default                                        -> "treatment";
        };
    }
}
