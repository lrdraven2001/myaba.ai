package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

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
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
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

    @org.springframework.beans.factory.annotation.Autowired
    private AuditService auditService;

    @org.springframework.beans.factory.annotation.Autowired
    private ai.myaba.security.PermissionService permissionService;

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.context.ApplicationEventPublisher eventPublisher;

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
        settings.put("mfaEnforced",    false);
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
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
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
        List<Map<String, Object>> members;
        if (devMode) {
            members = new ArrayList<>(devOrgMembers.getOrDefault(orgId, List.of()));
        } else {
            Firestore db = FirestoreClient.getFirestore();
            List<QueryDocumentSnapshot> docs = db
                    .collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection(FirestoreCollections.MEMBERS).get().get().getDocuments();
            members = docs.stream().map(d -> {
                Map<String, Object> m = new HashMap<>(d.getData());
                m.put("id", d.getId()); // uid is the document ID
                return m;
            }).collect(Collectors.toList());
        }
        // Surface each member's RESOLVED role capabilities so client-assignment pickers can
        // gate by capability rather than a hardcoded built-in role-name list — this is what
        // makes custom-role users assignable. phiAccess → Behavior-Technician slot eligibility;
        // canManageClients (CLIENT_MANAGE / clients:'all') → Supervisor slot eligibility.
        for (Map<String, Object> m : members) {
            Object role = m.get("role");
            try {
                var eff = permissionService.resolveForRole(role == null ? null : role.toString(), orgId);
                m.put("phiAccess",        eff.phiAccess());
                m.put("canManageClients", eff.can(ai.myaba.security.Capability.CLIENT_MANAGE));
            } catch (Exception e) {
                m.put("phiAccess",        false);
                m.put("canManageClients", false);
            }
            m.putIfAbsent("aiTier", "full"); // AI seat tier; pre-feature members default to full
        }
        return members;
    }

    /**
     * Billable seat count for an org = number of ACTIVE members (min 1). Drives the
     * per-seat Stripe checkout quantity and the per-seat usage cap. A member counts
     * as active unless its {@code active} field is explicitly false.
     */
    public int seatCount(String orgId) {
        try {
            long active = getOrgMembers(orgId).stream()
                    .filter(m -> !Boolean.FALSE.equals(m.get("active")))
                    .count();
            return (int) Math.max(1L, active);
        } catch (Exception e) {
            log.warn("seatCount failed for org {} — defaulting to 1 seat: {}", orgId, e.getMessage());
            return 1;
        }
    }

    /** Active seat counts split by AI tier (full vs lite). Drives per-tier Stripe billing. */
    public record SeatCounts(int full, int lite) {
        public int total() { return full + lite; }
    }

    /** Count ACTIVE members by AI seat tier (default "full"). Never throws — falls back to 1 full. */
    public SeatCounts seatCounts(String orgId) {
        try {
            int full = 0, lite = 0;
            for (Map<String, Object> m : getOrgMembers(orgId)) {
                if (Boolean.FALSE.equals(m.get("active"))) continue;
                if ("lite".equalsIgnoreCase(String.valueOf(m.getOrDefault("aiTier", "full")))) lite++;
                else full++;
            }
            if (full + lite == 0) full = 1; // an org always has at least its admin
            return new SeatCounts(full, lite);
        } catch (Exception e) {
            log.warn("seatCounts failed for org {} — defaulting to 1 full seat: {}", orgId, e.getMessage());
            return new SeatCounts(1, 0);
        }
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
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
              .collection(FirestoreCollections.MEMBERS).document(uid)
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

    /**
     * ACLX report-only mode (Pathfinder feedback gathering): ESCALATE decisions
     * deliver the content and are logged for reviewer feedback instead of being
     * withheld. BLOCK decisions are NOT affected — hard blocks (statutory
     * authorization gaps, security violations, fail-safes) always enforce.
     * Defaults to false (full enforcement) and fails closed on read errors.
     */
    public boolean isAclxReportOnly(String orgId) {
        try {
            Map<String, Object> org = getOrg(orgId);
            Object settings = org.get("settings");
            if (settings instanceof Map<?,?> m) {
                Object val = m.get("aclxReportOnly");
                if (val instanceof Boolean b) return b;
            }
        } catch (Exception e) {
            log.warn("isAclxReportOnly: failed to read org {}, defaulting false: {}", orgId, e.getMessage());
        }
        return false; // fail closed — enforce
    }

    /** Whether the org wants client preferred/display names enforced in generated output. */
    public boolean isPreferClientDisplayName(String orgId) {
        try {
            Map<String, Object> org = getOrg(orgId);
            Object settings = org.get("settings");
            if (settings instanceof Map<?,?> m && m.get("preferClientDisplayName") instanceof Boolean b) return b;
        } catch (Exception e) {
            log.warn("isPreferClientDisplayName: failed to read org {}: {}", orgId, e.getMessage());
        }
        return false; // default off — opt-in
    }

    /**
     * Whether the org enforces first+last INITIALS only for client names in chats and chat
     * labels (a stronger de-identification than preferred names — takes precedence over it).
     */
    public boolean isClientInitialsOnly(String orgId) {
        try {
            Map<String, Object> org = getOrg(orgId);
            Object settings = org.get("settings");
            if (settings instanceof Map<?,?> m && m.get("clientInitialsOnly") instanceof Boolean b) return b;
        } catch (Exception e) {
            log.warn("isClientInitialsOnly: failed to read org {}: {}", orgId, e.getMessage());
        }
        return false; // default off — opt-in
    }

    /** Whether the org refers to guardians by their relationship label (e.g. "Mother") in chats + documents. */
    public boolean isGuardianRelationshipLabels(String orgId) {
        try {
            Map<String, Object> org = getOrg(orgId);
            Object settings = org.get("settings");
            if (settings instanceof Map<?,?> m && m.get("guardianRelationshipLabels") instanceof Boolean b) return b;
        } catch (Exception e) {
            log.warn("isGuardianRelationshipLabels: failed to read org {}: {}", orgId, e.getMessage());
        }
        return false; // default off — opt-in
    }

    /**
     * Build the org's COMMUNICATION STYLE prompt block from its explicit style
     * profile ({@code settings.styleProfile}), or "" when none is set. Style shapes
     * wording and format only — it must never override clinical accuracy or
     * compliance. See docs/design/communication-style-learning.md (Phase 1).
     */
    public String buildStyleProfilePrompt(String orgId) {
        return buildStyleProfilePrompt(orgId, "chat");
    }

    /**
     * Surface-aware style block. {@code surface} is "chat" or "document". Formal
     * clinical documents ignore a "Warm" tone preference (per product decision):
     * signable documentation stays professional and ABA-first regardless of the
     * org's conversational tone.
     */
    @SuppressWarnings("unchecked")
    public String buildStyleProfilePrompt(String orgId, String surface) {
        Map<String, Object> p;
        try {
            Object settings = getOrg(orgId).get("settings");
            if (!(settings instanceof Map<?, ?> s) || !(s.get("styleProfile") instanceof Map<?, ?> sp)) return "";
            p = (Map<String, Object>) sp;
        } catch (Exception e) {
            return "";
        }
        boolean isDocument = "document".equalsIgnoreCase(surface);
        StringBuilder sb = new StringBuilder();
        String tone   = str(p.get("tone"));
        // Documents ignore a warm/casual tone — they remain formal and ABA-first.
        if (isDocument && tone.equalsIgnoreCase("Warm")) tone = "";
        String length = str(p.get("length"));
        boolean bullets = Boolean.TRUE.equals(p.get("bullets"));
        boolean headings = Boolean.TRUE.equals(p.get("headings"));
        boolean tablesForData = Boolean.TRUE.equals(p.get("tablesForData"));
        String freeform = str(p.get("freeform"));
        List<String> terminology = p.get("terminology") instanceof List<?> l
                ? l.stream().map(String::valueOf).filter(x -> !x.isBlank()).toList() : List.of();

        if (tone.isBlank() && length.isBlank() && !bullets && !headings && !tablesForData
                && freeform.isBlank() && terminology.isEmpty()) {
            return "";
        }
        sb.append("\nCOMMUNICATION STYLE (organization preferences — apply to the wording and ")
          .append("format of your response. These are stylistic only: never sacrifice clinical ")
          .append("accuracy, completeness, or compliance to satisfy them):\n");
        if (!tone.isBlank())   sb.append("- Preferred tone: ").append(tone).append("\n");
        if (!length.isBlank()) sb.append("- Default length: ").append(length).append("\n");
        if (bullets)  sb.append("- Prefer bullet points for lists and multi-part content.\n");
        if (headings) sb.append("- Use clear section headings to organize longer responses.\n");
        if (tablesForData) sb.append("- Present tabular/quantitative data as tables.\n");
        for (String t : terminology) sb.append("- Terminology: ").append(t).append("\n");
        if (!freeform.isBlank()) sb.append("- ").append(freeform.trim()).append("\n");
        return sb.toString();
    }

    private static String str(Object o) { return o == null ? "" : o.toString().trim(); }

    /** Mutable copy of the org's styleProfile map ({@code settings.styleProfile}), or empty. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getStyleProfileMap(String orgId) {
        try {
            Object settings = getOrg(orgId).get("settings");
            if (settings instanceof Map<?, ?> s && s.get("styleProfile") instanceof Map<?, ?> sp) {
                return new HashMap<>((Map<String, Object>) sp);
            }
        } catch (Exception e) {
            log.warn("getStyleProfileMap failed for org {}: {}", orgId, e.getMessage());
        }
        return new HashMap<>();
    }

    /** Persist the styleProfile map (merges under {@code settings.styleProfile}). */
    public void updateStyleProfile(String orgId, Map<String, Object> profile) throws Exception {
        updateOrgSettings(orgId, Map.of("styleProfile", profile));
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
    public String createOrg(String adminUid, String adminEmail, OrgRequest req) throws Exception {
        // Pathfinder gate (defense in depth — the controller also checks): only
        // vendor-approved emails may provision an org. Never reach Firestore writes
        // for an unapproved caller.
        if (!isApprovedOrgCreator(adminEmail)) {
            throw new SecurityException("Account not approved to create an organization: " + adminEmail);
        }

        String orgId  = "org-" + UUID.randomUUID().toString().substring(0, 8);
        String now    = TimestampUtil.now();

        boolean itSetup = "it_setup".equals(req.getSetupMode());
        // The starting user is ALWAYS the Practice Administrator (super admin) — the
        // org owner with full permissions who signs the BAA. (setupMode still controls
        // whether the BAA is signed now or deferred, but not the role.)
        String creatorRole = UserRole.ORG_SUPER_ADMIN;

        Map<String, Object> data = new HashMap<>();
        data.put("id",          orgId);
        data.put("name",        req.getName());
        data.put("plan",        req.getPlan());
        data.put("adminUid",    adminUid);
        data.put("setupMode",   itSetup ? "it_setup" : "clinical_director");
        data.put("baaAccepted", false);   // set to true in acceptBaa()
        data.put("createdAt",   now);
        // Seed 7-year (2555-day) retention so the Security tab's displayed default matches
        // actual auto-purge behavior. Existing orgs without the field are unaffected.
        data.put("settings",    Map.of("sessionTimeoutMinutes", 15, "mfaEnforced", false, "retentionDays", 2555));

        if (devMode) {
            devOrgs.put(orgId, data);
            log.info("Dev: created org {} (mode={}) for user {}", orgId, data.get("setupMode"), adminUid);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).set(data).get();
            String creatorPurpose = defaultPurpose(creatorRole);   // treatment — the admin is the clinical lead
            setUserClaims(adminUid, orgId, creatorRole, creatorPurpose);
            writeMemberRecord(db, orgId, adminUid, creatorRole, creatorPurpose);
            markOrgCreatorUsed(adminEmail, adminUid, orgId); // consume the approval — one org per approved email
        }
        return orgId;
    }

    // ── Pathfinder org-creation allowlist ──────────────────────────────────────
    // Firestore collection `approvedOrgCreators`, doc id = lowercased email:
    //   { approvedBy, approvedAt, note, used:bool, usedByUid, usedAt, orgId }
    // To approve a customer admin, add a doc with that email id (used defaults false).
    private static final String APPROVED_CREATORS = "approvedOrgCreators";

    /**
     * Returns true only when {@code email} is on the vendor allowlist and has not
     * already been used to create an org. Dev mode is open. Fails CLOSED on any
     * lookup error — a check failure must never let an unapproved user provision.
     */
    public boolean isApprovedOrgCreator(String email) {
        if (devMode) return true;
        if (email == null || email.isBlank()) return false;
        try {
            Firestore db = FirestoreClient.getFirestore();
            var snap = db.collection(APPROVED_CREATORS)
                    .document(email.trim().toLowerCase()).get().get();
            return snap.exists() && !Boolean.TRUE.equals(snap.getBoolean("used"));
        } catch (Exception e) {
            log.error("isApprovedOrgCreator lookup failed for {}: {}", email, e.getMessage());
            return false; // fail-closed
        }
    }

    /**
     * Lists all Pathfinder allowlist entries (platform-admin console).
     * Each entry: { email, approvedBy, approvedAt, note, used, usedByUid, usedAt, orgId }.
     */
    public List<Map<String, Object>> listApprovedCreators() throws Exception {
        if (devMode) return new ArrayList<>();
        Firestore db = FirestoreClient.getFirestore();
        List<Map<String, Object>> out = new ArrayList<>();
        for (var doc : db.collection(APPROVED_CREATORS).get().get().getDocuments()) {
            Map<String, Object> entry = new HashMap<>(doc.getData());
            entry.put("email", doc.getId());
            out.add(entry);
        }
        out.sort((a, b) -> String.valueOf(b.getOrDefault("approvedAt", ""))
                .compareTo(String.valueOf(a.getOrDefault("approvedAt", ""))));
        return out;
    }

    /**
     * Adds (or re-approves) an email on the Pathfinder allowlist. Re-adding a
     * consumed entry resets {@code used=false} so the same email can provision
     * again — useful after test runs or a botched setup.
     *
     * @throws IllegalArgumentException on a malformed email
     */
    public void addApprovedCreator(String email, String note, String approvedByUid) throws Exception {
        String id = email == null ? "" : email.trim().toLowerCase();
        if (!id.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new IllegalArgumentException("Invalid email address: " + email);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("approvedBy", approvedByUid);
        data.put("approvedAt", TimestampUtil.now());
        data.put("note",       note != null ? note : "");
        data.put("used",       false);
        if (devMode) return;
        Firestore db = FirestoreClient.getFirestore();
        db.collection(APPROVED_CREATORS).document(id).set(data).get();
        log.info("Approved-creator entry added/reset: {} (by {})", id, approvedByUid);
    }

    /** Removes an email from the Pathfinder allowlist. Idempotent. */
    public void revokeApprovedCreator(String email) throws Exception {
        String id = email == null ? "" : email.trim().toLowerCase();
        if (id.isBlank()) throw new IllegalArgumentException("Email is required");
        if (devMode) return;
        Firestore db = FirestoreClient.getFirestore();
        db.collection(APPROVED_CREATORS).document(id).delete().get();
        log.info("Approved-creator entry revoked: {}", id);
    }

    /** Marks an approved-creator entry consumed after a successful org creation. */
    private void markOrgCreatorUsed(String email, String uid, String orgId) {
        if (email == null || email.isBlank()) return;
        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(APPROVED_CREATORS).document(email.trim().toLowerCase())
              .update(Map.of(
                  "used", true,
                  "usedByUid", uid,
                  "usedAt", TimestampUtil.now(),
                  "orgId", orgId));
        } catch (Exception e) {
            log.warn("markOrgCreatorUsed failed for {} (org {} still created): {}", email, orgId, e.getMessage());
        }
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
            var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
            if (!snap.exists()) return false;
            Object v = snap.getData().get("baaAccepted");
            return v == null || Boolean.TRUE.equals(v);
        } catch (Exception e) {
            log.warn("Could not read baaAccepted for org {}: {}", orgId, e.getMessage());
            return true; // fail-open on read error (don't lock out existing users)
        }
    }

    // ── Org name / profile ────────────────────────────────────────────────────

    public void updateOrgName(String orgId, String name) throws Exception {
        updateOrgProfile(orgId, name, null, null);
    }

    /**
     * Update org profile fields. {@code name} is required; {@code city}/{@code state}
     * are optional — pass null to leave unchanged, empty string to clear.
     */
    public void updateOrgProfile(String orgId, String name, String city, String state) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            org.put("name", name);
            if (city  != null) org.put("city",  city.trim());
            if (state != null) org.put("state", state.trim());
            org.put("updatedAt", TimestampUtil.now());
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        Map<String, Object> updates = new HashMap<>();
        updates.put("name", name);
        if (city  != null) updates.put("city",  city.trim());
        if (state != null) updates.put("state", state.trim());
        updates.put("updatedAt", TimestampUtil.now());
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).update(updates).get();
    }

    /**
     * The agency's home locality as "City, State" — used to ground AI responses
     * in the right geography (school districts, payers, community resources).
     * Returns null when the org has no location on file.
     */
    public String getOrgLocality(String orgId) {
        try {
            Map<String, Object> org = getOrg(orgId);
            String city  = org.get("city")  != null ? String.valueOf(org.get("city")).trim()  : "";
            String state = org.get("state") != null ? String.valueOf(org.get("state")).trim() : "";
            if (city.isEmpty() && state.isEmpty()) return null;
            if (city.isEmpty())  return state;
            if (state.isEmpty()) return city;
            return city + ", " + state;
        } catch (Exception e) {
            return null;
        }
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
            org.put("updatedAt", TimestampUtil.now());
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        Map<String, Object> updates = new HashMap<>();
        settings.forEach((k, v) -> updates.put("settings." + k, v));
        updates.put("updatedAt", TimestampUtil.now());
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).update(updates).get();
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
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Org not found: " + orgId);
        Object list = snap.getData().get("insuranceCompanies");
        return list instanceof List ? new ArrayList<>((List<String>) list) : new ArrayList<>();
    }

    public void setInsuranceCompanies(String orgId, List<String> companies) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            org.put("insuranceCompanies", new ArrayList<>(companies));
            org.put("updatedAt", TimestampUtil.now());
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
          .update(Map.of(
              "insuranceCompanies", companies,
              "updatedAt", TimestampUtil.now()
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
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Org not found: " + orgId);
        Object baa = snap.getData().get("baaAcceptance");
        return baa instanceof Map<?,?> m
                ? new HashMap<>((Map<String, Object>) m)
                : Map.of("accepted", false);
    }

    // ── Service Contract (master service agreement) ──────────────────────────

    /** Acceptance record for the agency's Service Contract, or {@code {accepted:false}}. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getServiceContractStatus(String orgId) throws Exception {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            Object sc = org.get("serviceContractAcceptance");
            return sc instanceof Map<?,?> m ? new HashMap<>((Map<String, Object>) m) : Map.of("accepted", false);
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Org not found: " + orgId);
        Object sc = snap.getData().get("serviceContractAcceptance");
        return sc instanceof Map<?,?> m
                ? new HashMap<>((Map<String, Object>) m)
                : Map.of("accepted", false);
    }

    /** Record Service Contract acceptance for the org. */
    public Map<String, Object> acceptServiceContract(String orgId, String uid,
                                                     String signerName, String signerTitle) throws Exception {
        String now = TimestampUtil.now();
        Map<String, Object> record = new HashMap<>();
        record.put("accepted",    true);
        record.put("acceptedAt",  now);
        record.put("acceptedBy",  uid);
        record.put("signerName",  signerName);
        record.put("signerTitle", signerTitle);
        record.put("version",     "1.0");

        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            org.put("serviceContractAcceptance", record);
            org.put("serviceContractAccepted",   true);
            org.put("updatedAt",                 now);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
              .update(Map.of(
                  "serviceContractAcceptance", record,
                  "serviceContractAccepted",   true,
                  "updatedAt",                 now
              )).get();
        }
        log.info("Service Contract v1.0 accepted for org {} by {} (uid={})", orgId, signerName, uid);
        return record;
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
        String now = TimestampUtil.now();
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
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
              .update(Map.of(
                  "baaAcceptance", baaRecord,
                  "baaAccepted",   true,
                  "updatedAt",     now
              )).get();
        }
        log.info("BAA v1.1 accepted for org {} by {} (uid={})", orgId, signerName, uid);
        return baaRecord;
    }

    /**
     * Render the executed BAA as a self-contained, print-ready HTML document.
     * Throws IllegalStateException if the BAA has not been signed yet.
     */
    @SuppressWarnings("unchecked")
    public String renderBaaDocument(String orgId) throws Exception {
        Map<String, Object> org = getOrg(orgId);
        Object acceptanceObj = org.get("baaAcceptance");
        if (!(acceptanceObj instanceof Map) || !Boolean.TRUE.equals(org.get("baaAccepted"))) {
            throw new IllegalStateException("The BAA has not been signed for this organization.");
        }
        Map<String, Object> a = (Map<String, Object>) acceptanceObj;
        String orgName     = esc(String.valueOf(org.getOrDefault("name", orgId)));
        String signerName  = esc(String.valueOf(a.getOrDefault("signerName", "—")));
        String signerTitle = esc(String.valueOf(a.getOrDefault("signerTitle", "—")));
        String version     = esc(String.valueOf(a.getOrDefault("version", "1.0")));
        String acceptedAt  = String.valueOf(a.getOrDefault("acceptedAt", ""));
        String acceptedDate = acceptedAt;
        try {
            acceptedDate = DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a 'UTC'")
                    .withZone(ZoneOffset.UTC).format(Instant.parse(acceptedAt));
        } catch (Exception ignored) {}

        return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\" />"
            + "<title>Business Associate Agreement — " + orgName + "</title>"
            + "<style>"
            + "body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:40px auto;padding:0 32px;color:#1a2b3c;line-height:1.6}"
            + "h1{font-size:22px;border-bottom:2px solid #2a5f6f;padding-bottom:8px}"
            + "h2{font-size:15px;margin-top:28px;color:#2a5f6f}"
            + ".meta{background:#f6f9fb;border:1px solid #dce7ee;border-radius:8px;padding:16px 20px;margin:24px 0;font-family:Arial,sans-serif;font-size:13px}"
            + ".meta b{display:inline-block;width:160px;color:#52616b}"
            + ".sig{margin-top:40px;border-top:1px solid #ccc;padding-top:20px;font-family:Arial,sans-serif}"
            + "@media print{body{margin:0}}"
            + "</style></head><body>"
            + "<h1>Business Associate Agreement</h1>"
            + "<div class=\"meta\">"
            + "<div><b>Covered Entity / Client</b> " + orgName + "</div>"
            + "<div><b>Business Associate</b> MyABA.ai</div>"
            + "<div><b>Agreement Version</b> v" + version + "</div>"
            + "<div><b>Executed By</b> " + signerName + " (" + signerTitle + ")</div>"
            + "<div><b>Date Executed</b> " + esc(acceptedDate) + "</div>"
            + "</div>"
            + "<p>This Business Associate Agreement (\"Agreement\") is entered into pursuant to the Health "
            + "Insurance Portability and Accountability Act of 1996 (HIPAA), the HITECH Act, and 45 C.F.R. "
            + "Parts 160 and 164, between the Covered Entity identified above and MyABA.ai (\"Business Associate\").</p>"
            + "<h2>1. Permitted Uses and Disclosures</h2><p>Business Associate may use or disclose Protected "
            + "Health Information (PHI) only as permitted or required by this Agreement or as required by law, "
            + "and shall not use or disclose PHI in a manner that would violate Subpart E of 45 C.F.R. Part 164.</p>"
            + "<h2>2. Safeguards</h2><p>Business Associate shall implement administrative, physical, and technical "
            + "safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability "
            + "of electronic PHI, as required by the Security Rule (45 C.F.R. §§ 164.308, 164.310, 164.312).</p>"
            + "<h2>3. Minimum Necessary</h2><p>Business Associate shall limit its uses and disclosures of, and "
            + "requests for, PHI to the minimum necessary to accomplish the intended purpose, except where the "
            + "minimum-necessary standard does not apply under 45 C.F.R. § 164.502(b)(2).</p>"
            + "<h2>4. Reporting</h2><p>Business Associate shall report to the Covered Entity any use or disclosure "
            + "of PHI not provided for by this Agreement, including breaches of unsecured PHI as required by "
            + "45 C.F.R. § 164.410, without unreasonable delay.</p>"
            + "<h2>5. Subcontractors</h2><p>Business Associate shall ensure that any subcontractors that create, "
            + "receive, maintain, or transmit PHI on its behalf agree in writing to the same restrictions and "
            + "conditions that apply to Business Associate.</p>"
            + "<h2>6. Termination</h2><p>Upon termination, Business Associate shall return or destroy all PHI "
            + "received from, or created or received on behalf of, the Covered Entity, where feasible.</p>"
            + "<div class=\"sig\"><p><b>Electronically executed</b> by " + signerName + ", " + signerTitle
            + ", on behalf of " + orgName + " on " + esc(acceptedDate) + ".</p>"
            + "<p style=\"font-size:12px;color:#888\">This document is a record of the agreement accepted "
            + "electronically within the MyABA.ai platform (Agreement version v" + version + ").</p></div>"
            + "</body></html>";
    }

    /** Render the executed BAA as a PDF (via the XHTML document above). */
    public byte[] renderBaaPdf(String orgId) throws Exception {
        return htmlToPdf(renderBaaDocument(orgId));
    }

    /** Render the executed Service Contract as a PDF. */
    public byte[] renderServiceContractPdf(String orgId) throws Exception {
        return htmlToPdf(renderServiceContractDocument(orgId));
    }

    /** Shared XHTML → PDF renderer. */
    private byte[] htmlToPdf(String html) throws Exception {
        try (java.io.ByteArrayOutputStream os = new java.io.ByteArrayOutputStream()) {
            com.openhtmltopdf.pdfboxout.PdfRendererBuilder builder =
                    new com.openhtmltopdf.pdfboxout.PdfRendererBuilder();
            builder.useFastMode();
            builder.withHtmlContent(html, null);
            builder.toStream(os);
            builder.run();
            return os.toByteArray();
        }
    }

    /**
     * Render the executed Service Contract as a self-contained, print-ready XHTML document.
     * Throws IllegalStateException if it has not been signed yet.
     */
    @SuppressWarnings("unchecked")
    public String renderServiceContractDocument(String orgId) throws Exception {
        Map<String, Object> org = getOrg(orgId);
        Object acceptanceObj = org.get("serviceContractAcceptance");
        if (!(acceptanceObj instanceof Map) || !Boolean.TRUE.equals(org.get("serviceContractAccepted"))) {
            throw new IllegalStateException("The Service Contract has not been signed for this organization.");
        }
        Map<String, Object> a = (Map<String, Object>) acceptanceObj;
        String orgName     = esc(String.valueOf(org.getOrDefault("name", orgId)));
        String signerName  = esc(String.valueOf(a.getOrDefault("signerName", "—")));
        String signerTitle = esc(String.valueOf(a.getOrDefault("signerTitle", "—")));
        String version     = esc(String.valueOf(a.getOrDefault("version", "1.0")));
        String acceptedAt  = String.valueOf(a.getOrDefault("acceptedAt", ""));
        String acceptedDate = acceptedAt;
        try {
            acceptedDate = DateTimeFormatter.ofPattern("MMMM d, yyyy 'at' h:mm a 'UTC'")
                    .withZone(ZoneOffset.UTC).format(Instant.parse(acceptedAt));
        } catch (Exception ignored) {}

        return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\" />"
            + "<title>Service Contract — " + orgName + "</title>"
            + "<style>"
            + "body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:40px auto;padding:0 32px;color:#1a2b3c;line-height:1.6}"
            + "h1{font-size:22px;border-bottom:2px solid #2a5f6f;padding-bottom:8px}"
            + "h2{font-size:15px;margin-top:28px;color:#2a5f6f}"
            + ".meta{background:#f6f9fb;border:1px solid #dce7ee;border-radius:8px;padding:16px 20px;margin:24px 0;font-family:Arial,sans-serif;font-size:13px}"
            + ".meta b{display:inline-block;width:160px;color:#52616b}"
            + ".sig{margin-top:40px;border-top:1px solid #ccc;padding-top:20px;font-family:Arial,sans-serif}"
            + "@media print{body{margin:0}}"
            + "</style></head><body>"
            + "<h1>Service Contract</h1>"
            + "<div class=\"meta\">"
            + "<div><b>Client / Agency</b> " + orgName + "</div>"
            + "<div><b>Service Provider</b> MyABA.ai</div>"
            + "<div><b>Agreement Version</b> v" + version + "</div>"
            + "<div><b>Executed By</b> " + signerName + " (" + signerTitle + ")</div>"
            + "<div><b>Date Executed</b> " + esc(acceptedDate) + "</div>"
            + "</div>"
            + "<p>This Service Contract (\"Agreement\") governs the provision of the MyABA.ai software platform "
            + "and related services (\"Services\") by MyABA.ai (\"Provider\") to the agency identified above (\"Client\").</p>"
            + "<h2>1. Services</h2><p>Provider will make the MyABA.ai platform available to Client for the creation, "
            + "management, and AI-assisted drafting of ABA clinical documentation, subject to the applicable plan and "
            + "usage limits.</p>"
            + "<h2>2. Term &amp; Renewal</h2><p>This Agreement begins on the date executed above and continues on a "
            + "subscription basis until terminated. Subscription terms renew automatically unless cancelled in "
            + "accordance with Section 6.</p>"
            + "<h2>3. Fees</h2><p>Client agrees to pay the subscription fees for its selected plan. Fees are billed in "
            + "advance and are non-refundable except as required by law.</p>"
            + "<h2>4. Client Responsibilities</h2><p>Client is responsible for the accuracy of information it enters, "
            + "for maintaining appropriate professional oversight of all generated documentation, and for ensuring its "
            + "users comply with this Agreement.</p>"
            + "<h2>5. Data Ownership &amp; Confidentiality</h2><p>Client retains ownership of its data. Provider will "
            + "handle Protected Health Information in accordance with the separately executed Business Associate "
            + "Agreement (BAA) and will maintain the confidentiality of Client's data.</p>"
            + "<h2>6. Termination</h2><p>Either party may terminate this Agreement on written notice. Upon termination, "
            + "Client may export its data for a reasonable period, after which Provider may delete it.</p>"
            + "<h2>7. Limitation of Liability</h2><p>The Services are professional support tools and do not constitute "
            + "clinical, legal, or billing advice. Client remains solely responsible for clinical decisions and the "
            + "final content of all documentation.</p>"
            + "<div class=\"sig\"><p><b>Electronically executed</b> by " + signerName + ", " + signerTitle
            + ", on behalf of " + orgName + " on " + esc(acceptedDate) + ".</p>"
            + "<p style=\"font-size:12px;color:#888\">This document is a record of the agreement accepted "
            + "electronically within the MyABA.ai platform (Agreement version v" + version + ").</p></div>"
            + "</body></html>";
    }

    /** Minimal HTML escape for interpolated values. */
    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }


    // ── Invite tokens ─────────────────────────────────────────────────────────

    /**
     * Generate a single-use invite token for a given role.
     * Returns the full invite URL.
     */
    public String generateInviteToken(String orgId, String role, String createdByUid, String recipientEmail) throws Exception {
        // Accept a built-in role OR a custom role defined in this org's role config.
        if (!permissionService.isKnownRole(role, orgId))
            throw new IllegalArgumentException("Invalid role: " + role);
        String token     = UUID.randomUUID().toString().replace("-", "");
        String expiresAt = Instant.now().plusSeconds(7 * 24 * 3600).toString(); // 7 days
        // Store the addressee (lowercased) so we can (a) email the link and (b) match a
        // Google/password sign-in to this invite by verified email. Null = link-only invite.
        String email = (recipientEmail == null || recipientEmail.isBlank())
                ? null : recipientEmail.trim().toLowerCase();

        // (A) Newest invite wins: invalidate any prior pending invite(s) to this email in this
        // org so only the latest is claimable — keeps claim-by-email deterministic (no duplicate,
        // conflicting roles for one email).
        if (email != null) invalidatePriorEmailInvites(orgId, email);

        Map<String, Object> data = new HashMap<>();
        data.put("token",     token);
        data.put("orgId",     orgId);
        data.put("role",      role);
        data.put("email",     email);
        data.put("createdBy", createdByUid);
        data.put("expiresAt", expiresAt);
        data.put("usedBy",    null);

        if (devMode) {
            devTokens.put(token, data);
        } else {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
              .collection("inviteTokens").document(token).set(data).get();
        }
        return appBaseUrl + "/invite/" + token;
    }

    /**
     * (A) Expire/revoke any still-pending invite(s) addressed to {@code email} within
     * {@code orgId}, so a freshly generated invite is the only claimable one. Already-claimed
     * or already-expired invites are left untouched. A collection-scoped equality query needs
     * no explicit index (single-field auto-indexing).
     */
    private void invalidatePriorEmailInvites(String orgId, String email) {
        String pastIso = Instant.now().minusSeconds(1).toString();
        if (devMode) {
            for (Map<String, Object> t : devTokens.values()) {
                if (orgId.equals(t.get("orgId")) && email.equals(t.get("email")) && t.get("usedBy") == null) {
                    t.put("expiresAt", pastIso);
                    t.put("revoked", true);
                    t.put("revokedReason", "superseded_by_newer_invite");
                }
            }
            return;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            String nowIso = TimestampUtil.now();
            var docs = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("inviteTokens").whereEqualTo("email", email).get().get().getDocuments();
            for (var d : docs) {
                Map<String, Object> data = d.getData();
                if (data.get("usedBy") != null) continue;                                   // already claimed
                if (nowIso.compareTo(String.valueOf(data.get("expiresAt"))) >= 0) continue; // already expired
                d.getReference().update(Map.of(
                        "expiresAt", pastIso,
                        "revoked", true,
                        "revokedReason", "superseded_by_newer_invite")).get();
            }
        } catch (Exception e) {
            log.warn("Failed to invalidate prior invites for {} in org {}: {}", email, orgId, e.getMessage());
        }
    }

    /**
     * List pending (unclaimed, unexpired) invites for an org. Admin-gated at the controller.
     * The token is returned so an admin can re-copy the invite link.
     */
    public List<Map<String, Object>> listPendingInvites(String orgId) throws Exception {
        String nowIso = TimestampUtil.now();
        java.util.stream.Stream<Map<String, Object>> tokens;
        if (devMode) {
            tokens = devTokens.values().stream().filter(t -> orgId.equals(t.get("orgId")));
        } else {
            Firestore db = FirestoreClient.getFirestore();
            tokens = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("inviteTokens").get().get().getDocuments()
                    .stream().map(d -> (Map<String, Object>) new HashMap<String, Object>(d.getData()));
        }
        return tokens
                .filter(t -> t.get("usedBy") == null)
                .filter(t -> nowIso.compareTo(String.valueOf(t.get("expiresAt"))) < 0)
                .map(t -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id",        t.get("token"));   // token doubles as the id
                    m.put("token",     t.get("token"));
                    m.put("role",      t.get("role"));
                    m.put("email",     t.get("email"));
                    m.put("createdBy", t.get("createdBy"));
                    m.put("expiresAt", t.get("expiresAt"));
                    m.put("inviteUrl", appBaseUrl + "/invite/" + t.get("token"));
                    return m;
                })
                .collect(java.util.stream.Collectors.toList());
    }

    /** Revoke (delete) a pending invite token. Admin-gated at the controller. */
    public void revokeInvite(String orgId, String token) throws Exception {
        if (devMode) { devTokens.remove(token); return; }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
          .collection("inviteTokens").document(token).delete().get();
    }

    /**
     * Recent activity for a member, from the org's audit subcollection (merged
     * with legacy top-level rows). Explicitly org-scoped — the previous
     * userId-only query on the global log assumed uids never span orgs, which
     * breaks if a user is removed from one org and invited to another.
     */
    public List<Map<String, Object>> getMemberActivity(String orgId, String uid) throws Exception {
        if (devMode) return List.of();
        return auditService.readOrgAudit(orgId, null, uid, 200).stream()
                .map(d -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("eventType",  d.get("eventType"));
                    m.put("clientId",   d.get("clientId"));
                    m.put("documentId", d.get("documentId"));
                    m.put("decision",   d.get("decision"));
                    m.put("timestamp",  d.get("timestamp"));
                    m.put("timestampMs", d.get("timestampMs"));
                    return m;
                })
                .limit(50)
                .collect(java.util.stream.Collectors.toList());
    }

    private static long asLong(Object v) {
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception e) { return 0L; }
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
            // Surface whether this org requires MFA so the invite flow only forces 2FA
            // enrollment when the org actually enforces it (the MFA switch controls it).
            Object settings = org.get("settings");
            boolean mfaEnforced = settings instanceof Map<?, ?> s && Boolean.TRUE.equals(s.get("mfaEnforced"));
            result.put("mfaEnforced", mfaEnforced);
        } catch (Exception ignored) {}
        return result;
    }

    /**
     * Auto-claim a pending invite addressed to the signed-in user's VERIFIED email. Used when
     * an invited user signs in with Google/password WITHOUT the invite link — they join with
     * their invited role instead of being treated as unregistered. The email is taken from the
     * Firebase record and must be verified (never a client-supplied value), so nobody can claim
     * another person's invite. Returns {@code {claimed, orgId, role}} or {@code null} on no match.
     */
    public Map<String, Object> claimInviteByEmail(String uid, String currentOrgId) throws Exception {
        if (devMode) return null;
        // (B) Invites are onboarding-only. A user who already belongs to an org keeps their
        // existing role — an invite never re-roles or re-homes them. No-op silently (the caller
        // treats a null result as "nothing to claim").
        if (currentOrgId != null && !currentOrgId.isBlank()) return null;
        UserRecord rec = FirebaseAuth.getInstance().getUser(uid);
        if (rec.getEmail() == null || rec.getEmail().isBlank() || !rec.isEmailVerified()) return null;
        String email = rec.getEmail().trim().toLowerCase();

        Firestore db = FirestoreClient.getFirestore();
        var docs = db.collectionGroup("inviteTokens").whereEqualTo("email", email).get().get().getDocuments();
        String nowIso = TimestampUtil.now();
        for (var d : docs) {
            Map<String, Object> data = d.getData();
            if (data.get("usedBy") != null) continue;                                   // already used
            if (nowIso.compareTo(String.valueOf(data.get("expiresAt"))) >= 0) continue; // expired
            String orgId = (String) data.get("orgId");
            String role  = (String) data.get("role");
            // Never silently move a user who already belongs to a different org.
            if (currentOrgId != null && !currentOrgId.isBlank() && !currentOrgId.equals(orgId)) continue;

            String purpose = defaultPurpose(role);
            setUserClaims(uid, orgId, role, purpose);
            d.getReference().update(Map.of("usedBy", uid, "usedAt", nowIso)).get();
            writeMemberRecord(db, orgId, uid, role, purpose);
            log.info("Auto-claimed email invite: uid={} -> org={} role={}", uid, orgId, role);
            Map<String, Object> res = new HashMap<>();
            res.put("claimed", true);
            res.put("orgId", orgId);
            res.put("role", role);
            return res;
        }
        return null;
    }

    /**
     * Claim an invite token: apply the role + orgId claims to the user.
     * Marks the token as used (single-use).
     */
    public void claimInviteToken(String token, String claimingUid, String currentOrgId) throws Exception {
        Map<String, Object> data = loadToken(token);
        validateToken(data);
        if (data.get("usedBy") != null)
            throw new IllegalStateException("Invite token has already been used");

        String orgId = (String) data.get("orgId");
        String role  = (String) data.get("role");

        // (B) Invites are onboarding-only — they never change an existing member's role or
        // move them between orgs. Any already-provisioned user is rejected (their current role
        // stands); role changes go through the admin member-role endpoint, not invite links.
        if (currentOrgId != null && !currentOrgId.isBlank()) {
            if (currentOrgId.equals(orgId)) {
                throw new IllegalStateException(
                        "You're already a member of this organization. Invite links don't change your "
                        + "role — ask an administrator to update it.");
            }
            throw new IllegalStateException(
                    "You already belong to another organization. An administrator there must "
                    + "remove you before you can join a different organization.");
        }

        if (!devMode) {
            String purpose = defaultPurpose(role);
            setUserClaims(claimingUid, orgId, role, purpose);

            // Mark token as used and write the new member record
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
              .collection("inviteTokens").document(token)
              .update(Map.of("usedBy", claimingUid, "usedAt", TimestampUtil.now())).get();
            writeMemberRecord(db, orgId, claimingUid, role, purpose);
        }
        data.put("usedBy", claimingUid);
        data.put("usedAt", TimestampUtil.now());
        if (devMode) devTokens.put(token, data);
    }

    /**
     * (C) The SANCTIONED role-change path (distinct from invites, which only onboard): an admin
     * changes an existing member's role to any built-in OR org-defined custom role. Re-mints the
     * member's custom claims so {@code orgId} is preserved and {@code role} + {@code phiAccess}
     * are recomputed from the resolver, and updates the member record. The affected user picks up
     * the new role on their next ID-token refresh (≤1h, or immediately on re-login / refreshUser).
     *
     * @throws IllegalArgumentException unknown role / blank uid
     * @throws NoSuchElementException   the member doesn't exist in this org
     * @throws IllegalStateException    attempting to change the Practice Administrator (super admin)
     */
    public Map<String, Object> changeMemberRole(String orgId, String uid, String newRole) throws Exception {
        if (uid == null || uid.isBlank()) throw new IllegalArgumentException("Member uid is required");
        if (!permissionService.isKnownRole(newRole, orgId))
            throw new IllegalArgumentException("Invalid role: " + newRole);
        String purpose = defaultPurpose(newRole);

        if (devMode) {
            boolean found = false;
            for (Map<String, Object> m : devOrgMembers.getOrDefault(orgId, new ArrayList<>())) {
                if (uid.equals(m.getOrDefault("id", m.get("uid")))) {
                    if (UserRole.ORG_SUPER_ADMIN.equals(m.get("role")))
                        throw new IllegalStateException("The Practice Administrator's role can't be changed here.");
                    m.put("role", newRole);
                    m.put("purpose", purpose);
                    found = true;
                }
            }
            if (!found) throw new NoSuchElementException("Member not found in this organization");
            return roleChangeResult(uid, newRole, orgId);
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.MEMBERS).document(uid);
        var snap = ref.get().get();
        if (!snap.exists()) throw new NoSuchElementException("Member not found in this organization");
        // The org owner / super admin can't be demoted here — prevents orphaning the only admin
        // (mirrors the UI lock).
        if (UserRole.ORG_SUPER_ADMIN.equals(snap.getString("role")))
            throw new IllegalStateException("The Practice Administrator's role can't be changed here.");

        setUserClaims(uid, orgId, newRole, purpose);   // re-mints role + phiAccess via the resolver
        ref.update(Map.of("role", newRole, "purpose", purpose, "updatedAt", TimestampUtil.now())).get();
        log.info("Changed member role: org={} uid={} -> {}", orgId, uid, newRole);
        return roleChangeResult(uid, newRole, orgId);
    }

    private Map<String, Object> roleChangeResult(String uid, String role, String orgId) {
        Map<String, Object> res = new HashMap<>();
        res.put("uid", uid);
        res.put("role", role);
        try { res.put("phiAccess", permissionService.resolveForRole(role, orgId).phiAccess()); }
        catch (Exception ignored) { /* advisory only */ }
        return res;
    }

    // ── Member record helpers ─────────────────────────────────────────────────

    /**
     * Write (or overwrite) a member record in the
     * {@code organizations/{orgId}/members/{uid}} subcollection.
     * Fetches the user's display name and email from Firebase Auth so the
     * Team view can render them without a separate Auth lookup.
     * Called from {@link #createOrg}, {@link #claimInviteToken}.
     */
    /**
     * Update the current user's own profile: display name (Firebase Auth + member record)
     * and, if the email has already changed in Firebase Auth, sync the member record copy.
     * Display name is not a sensitive credential, so no re-authentication is required.
     */
    public void updateMyProfile(String uid, String orgId, String displayName, String email) throws Exception {
        Map<String, Object> updates = new HashMap<>();
        if (displayName != null && !displayName.isBlank()) updates.put("displayName", displayName.trim());
        if (email != null && !email.isBlank())             updates.put("email", email.trim());
        if (updates.isEmpty()) return;
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) {
            for (Map<String, Object> m : devOrgMembers.getOrDefault(orgId, java.util.List.of())) {
                if (uid.equals(m.get("uid"))) m.putAll(updates);
            }
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).collection(FirestoreCollections.MEMBERS).document(uid)
          .set(updates, com.google.cloud.firestore.SetOptions.merge()).get();

        // Keep Firebase Auth display name authoritative for the token's name claim.
        if (displayName != null && !displayName.isBlank()) {
            try {
                FirebaseAuth.getInstance().updateUser(
                        new com.google.firebase.auth.UserRecord.UpdateRequest(uid).setDisplayName(displayName.trim()));
            } catch (Exception e) {
                log.warn("Could not update Firebase display name for {}: {}", uid, e.getMessage());
            }
        }
    }

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
            member.put("aiTier",      "full");   // AI seat tier (full | lite); default full
            member.put("joinedAt",    TimestampUtil.now());

            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
              .collection(FirestoreCollections.MEMBERS).document(uid).set(member).get();
            log.info("Wrote member record uid={} org={} role={}", uid, orgId, role);
            publishMembershipChanged(orgId); // reconcile Stripe seats (no-op if not subscribed)
        } catch (Exception e) {
            log.error("writeMemberRecord failed uid={} org={}: {}", uid, orgId, e.getMessage());
        }
    }

    /** Fire a membership-changed event so BillingService can reconcile Stripe seats (best-effort). */
    private void publishMembershipChanged(String orgId) {
        try {
            if (eventPublisher != null && orgId != null && !orgId.isBlank()) {
                eventPublisher.publishEvent(new ai.myaba.event.MembershipChangedEvent(orgId));
            }
        } catch (Exception e) {
            log.warn("publishMembershipChanged failed for org {}: {}", orgId, e.getMessage());
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
            // Resolver-derived so custom roles (and matrix overrides) get correct PHI access.
            claims.put("phiAccess", permissionService.resolveForRole(role, orgId).phiAccess());
            // Preserve the AI seat tier across role re-mints (setCustomUserClaims REPLACES all
            // claims, so a role change must not wipe aiTier). Default "full".
            claims.put("aiTier", readExistingAiTier(uid));
            FirebaseAuth.getInstance().setCustomUserClaims(uid, claims);
        } catch (Exception e) {
            log.error("Failed to set custom claims for user {}: {}", uid, e.getMessage());
            throw new RuntimeException("Failed to update user role", e);
        }
    }

    /** The user's current aiTier custom claim, or "full" when absent/unreadable. */
    private String readExistingAiTier(String uid) {
        try {
            Object t = FirebaseAuth.getInstance().getUser(uid).getCustomClaims().get("aiTier");
            return t != null && "lite".equalsIgnoreCase(t.toString().trim()) ? "lite" : "full";
        } catch (Exception e) {
            return "full";
        }
    }

    /**
     * (AI tiers) Admin action: set a member's AI seat tier ("full" | "lite"). Re-mints just the
     * aiTier claim (preserving role/orgId/phiAccess) and updates the member record. Orthogonal to
     * role — see docs/ai-tiers.md. Effective on the member's next token refresh.
     *
     * @throws IllegalArgumentException invalid tier / blank uid
     * @throws NoSuchElementException   member not found
     */
    public Map<String, Object> changeMemberAiTier(String orgId, String uid, String tier) throws Exception {
        if (uid == null || uid.isBlank()) throw new IllegalArgumentException("Member uid is required");
        String norm = tier == null ? "" : tier.trim().toLowerCase();
        if (!norm.equals("full") && !norm.equals("lite"))
            throw new IllegalArgumentException("tier must be 'full' or 'lite'");

        if (devMode) {
            boolean found = false;
            for (Map<String, Object> m : devOrgMembers.getOrDefault(orgId, new ArrayList<>())) {
                if (uid.equals(m.getOrDefault("id", m.get("uid")))) { m.put("aiTier", norm); found = true; }
            }
            if (!found) throw new NoSuchElementException("Member not found in this organization");
            publishMembershipChanged(orgId);
            return Map.of("uid", uid, "aiTier", norm);
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.MEMBERS).document(uid);
        if (!ref.get().get().exists()) throw new NoSuchElementException("Member not found in this organization");

        // Re-mint claims preserving everything else; setCustomUserClaims replaces the whole map.
        Map<String, Object> claims = new HashMap<>(FirebaseAuth.getInstance().getUser(uid).getCustomClaims());
        claims.put("aiTier", norm);
        FirebaseAuth.getInstance().setCustomUserClaims(uid, claims);
        ref.update(Map.of("aiTier", norm, "updatedAt", TimestampUtil.now())).get();
        log.info("Changed member AI tier: org={} uid={} -> {}", orgId, uid, norm);
        publishMembershipChanged(orgId); // full/lite split changed → reconcile Stripe seats
        return Map.of("uid", uid, "aiTier", norm);
    }

    private String defaultPurpose(String role) {
        // Every role in this product is a clinical role with treatment-level access —
        // the Practice Administrator (ORG_SUPER_ADMIN) is the practice's BCBA/primary
        // supervisor, not an IT-only admin, so they review and use all client PHI. A
        // non-treatment "oversight" purpose would trigger HIPAA minimum-necessary
        // redaction of client identity on their own clients, which is not the workflow.
        return switch (role) {
            case UserRole.SUPERVISING_BCBA, UserRole.RBT,
                 UserRole.CLINICAL_DIRECTOR, UserRole.ORG_SUPER_ADMIN -> "treatment";
            default                                                   -> "treatment";
        };
    }
}
