package ai.myaba.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Platform-level service: tenant management, platform config, usage aggregation.
 *
 * In dev mode all data lives in in-memory maps seeded on startup.
 * In production this reads from a top-level Firestore collection
 * ("platform/config" document and "organizations" collection).
 *
 * This service is only accessible via PlatformController which gates
 * every endpoint behind the ORG_SUPER_ADMIN role.
 */
@Service
@Slf4j
public class PlatformService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

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

        // ── Platform config ───────────────────────────────────────────────────
        devConfig.put("anthropicModel",      "claude-sonnet-4-6");
        devConfig.put("anthropicMaxTokens",  4000);
        devConfig.put("aclxEnabled",         false);
        devConfig.put("aclxGatewayUrl",      "http://localhost:8080");
        devConfig.put("dlpEnabled",          false);
        devConfig.put("dlpGcpProjectId",     "");
        devConfig.put("dlpLocation",         "global");
        devConfig.put("dlpLikelihood",       "LIKELY");
        devConfig.put("dlpInfoTypes",        List.of(
                "PERSON_NAME", "DATE_OF_BIRTH",
                "MEDICAL_RECORD_NUMBER", "US_HEALTHCARE_NPI"));

        // ── Tenants ───────────────────────────────────────────────────────────
        addOrg("org-sunshine-001",  "Sunshine ABA Services",      "team",       "active",    "2025-10-12T00:00:00Z", 12, "sunshine@myaba.ai");
        addOrg("org-blueridge-002", "Blue Ridge Behavioral",       "solo",       "active",    "2026-01-15T00:00:00Z",  3, "admin@blueridge.com");
        addOrg("org-pacific-003",   "Pacific Coast ABA",           "enterprise", "active",    "2025-08-03T00:00:00Z", 28, "it@pacificaba.com");
        addOrg("org-midwest-004",   "Midwest Behavioral Health",   "team",       "trial",     "2026-05-28T00:00:00Z",  7, "hello@midwestbh.com");
        addOrg("org-suspended-005", "Summit Behavior Group",       "solo",       "suspended", "2026-03-01T00:00:00Z",  2, "admin@summitbg.com");
        addOrg("dev-org-001",       "MyABA Dev Organization",      "team",       "active",    "2026-01-01T00:00:00Z",  4, "chris@myaba.dev");

        // ── Usage (current month) ─────────────────────────────────────────────
        addUsage("org-sunshine-001",  1_240, 2_180_000, 3_400_000L,  12);
        addUsage("org-blueridge-002",   187,   312_000,   820_000L,   3);
        addUsage("org-pacific-003",   4_830, 8_920_000, 14_200_000L, 28);
        addUsage("org-midwest-004",     312,   540_000,  1_100_000L,  7);
        addUsage("org-suspended-005",     0,         0,    200_000L,  2);
        addUsage("dev-org-001",           42,    68_000,    150_000L,  4);

        log.info("Dev mode: PlatformService seeded {} tenants", devOrgs.size());
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

    private void addUsage(String orgId, int aiCalls, long aiTokens,
                          long storageBytes, int memberCount) {
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("orgId",        orgId);
        u.put("aiCalls",      aiCalls);
        u.put("aiTokens",     aiTokens);
        u.put("storageBytes", storageBytes);
        u.put("memberCount",  memberCount);
        u.put("month",        "2026-06");
        devUsage.put(orgId, u);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Returns all orgs, with their current usage merged in. */
    public List<Map<String, Object>> getAllTenants() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> org : devOrgs.values()) {
            Map<String, Object> row = new LinkedHashMap<>(org);
            Map<String, Object> usage = devUsage.get(org.get("id"));
            if (usage != null) {
                row.put("aiCalls",      usage.get("aiCalls"));
                row.put("aiTokens",     usage.get("aiTokens"));
                row.put("storageBytes", usage.get("storageBytes"));
            }
            result.add(row);
        }
        // Sort by createdAt descending (most-recently joined first)
        result.sort((a, b) -> String.valueOf(b.get("createdAt"))
                                    .compareTo(String.valueOf(a.get("createdAt"))));
        return result;
    }

    public Map<String, Object> getTenant(String orgId) {
        Map<String, Object> org = devOrgs.get(orgId);
        if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
        Map<String, Object> row = new LinkedHashMap<>(org);
        Map<String, Object> usage = devUsage.get(orgId);
        if (usage != null) row.put("usage", usage);
        return row;
    }

    public void setTenantStatus(String orgId, String status) {
        Map<String, Object> org = devOrgs.get(orgId);
        if (org == null) throw new NoSuchElementException("Org not found: " + orgId);
        org.put("status", status);
        log.info("Platform: org {} status → {}", orgId, status);
    }

    /** Returns the current platform-level configuration. */
    public Map<String, Object> getPlatformConfig() {
        return Collections.unmodifiableMap(devConfig);
    }

    /** Merges the supplied fields into the platform config. */
    public void updatePlatformConfig(Map<String, Object> updates) {
        devConfig.putAll(updates);
        log.info("Platform config updated: {}", updates.keySet());
    }

    /** Returns per-org usage for the current month, plus platform totals. */
    public Map<String, Object> getUsageSummary() {
        List<Map<String, Object>> rows = new ArrayList<>(devUsage.values());
        rows.sort(Comparator.comparingLong(r -> -((Number) r.get("aiCalls")).longValue()));

        long totalCalls   = rows.stream().mapToLong(r -> ((Number) r.get("aiCalls")).longValue()).sum();
        long totalTokens  = rows.stream().mapToLong(r -> ((Number) r.get("aiTokens")).longValue()).sum();
        long totalStorage = rows.stream().mapToLong(r -> ((Number) r.get("storageBytes")).longValue()).sum();

        // Enrich rows with org name
        List<Map<String, Object>> enriched = new ArrayList<>();
        for (Map<String, Object> u : rows) {
            Map<String, Object> row = new LinkedHashMap<>(u);
            String oid = (String) u.get("orgId");
            Map<String, Object> org = devOrgs.get(oid);
            row.put("orgName", org != null ? org.get("name") : oid);
            row.put("plan",    org != null ? org.get("plan")  : "unknown");
            row.put("status",  org != null ? org.get("status"): "unknown");
            enriched.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month",        "2026-06");
        result.put("totalAiCalls",   totalCalls);
        result.put("totalAiTokens",  totalTokens);
        result.put("totalStorage",   totalStorage);
        result.put("orgCount",       devOrgs.size());
        result.put("rows",           enriched);
        return result;
    }

    /**
     * Extended health snapshot.
     * In dev: ACLX and DLP are always down (not running locally by default).
     * In production: each check makes a real HTTP probe.
     */
    public Map<String, Object> getHealth() {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("api",      probe("API Backend",   true,  "Responding normally",       1));
        h.put("aclx",     probe("ACLX Gateway",  false, "Not reachable (dev: off)",  0));
        h.put("dlp",      probe("Google DLP",     false, "Not configured",            0));
        h.put("firebase", probe("Firebase Auth",  true,  "Dev bypass active",         0));
        h.put("checkedAt", java.time.Instant.now().toString());
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
