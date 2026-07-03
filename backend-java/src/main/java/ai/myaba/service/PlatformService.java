package ai.myaba.service;

import ai.myaba.util.FirestoreCollections;
import ai.myaba.util.TimestampUtil;

import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.FirebaseApp;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Platform-level service: tenant management, platform config, usage aggregation.
 *
 * <p>Production reads live Firestore: the {@code organizations} collection for
 * tenants (with per-org {@code usage/&lt;YYYY-MM&gt;} and {@code members}
 * subcollections merged in) and the {@code platform/config} document for
 * platform-wide configuration. Dev mode keeps in-memory maps seeded on startup.
 *
 * <p>Only reachable through {@link ai.myaba.controller.PlatformController},
 * which gates every endpoint behind the vendor platform-admin tier
 * ({@link ai.myaba.security.PlatformAdminGuard} / PLATFORM_ADMIN_EMAILS).
 */
@Service
@Slf4j
public class PlatformService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    @Value("${dlp.enabled:false}")
    private boolean dlpEnabled;

    // ACLX health probe delegates here so it carries the same IAM ID token as
    // real evaluate() calls (a private gateway 403s an unauthenticated probe).
    @org.springframework.beans.factory.annotation.Autowired
    private AclxService aclxService;

    // ── In-memory stores (dev only) ───────────────────────────────────────────

    /** orgId → org summary map */
    private final Map<String, Map<String, Object>> devOrgs   = new ConcurrentHashMap<>();
    /** orgId → usage map */
    private final Map<String, Map<String, Object>> devUsage  = new ConcurrentHashMap<>();
    /** platform config map */
    private final Map<String, Object>              devConfig = new ConcurrentHashMap<>();

    // ── Dev seed ──────────────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        devConfig.put("geminiModelFast",      "gemini-3.1-flash-lite");
        devConfig.put("geminiModelReasoning", "gemini-2.5-pro");
        devConfig.put("aclxEnabled",          false);
        devConfig.put("aclxGatewayUrl",       "http://localhost:8080");
        devConfig.put("dlpEnabled",           false);

        addOrg("dev-org-001", "MyABA Dev Organization", "team", "active", "2026-01-01T00:00:00Z", 1, "chris@myaba.ai");
        addUsage("dev-org-001", 0, 0, 0);

        log.info("Dev mode: PlatformService initialized with stub tenant data");
    }

    private void addOrg(String id, String name, String plan, String status,
                        String createdAt, int memberCount, String adminEmail) {
        Map<String, Object> org = new LinkedHashMap<>();
        org.put("id",          id);
        org.put("name",        name);
        org.put("plan",        plan);
        org.put("status",      status);
        org.put("createdAt",   createdAt);
        org.put("memberCount", memberCount);
        org.put("adminEmail",  adminEmail);
        devOrgs.put(id, org);
    }

    private void addUsage(String orgId, int aiCalls, int documentCount, int chatCount) {
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("orgId",         orgId);
        u.put("aiCalls",       aiCalls);
        u.put("documentCount", documentCount);
        u.put("chatCount",     chatCount);
        u.put("memberCount",   1);
        u.put("month",         currentPeriod());
        devUsage.put(orgId, u);
    }

    private static String currentPeriod() {
        return YearMonth.now(ZoneOffset.UTC).toString();
    }

    // ── Tenants ───────────────────────────────────────────────────────────────

    /** Returns all orgs with member counts and current-month usage merged in. */
    public List<Map<String, Object>> getAllTenants() {
        if (devMode) {
            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> org : devOrgs.values()) {
                Map<String, Object> row = new LinkedHashMap<>(org);
                Map<String, Object> usage = devUsage.get(org.get("id"));
                if (usage != null) row.putAll(usage);
                row.put("id", org.get("id"));
                result.add(row);
            }
            return result;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            List<Map<String, Object>> result = new ArrayList<>();
            for (QueryDocumentSnapshot org : db.collection(FirestoreCollections.ORGANIZATIONS)
                    .get().get().getDocuments()) {
                result.add(tenantRow(db, org));
            }
            result.sort((a, b) -> String.valueOf(b.get("createdAt"))
                                        .compareTo(String.valueOf(a.get("createdAt"))));
            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("getAllTenants interrupted: {}", e.getMessage());
            return List.of();
        } catch (Exception e) {
            log.error("getAllTenants failed: {}", e.getMessage());
            return List.of();
        }
    }

    public Map<String, Object> getTenant(String orgId) {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            Map<String, Object> row = new LinkedHashMap<>(org);
            Map<String, Object> usage = devUsage.get(orgId);
            if (usage != null) row.put("usage", usage);
            return row;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
            if (!snap.exists() || snap.getData() == null) {
                throw new NoSuchElementException("Org not found: " + orgId);
            }
            return asQueryRow(db, orgId, snap.getData());
        } catch (NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to load tenant " + orgId, e);
        }
    }

    /** Persists an active/suspended flag on the org document. */
    public void setTenantStatus(String orgId, String status) {
        if (devMode) {
            Map<String, Object> org = devOrgs.get(orgId);
            if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
            org.put("status", status);
            return;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId);
            if (!ref.get().get().exists()) throw new NoSuchElementException("Org not found: " + orgId);
            ref.update(Map.of("status", status, "updatedAt", TimestampUtil.now())).get();
            log.info("Platform: org {} status → {}", orgId, status);
        } catch (NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to set status for " + orgId, e);
        }
    }

    /** Builds one tenant row: org fields + member count/admin email + usage counters. */
    private Map<String, Object> tenantRow(Firestore db, QueryDocumentSnapshot org) throws Exception {
        return asQueryRow(db, org.getId(), org.getData());
    }

    private Map<String, Object> asQueryRow(Firestore db, String orgId, Map<String, Object> data) throws Exception {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id",        orgId);
        row.put("name",      data.getOrDefault("name", orgId));
        row.put("plan",      data.getOrDefault("plan", "solo"));
        row.put("status",    data.getOrDefault("status", "active"));
        row.put("createdAt", data.getOrDefault("createdAt", ""));
        row.put("baaAccepted", Boolean.TRUE.equals(data.get("baaAccepted")));

        // Members: count + resolve the admin's email for display.
        String adminUid = String.valueOf(data.getOrDefault("adminUid", ""));
        String adminEmail = "";
        int memberCount = 0;
        try {
            var members = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection(FirestoreCollections.MEMBERS).get().get().getDocuments();
            memberCount = members.size();
            for (QueryDocumentSnapshot m : members) {
                if (m.getId().equals(adminUid)) {
                    adminEmail = String.valueOf(m.getData().getOrDefault("email", ""));
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("tenantRow: member lookup failed for {}: {}", orgId, e.getMessage());
        }
        row.put("memberCount", memberCount);
        row.put("adminEmail",  adminEmail);

        // Current-month usage counters (written by UsageService.recordRequest).
        try {
            var usage = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("usage").document(currentPeriod()).get().get();
            row.put("aiCalls",       usage.exists() ? longOr0(usage.get("requestCount"))  : 0L);
            row.put("documentCount", usage.exists() ? longOr0(usage.get("documentCount")) : 0L);
            row.put("chatCount",     usage.exists() ? longOr0(usage.get("chatCount"))     : 0L);
        } catch (Exception e) {
            log.warn("tenantRow: usage lookup failed for {}: {}", orgId, e.getMessage());
            row.put("aiCalls", 0L); row.put("documentCount", 0L); row.put("chatCount", 0L);
        }
        return row;
    }

    private static long longOr0(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }

    // ── Platform config ───────────────────────────────────────────────────────

    /** Reads the platform-wide config document ({@code platform/config}). */
    public Map<String, Object> getPlatformConfig() {
        if (devMode) return Collections.unmodifiableMap(devConfig);
        try {
            Firestore db = FirestoreClient.getFirestore();
            var snap = db.collection("platform").document("config").get().get();
            return snap.exists() ? snap.getData() : Map.of();
        } catch (Exception e) {
            log.error("getPlatformConfig failed: {}", e.getMessage());
            return Map.of();
        }
    }

    /** Merges the supplied fields into the platform config document. */
    public void updatePlatformConfig(Map<String, Object> updates) {
        if (devMode) { devConfig.putAll(updates); return; }
        try {
            Firestore db = FirestoreClient.getFirestore();
            Map<String, Object> data = new HashMap<>(updates);
            data.put("updatedAt", TimestampUtil.now());
            db.collection("platform").document("config")
              .set(data, com.google.cloud.firestore.SetOptions.merge()).get();
            log.info("Platform config updated: {}", updates.keySet());
        } catch (Exception e) {
            throw new RuntimeException("Failed to update platform config", e);
        }
    }

    // ── Usage ─────────────────────────────────────────────────────────────────

    /** Returns per-org usage for the current month, plus platform totals. */
    public Map<String, Object> getUsageSummary() {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (devMode) {
            rows.addAll(devUsage.values());
        } else {
            for (Map<String, Object> t : getAllTenants()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("orgId",         t.get("id"));
                row.put("orgName",       t.get("name"));
                row.put("plan",          t.get("plan"));
                row.put("status",        t.get("status"));
                row.put("memberCount",   t.get("memberCount"));
                row.put("aiCalls",       t.get("aiCalls"));
                row.put("documentCount", t.get("documentCount"));
                row.put("chatCount",     t.get("chatCount"));
                rows.add(row);
            }
        }
        rows.sort((a, b) -> Long.compare(longOr0(b.get("aiCalls")), longOr0(a.get("aiCalls"))));

        long totalCalls = rows.stream().mapToLong(r -> longOr0(r.get("aiCalls"))).sum();
        long totalDocs  = rows.stream().mapToLong(r -> longOr0(r.get("documentCount"))).sum();
        long totalChats = rows.stream().mapToLong(r -> longOr0(r.get("chatCount"))).sum();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month",          currentPeriod());
        result.put("totalAiCalls",   totalCalls);
        result.put("totalDocuments", totalDocs);
        result.put("totalChats",     totalChats);
        result.put("orgCount",       rows.size());
        result.put("rows",           rows);
        return result;
    }

    // ── Health ────────────────────────────────────────────────────────────────

    /** Extended health snapshot — real probes in production. */
    public Map<String, Object> getHealth() {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("api", probe("API Backend", true, "Responding normally", 1));

        if (devMode) {
            h.put("aclx",     probe("ACLX Gateway", false, "Not reachable (dev: off)", 0));
            h.put("dlp",      probe("Google DLP",   false, "Not configured",           0));
            h.put("firebase", probe("Firebase Auth", true, "Dev bypass active",        0));
        } else {
            // Authenticated probe (carries the IAM ID token) — delegated to AclxService.
            Map<String, Object> a = aclxService.healthCheck();
            h.put("aclx", probe("ACLX Gateway",
                    Boolean.TRUE.equals(a.get("up")),
                    String.valueOf(a.get("message")),
                    a.get("latencyMs") instanceof Number n ? n.intValue() : 0));
            h.put("dlp",      probe("Input DLP Guard", dlpEnabled,
                    dlpEnabled ? "Pattern blocking enabled (SSN, cards, licenses)" : "Disabled by configuration", 0));
            boolean fb = !FirebaseApp.getApps().isEmpty();
            h.put("firebase", probe("Firebase Auth", fb,
                    fb ? "Initialized" : "Not initialized", 0));
        }
        h.put("checkedAt", TimestampUtil.now());
        return h;
    }

    private Map<String, Object> probe(String name, boolean up, String message, int latencyMs) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name",      name);
        m.put("up",        up);
        m.put("message",   message);
        m.put("latencyMs", latencyMs);
        return m;
    }
}
