package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.config.DomainPolicyConfig;
import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Stores and retrieves subject-specific authorization records.
 *
 * <p>"Subject" is domain-agnostic: a patient in HIPAA, a student in FERPA,
 * a data subject in GDPR. In myABA's current deployment the subject is always
 * a client (patient), but the service makes no HIPAA-specific assumptions.
 *
 * <p>Firestore path:
 * {@code organizations/{orgId}/clients/{clientId}/authorizations/{authId}}
 *
 * <p>Authorization record shape:
 * <pre>
 *   authId       String   unique ID
 *   type         String   domain-defined (RESEARCH, PART_2_CONSENT, etc.)
 *   scope        List     domain-defined category strings
 *   status       String   ACTIVE | EXPIRED | REVOKED
 *   expiry       String?  ISO-8601, null = no expiry
 *   issuedAt     String   ISO-8601
 *   evidenceRef  String?  reference to source document
 *   addedBy      String   uid of admin who created the record
 *   orgId        String
 *   clientId     String
 * </pre>
 *
 * <h3>Hard-block guard</h3>
 * {@link #requiresHardBlock(String, String, String)} checks whether a subject's
 * data category (inferred from the {@code diagnosis} field) mandates an
 * authorization record before any AI-generated content can be released.
 * This check fires BEFORE calling the ACLX gateway — if it returns true,
 * the content is hard-blocked without ACLX involvement, because forwarding
 * to ACLX for review is itself legally impermissible for some categories
 * (e.g. 42 CFR Part 2 SUD records).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SubjectAuthorizationService {

    private final DomainPolicyConfig domainPolicyConfig;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /**
     * In-memory dev store.
     * Key structure: orgId -> clientId -> authId -> record.
     */
    private final Map<String, Map<String, Map<String, Object>>> devStore = new HashMap<>();

    // ── Dev seed ──────────────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        String now = TimestampUtil.now();

        // ── Demo scenario A: standard client, optional research auth ─────────
        // c-001 (Alex M., ASD Level 2): Active RESEARCH authorization.
        // Diagnosis is NOT a hard-block category, so AI features work normally.
        // The auth context is still sent to ACLX to demonstrate the wire-up.
        putAuth("dev-org-001", "c-001", auth(
                "auth-001", "RESEARCH",
                List.of("PHI", "CLINICAL"),
                "2027-12-31", "ACTIVE", now,
                "IRB-2026-ABA-0041", "dev-admin-001"));

        // ── Demo scenario B: super-PHI client WITH active authorization ───────
        // c-002 (Jordan T., ASD Level 1 + SUD): Active 42 CFR Part 2 consent on file.
        // Hard-block guard fires (SUD keyword match) BUT finds a satisfying auth
        // → AI features proceed; authorization panel shows red "Super PHI" badge
        // with the active Part 2 consent.
        putAuth("dev-org-001", "c-002", auth(
                "auth-003", "PART_2_CONSENT",
                List.of("PHI", "SUD"),
                "2027-06-30", "ACTIVE", now,
                "CONSENT-FORM-JT-2026-001", "dev-admin-001"));

        // ── Demo scenario C: super-PHI client WITHOUT active authorization ────
        // c-003 (Sam K., ADHD + ASD Level 1 + Psychotherapy Notes Required):
        // Only has an expired RESEARCH auth — does NOT satisfy the Part 2
        // requirement for psychotherapy notes.
        // Hard-block guard fires (psychotherapy keyword match) and finds NO
        // satisfying active auth → AI features are hard-blocked with AUTH_REQUIRED.
        // Admin must add a HIPAA_AUTHORIZATION covering PSYCHOTHERAPY scope to unblock.
        putAuth("dev-org-001", "c-003", auth(
                "auth-002", "RESEARCH",
                List.of("PHI"),
                "2026-01-01", "EXPIRED", "2025-01-15T00:00:00Z",
                null, "dev-admin-001"));

        log.info("Dev mode: seeded subject authorizations for dev-org-001 " +
                 "(A=standard, B=super-PHI+auth, C=super-PHI+no-active-auth)");
    }

    private Map<String, Object> auth(String authId, String type, List<String> scope,
                                     String expiry, String status, String issuedAt,
                                     String evidenceRef, String addedBy) {
        Map<String, Object> a = new HashMap<>();
        a.put("authId",       authId);
        a.put("type",         type);
        a.put("scope",        new ArrayList<>(scope));
        a.put("expiry",       expiry);
        a.put("status",       status);
        a.put("issuedAt",     issuedAt);
        a.put("evidenceRef",  evidenceRef != null ? evidenceRef : "");
        a.put("addedBy",      addedBy);
        return a;
    }

    private void putAuth(String orgId, String clientId, Map<String, Object> record) {
        devStore
            .computeIfAbsent(orgId,     k -> new HashMap<>())
            .computeIfAbsent(clientId,  k -> new LinkedHashMap<>())
            .put((String) record.get("authId"), record);
    }

    // ── Hard-block guard ──────────────────────────────────────────────────────

    /**
     * Returns {@code true} when the subject's data MUST be hard-blocked before
     * any AI content about them is generated or evaluated.
     *
     * <p>Logic:
     * <ol>
     *   <li>Look up the domain's {@code hardBlockDiagnosisKeywords} list.
     *   <li>If the {@code diagnosis} string matches any keyword, the subject is
     *       classified as being in a hard-block scope.
     *   <li>Check whether at least one ACTIVE, non-expired authorization of an
     *       accepted type (per {@code hardBlockAuthTypes}) covering a hard-block
     *       scope exists in the store.
     *   <li>If no such authorization is found, return {@code true} — hard block.
     * </ol>
     *
     * @param orgId     organization ID
     * @param clientId  subject (client) ID
     * @param diagnosis the subject's diagnosis string from their record
     * @return true if content must be hard-blocked without ACLX evaluation
     */
    public boolean requiresHardBlock(String orgId, String clientId, String diagnosis) {
        // Default domain is hipaa for myABA; extend here for multi-domain support
        DomainPolicyConfig.DomainPolicy policy = domainPolicyConfig.forDomain("hipaa");

        if (policy.getHardBlockDiagnosisKeywords().isEmpty()) return false;
        if (diagnosis == null || diagnosis.isBlank()) return false;

        String d = diagnosis.toLowerCase(Locale.ROOT);
        boolean isHardBlockCategory = policy.getHardBlockDiagnosisKeywords().stream()
                .anyMatch(kw -> d.contains(kw.toLowerCase(Locale.ROOT)));

        if (!isHardBlockCategory) return false;

        // Check whether a satisfying authorization exists.
        // An authorization satisfies the requirement when:
        //   (a) its type is in hardBlockAuthTypes, AND
        //   (b) either its scope is empty (= blanket authorization covering all categories)
        //       or at least one scope value overlaps with hardBlockScopes.
        // This lets ABA_TREATMENT_AUTHORIZATION (empty scope = "all treatment categories")
        // satisfy the check without enumerating every possible diagnostic sub-category.
        List<Map<String, Object>> auths = getActiveAuthorizations(orgId, clientId);
        boolean hasAuth = auths.stream().anyMatch(a -> {
            String type = (String) a.get("type");
            if (!policy.getHardBlockAuthTypes().contains(type)) return false;
            @SuppressWarnings("unchecked")
            List<String> scope = (List<String>) a.getOrDefault("scope", List.of());
            // Empty scope = blanket authorization — satisfies any hard-block category
            if (scope.isEmpty()) return true;
            return scope.stream().anyMatch(s -> policy.getHardBlockScopes().contains(s));
        });

        if (!hasAuth) {
            log.warn("Hard-block: no valid authorization for subject {} in org {} (diagnosis keyword match)",
                    clientId, orgId);
        }
        return !hasAuth;
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Returns all ACTIVE, non-expired authorization records for a subject.
     * Callers include {@link AclxService} (to build the authorization context
     * attached to every evaluate request) and the hard-block guard above.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getActiveAuthorizations(String orgId, String clientId) {
        if (orgId == null || clientId == null) return List.of();
        try {
            List<Map<String, Object>> all = getAllAuthorizations(orgId, clientId);
            return all.stream()
                    .filter(a -> "ACTIVE".equals(a.get("status")))
                    .filter(a -> !isExpired((String) a.get("expiry")))
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("getActiveAuthorizations failed for subject {} in org {}: {}",
                    clientId, orgId, e.getMessage());
            return List.of();
        }
    }

    /** Returns ALL authorization records (any status) for admin management UI. */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getAllAuthorizations(String orgId, String clientId) {
        if (devMode) {
            // devStore: orgId -> clientId -> authId -> record (Map<String,Object> stored as Object)
            Map<String, Object> clientStore =
                    devStore.getOrDefault(orgId, Map.of())
                            .getOrDefault(clientId, Map.of());
            List<Map<String, Object>> result = new ArrayList<>();
            clientStore.forEach((k, v) -> result.add((Map<String, Object>) v));
            return result;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            List<QueryDocumentSnapshot> docs = db
                    .collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection(FirestoreCollections.CLIENTS).document(clientId)
                    .collection("authorizations")
                    .get().get().getDocuments();

            return docs.stream().map(d -> {
                Map<String, Object> m = new HashMap<>(d.getData());
                m.put("authId", d.getId());
                return m;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("getAllAuthorizations failed for {}/{}: {}", orgId, clientId, e.getMessage());
            return List.of();
        }
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Add a new authorization record. Admin-only.
     *
     * @param admin      the requesting admin user
     * @param clientId   subject the authorization applies to
     * @param type       domain-defined authorization type
     * @param scope      domain-defined data categories covered
     * @param expiry     ISO-8601 expiry or null
     * @param evidenceRef optional reference to source document
     * @return the created authorization record
     */
    public Map<String, Object> addAuthorization(AppUser admin, String clientId,
                                                String type, List<String> scope,
                                                String expiry, String evidenceRef) {
        requireAdmin(admin);

        String authId  = "auth-" + UUID.randomUUID().toString().substring(0, 8);
        String now     = TimestampUtil.now();

        Map<String, Object> record = new HashMap<>();
        record.put("authId",      authId);
        record.put("type",        type);
        record.put("scope",       scope != null ? new ArrayList<>(scope) : new ArrayList<>());
        record.put("status",      "ACTIVE");
        record.put("expiry",      expiry != null ? expiry : "");
        record.put("issuedAt",    now);
        record.put("evidenceRef", evidenceRef != null ? evidenceRef : "");
        record.put("addedBy",     admin.getUid());
        record.put("orgId",       admin.getOrgId());
        record.put("clientId",    clientId);

        if (devMode) {
            putAuth(admin.getOrgId(), clientId, record);
            log.info("Dev: added authorization {} type={} for client {}", authId, type, clientId);
            return record;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(admin.getOrgId())
              .collection(FirestoreCollections.CLIENTS).document(clientId)
              .collection("authorizations").document(authId)
              .set(record).get();
        } catch (Exception e) {
            log.error("Failed to save authorization for client {}: {}", clientId, e.getMessage());
            throw new RuntimeException("Failed to save authorization record", e);
        }
        return record;
    }

    /**
     * Revoke an authorization record. Admin-only.
     * Sets status to REVOKED; does not delete so the audit trail is preserved.
     */
    public void revokeAuthorization(AppUser admin, String clientId, String authId) {
        requireAdmin(admin);

        if (devMode) {
            @SuppressWarnings("unchecked")
            Map<String, Object> record = (Map<String, Object>)
                    devStore.getOrDefault(admin.getOrgId(), Map.of())
                            .getOrDefault(clientId, Map.of())
                            .get(authId);
            if (record == null) throw new NoSuchElementException("Authorization not found: " + authId);
            record.put("status", "REVOKED");
            record.put("revokedAt", TimestampUtil.now());
            record.put("revokedBy", admin.getUid());
            return;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(admin.getOrgId())
              .collection(FirestoreCollections.CLIENTS).document(clientId)
              .collection("authorizations").document(authId)
              .update(Map.of(
                      "status",     "REVOKED",
                      "revokedAt",  TimestampUtil.now(),
                      "revokedBy",  admin.getUid()
              )).get();
        } catch (Exception e) {
            log.error("Failed to revoke authorization {}: {}", authId, e.getMessage());
            throw new RuntimeException("Failed to revoke authorization", e);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void requireAdmin(AppUser user) {
        ai.myaba.security.AuthorizationUtil.requireAdmin(user);
    }

    /**
     * Returns {@code true} when the given expiry string represents a date/time
     * that is already in the past.  Accepts both full ISO-8601 timestamps
     * ({@code 2027-12-31T00:00:00Z}) and plain date strings ({@code 2027-12-31}).
     * A null/blank expiry means "no expiry" — returns {@code false} (not expired).
     */
    private boolean isExpired(String expiry) {
        if (expiry == null || expiry.isBlank()) return false;
        // Try full ISO-8601 instant first (most precise)
        try {
            return !Instant.parse(expiry).isAfter(Instant.now());
        } catch (Exception ignored) {}
        // Fall back to date-only YYYY-MM-DD — treat as expired if the date is today or earlier
        try {
            LocalDate date = LocalDate.parse(expiry);
            return !date.isAfter(LocalDate.now(ZoneOffset.UTC));
        } catch (Exception ignored) {}
        log.warn("Unrecognised expiry format '{}' — treating as non-expired", expiry);
        return false;
    }
}
