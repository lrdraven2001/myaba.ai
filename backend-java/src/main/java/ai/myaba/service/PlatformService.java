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

    // Billing summary + invoices for the per-org drill-in.
    @org.springframework.beans.factory.annotation.Autowired
    private BillingService billingService;

    // Per-seat / plan monthly amounts (USD cents) — mirror BillingService so the
    // admin MRR estimate matches what Stripe bills. -1 MRR means "custom" (enterprise).
    private static final long FULL_SEAT_CENTS = 3500; // Team – Full ($35)
    private static final long LITE_SEAT_CENTS = 1500; // Team – Lite ($15)
    private static final long MIN_TEAM_CENTS  = 5000; // Team floor / Solo ($50)

    /** Estimated monthly recurring revenue (USD cents) for a plan + seat mix. -1 = custom. */
    private static long mrrCents(String plan, int fullSeats, int liteSeats) {
        if (plan == null) return 0L;
        return switch (plan) {
            case "team"       -> Math.max(fullSeats * FULL_SEAT_CENTS + liteSeats * LITE_SEAT_CENTS, MIN_TEAM_CENTS);
            case "solo"       -> MIN_TEAM_CENTS;
            case "enterprise" -> -1L;   // custom contract — not estimable from seats
            default           -> 0L;    // free / no plan
        };
    }

    private static boolean isPaying(String subscriptionStatus) {
        return "active".equals(subscriptionStatus) || "trialing".equals(subscriptionStatus);
    }

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

        devConfig.put("geminiModelFast",      "gemini-3.5-flash-lite");
        devConfig.put("geminiModelReasoning", "gemini-3.1-pro-preview");
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
            Map<String, Object> row = asQueryRow(db, orgId, snap.getData());
            // Drill-in extras: month-by-month usage, member roster, and the live
            // billing summary (subscription + recent Stripe invoices).
            row.put("usageHistory", usageHistory(db, orgId));
            row.put("members",      memberList(db, orgId));
            try {
                row.put("billing", billingService.getBillingSummary(orgId));
            } catch (Exception e) {
                log.warn("getTenant: billing summary failed for {}: {}", orgId, e.getMessage());
            }
            return row;
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

        // Members: count + admin email + AI seat breakdown (full vs lite) for MRR.
        String adminUid = String.valueOf(data.getOrDefault("adminUid", ""));
        String adminEmail = "";
        int memberCount = 0, fullSeats = 0, liteSeats = 0;
        try {
            var members = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection(FirestoreCollections.MEMBERS).get().get().getDocuments();
            memberCount = members.size();
            for (QueryDocumentSnapshot m : members) {
                if (m.getId().equals(adminUid)) adminEmail = String.valueOf(m.getData().getOrDefault("email", ""));
                if ("lite".equalsIgnoreCase(String.valueOf(m.getData().getOrDefault("aiTier", "full")))) liteSeats++;
                else fullSeats++;
            }
        } catch (Exception e) {
            log.warn("tenantRow: member lookup failed for {}: {}", orgId, e.getMessage());
        }
        row.put("memberCount", memberCount);
        row.put("adminEmail",  adminEmail);
        row.put("fullSeats",   fullSeats);
        row.put("liteSeats",   liteSeats);

        // Billing / payment status (written by BillingService from Stripe webhooks).
        String plan = String.valueOf(data.getOrDefault("plan", "solo"));
        String subStatus = data.get("subscriptionStatus") instanceof String s ? s : null;
        row.put("subscriptionStatus", subStatus);      // active | trialing | past_due | canceled | null
        row.put("paying",             isPaying(subStatus));
        row.put("seats",              longOr0(data.get("seats")));
        row.put("currentPeriodEnd",   data.get("currentPeriodEnd")); // Stripe epoch seconds, or null
        row.put("mrrCents",           mrrCents(plan, fullSeats, liteSeats));

        // Usage: current month + lifetime totals + most-recent active month.
        // One read of the whole usage subcollection (admin-only screen, infrequent).
        long curCalls = 0, curDocs = 0, curChats = 0, lifeCalls = 0, lifeDocs = 0, lifeChats = 0;
        String lastActive = "";
        try {
            String cur = currentPeriod();
            var periods = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("usage").get().get().getDocuments();
            for (QueryDocumentSnapshot p : periods) {
                long c = longOr0(p.get("requestCount")), d = longOr0(p.get("documentCount")), ch = longOr0(p.get("chatCount"));
                lifeCalls += c; lifeDocs += d; lifeChats += ch;
                if (p.getId().equals(cur)) { curCalls = c; curDocs = d; curChats = ch; }
                if ((c > 0 || d > 0 || ch > 0) && p.getId().compareTo(lastActive) > 0) lastActive = p.getId();
            }
        } catch (Exception e) {
            log.warn("tenantRow: usage lookup failed for {}: {}", orgId, e.getMessage());
        }
        row.put("aiCalls", curCalls);            row.put("documentCount", curDocs);       row.put("chatCount", curChats);
        row.put("lifetimeAiCalls", lifeCalls);   row.put("lifetimeDocuments", lifeDocs);   row.put("lifetimeChats", lifeChats);
        row.put("lastActive", lastActive);       // "YYYY-MM" of most recent activity, or "" if never
        return row;
    }

    private static long longOr0(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }

    /** Month-by-month usage for the drill-in, newest first. */
    private List<Map<String, Object>> usageHistory(Firestore db, String orgId) {
        List<Map<String, Object>> out = new ArrayList<>();
        try {
            for (QueryDocumentSnapshot p : db.collection(FirestoreCollections.ORGANIZATIONS)
                    .document(orgId).collection("usage").get().get().getDocuments()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("period",        p.getId());
                m.put("aiCalls",       longOr0(p.get("requestCount")));
                m.put("documentCount", longOr0(p.get("documentCount")));
                m.put("chatCount",     longOr0(p.get("chatCount")));
                out.add(m);
            }
            out.sort((a, b) -> String.valueOf(b.get("period")).compareTo(String.valueOf(a.get("period"))));
        } catch (Exception e) {
            log.warn("usageHistory failed for {}: {}", orgId, e.getMessage());
        }
        return out;
    }

    /** Member roster for the drill-in: email, role, AI seat tier. */
    private List<Map<String, Object>> memberList(Firestore db, String orgId) {
        List<Map<String, Object>> out = new ArrayList<>();
        try {
            for (QueryDocumentSnapshot m : db.collection(FirestoreCollections.ORGANIZATIONS)
                    .document(orgId).collection(FirestoreCollections.MEMBERS).get().get().getDocuments()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("uid",         m.getId());
                row.put("email",       m.getData().getOrDefault("email", ""));
                row.put("displayName", m.getData().getOrDefault("displayName", ""));
                row.put("role",        m.getData().getOrDefault("role", ""));
                row.put("aiTier",      m.getData().getOrDefault("aiTier", "full"));
                out.add(row);
            }
        } catch (Exception e) {
            log.warn("memberList failed for {}: {}", orgId, e.getMessage());
        }
        return out;
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
                row.put("orgId",              t.get("id"));
                row.put("orgName",            t.get("name"));
                row.put("plan",               t.get("plan"));
                row.put("status",             t.get("status"));
                row.put("memberCount",        t.get("memberCount"));
                row.put("aiCalls",            t.get("aiCalls"));
                row.put("documentCount",      t.get("documentCount"));
                row.put("chatCount",          t.get("chatCount"));
                row.put("lifetimeAiCalls",    t.get("lifetimeAiCalls"));
                row.put("lifetimeDocuments",  t.get("lifetimeDocuments"));
                row.put("lifetimeChats",      t.get("lifetimeChats"));
                row.put("lastActive",         t.get("lastActive"));
                row.put("subscriptionStatus", t.get("subscriptionStatus"));
                row.put("paying",             t.get("paying"));
                row.put("mrrCents",           t.get("mrrCents"));
                rows.add(row);
            }
        }
        rows.sort((a, b) -> Long.compare(longOr0(b.get("aiCalls")), longOr0(a.get("aiCalls"))));

        long totalCalls = rows.stream().mapToLong(r -> longOr0(r.get("aiCalls"))).sum();
        long totalDocs  = rows.stream().mapToLong(r -> longOr0(r.get("documentCount"))).sum();
        long totalChats = rows.stream().mapToLong(r -> longOr0(r.get("chatCount"))).sum();
        long lifeCalls  = rows.stream().mapToLong(r -> longOr0(r.get("lifetimeAiCalls"))).sum();
        long lifeDocs   = rows.stream().mapToLong(r -> longOr0(r.get("lifetimeDocuments"))).sum();
        long lifeChats  = rows.stream().mapToLong(r -> longOr0(r.get("lifetimeChats"))).sum();
        // Platform MRR counts only actually-paying orgs; enterprise (-1, custom) is excluded.
        long totalMrr   = rows.stream()
                .filter(r -> Boolean.TRUE.equals(r.get("paying")))
                .mapToLong(r -> Math.max(0, longOr0(r.get("mrrCents"))))
                .sum();
        long payingCount = rows.stream().filter(r -> Boolean.TRUE.equals(r.get("paying"))).count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month",             currentPeriod());
        result.put("totalAiCalls",      totalCalls);
        result.put("totalDocuments",    totalDocs);
        result.put("totalChats",        totalChats);
        result.put("lifetimeAiCalls",   lifeCalls);
        result.put("lifetimeDocuments", lifeDocs);
        result.put("lifetimeChats",     lifeChats);
        result.put("totalMrrCents",     totalMrr);
        result.put("payingOrgCount",    payingCount);
        result.put("orgCount",          rows.size());
        result.put("rows",              rows);
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
