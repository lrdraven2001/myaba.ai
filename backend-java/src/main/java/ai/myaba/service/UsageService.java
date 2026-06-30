package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tracks AI request usage per organisation per calendar month and enforces
 * plan-based limits.
 *
 * <p>Firestore layout:
 * <pre>
 *   organizations/{orgId}/usage/{YYYY-MM}
 *     requestCount  : long  (total AI calls this period)
 *     chatCount     : long  (calls to /api/chat)
 *     documentCount : long  (calls to /api/generate-document)
 *     period        : String "YYYY-MM"
 *     lastUpdated   : String ISO-8601
 * </pre>
 *
 * <p>Limits are configured in application.yml under {@code usage.limits}.
 * A limit of {@code -1} means unlimited (Enterprise).
 *
 * <p>Design principles:
 * <ul>
 *   <li>Fail-open — if Firestore is unreachable the request is allowed rather
 *       than blocking clinical staff.</li>
 *   <li>Atomic increments — {@link FieldValue#increment} prevents race
 *       conditions under concurrent requests.</li>
 *   <li>Dev mode — no limits enforced; in-memory counters only.</li>
 * </ul>
 */
@Service
@Slf4j
public class UsageService {

    // ── Config ────────────────────────────────────────────────────────────────

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /** Monthly request limit for Solo plan. */
    @Value("${usage.limits.solo:200}")
    private int soloLimit;

    /** Monthly request limit for Team plan. */
    @Value("${usage.limits.team:2000}")
    private int teamLimit;

    /**
     * Monthly request limit for Enterprise plan.
     * -1 means unlimited.
     */
    @Value("${usage.limits.enterprise:-1}")
    private int enterpriseLimit;

    // ── Dev-mode in-memory store ──────────────────────────────────────────────

    /** orgId → total request count this session (dev mode only). */
    private final Map<String, AtomicLong> devStore = new ConcurrentHashMap<>();

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Returns the monthly request limit for the given plan string.
     * Unknown plans default to the Solo limit.
     * Returns -1 for unlimited.
     */
    public int limitForPlan(String plan) {
        if (plan == null) return soloLimit;
        return switch (plan.toLowerCase()) {
            case "enterprise" -> enterpriseLimit;
            case "team"       -> teamLimit;
            default           -> soloLimit;
        };
    }

    /**
     * Check whether the org still has quota remaining for the current period.
     *
     * @return {@code true} if the request should be allowed; {@code false} if
     *         the monthly limit has been reached.
     */
    public boolean isWithinLimit(String orgId) {
        if (devMode) return true; // no enforcement in dev

        try {
            Firestore db = FirestoreClient.getFirestore();

            // Read plan from org document
            var orgSnap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
            if (!orgSnap.exists()) {
                log.warn("Usage check: org {} not found — allowing", orgId);
                return true;
            }
            String plan      = orgSnap.getString("plan");
            int    planLimit  = limitForPlan(plan);

            // Enterprise orgs may have a custom spending cap set by their admin
            int effectiveLimit = planLimit;
            if ("enterprise".equalsIgnoreCase(plan)) {
                Long override = orgSnap.getLong("usageLimitOverride");
                if (override != null && override > 0) {
                    effectiveLimit = override.intValue();
                }
            }
            if (effectiveLimit < 0) return true; // unlimited

            // Read current month usage
            String period = currentPeriod();
            var usageSnap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("usage").document(period).get().get();

            long count = 0L;
            if (usageSnap.exists()) {
                Long stored = usageSnap.getLong("requestCount");
                count = stored != null ? stored : 0L;
            }

            if (count >= effectiveLimit) {
                log.info("Usage limit reached: org={} plan={} count={} effectiveLimit={} period={}",
                        orgId, plan, count, effectiveLimit, period);
                return false;
            }
            return true;

        } catch (Exception e) {
            // Fail-open — never block clinical staff due to a monitoring outage
            log.warn("Usage limit check failed for org {} (fail-open): {}", orgId, e.getMessage());
            return true;
        }
    }

    /**
     * Record one successful AI request for the org.
     * Uses atomic {@link FieldValue#increment} — safe under concurrent calls.
     * Non-fatal: failures are logged but never propagated to the caller.
     *
     * @param orgId org tenancy boundary
     * @param type  {@code "chat"} or {@code "document"}
     */
    public void recordRequest(String orgId, String type) {
        if (devMode) {
            devStore.computeIfAbsent(orgId, k -> new AtomicLong(0)).incrementAndGet();
            log.debug("Dev usage recorded: org={} type={} total={}",
                    orgId, type, devStore.get(orgId).get());
            return;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            String period = currentPeriod();

            String typeCountKey = "document".equals(type) ? "documentCount" : "chatCount";

            Map<String, Object> updates = new HashMap<>();
            updates.put("requestCount", FieldValue.increment(1));
            updates.put(typeCountKey,   FieldValue.increment(1));
            updates.put("period",       period);
            updates.put("lastUpdated",  TimestampUtil.now());

            // set+merge creates the document if it doesn't exist, or merges into
            // the existing one — FieldValue.increment starts from 0 on a new field
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("usage").document(period)
                    .set(updates, SetOptions.merge())
                    .get();

        } catch (Exception e) {
            log.warn("Failed to record AI request for org {}: {}", orgId, e.getMessage());
            // Non-fatal — never fail the response over a usage tracking failure
        }
    }

    /**
     * Return the current-period usage summary for an org.
     * Used by the admin API and settings UI.
     */
    public Map<String, Object> getUsageSummary(String orgId) {
        String period = currentPeriod();

        if (devMode) {
            long count = devStore.getOrDefault(orgId, new AtomicLong(0)).get();
            Map<String, Object> devResult = new HashMap<>();
            devResult.put("period",            period);
            devResult.put("plan",              "dev");
            devResult.put("limit",             -1);
            devResult.put("effectiveLimit",    -1);
            devResult.put("unlimited",         true);
            devResult.put("canSetCustomLimit", false);
            devResult.put("requestCount",      count);
            devResult.put("chatCount",         0L);
            devResult.put("documentCount",     0L);
            devResult.put("remaining",         -1L);
            return devResult;
        }

        try {
            Firestore db = FirestoreClient.getFirestore();

            var orgSnap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
            String plan        = orgSnap.exists() ? orgSnap.getString("plan") : "solo";
            int    planLimit   = limitForPlan(plan);
            boolean isEnterprise = "enterprise".equalsIgnoreCase(plan);

            // Enterprise spending cap — admin-configurable via PUT /api/usage/limit
            Long customLimitOverride = orgSnap.exists() ? orgSnap.getLong("usageLimitOverride") : null;
            int effectiveLimit = planLimit;
            if (isEnterprise && customLimitOverride != null && customLimitOverride > 0) {
                effectiveLimit = customLimitOverride.intValue();
            }

            var usageSnap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("usage").document(period).get().get();

            Map<String, Object> result = new HashMap<>();
            result.put("period",            period);
            result.put("plan",              plan);
            result.put("limit",             planLimit);       // raw plan ceiling
            result.put("effectiveLimit",    effectiveLimit);  // what's actually enforced
            result.put("unlimited",         effectiveLimit < 0);
            result.put("canSetCustomLimit", isEnterprise);

            // Include custom cap in response when set
            if (isEnterprise && customLimitOverride != null && customLimitOverride > 0) {
                result.put("customLimit", customLimitOverride);
            }

            if (usageSnap.exists()) {
                result.put("requestCount",  longOrZero(usageSnap, "requestCount"));
                result.put("chatCount",     longOrZero(usageSnap, "chatCount"));
                result.put("documentCount", longOrZero(usageSnap, "documentCount"));
                result.put("lastUpdated",   usageSnap.getString("lastUpdated"));
            } else {
                result.put("requestCount",  0L);
                result.put("chatCount",     0L);
                result.put("documentCount", 0L);
            }

            // Convenience: remaining quota (-1 if unlimited)
            if (effectiveLimit >= 0) {
                long used = (long) result.get("requestCount");
                result.put("remaining", Math.max(0L, effectiveLimit - used));
            } else {
                result.put("remaining", -1L);
            }

            return result;

        } catch (Exception e) {
            log.error("Failed to get usage summary for org {}: {}", orgId, e.getMessage());
            return Map.of("error", "Failed to fetch usage data", "period", period);
        }
    }

    /**
     * Return up to {@code months} most-recent monthly usage records for an org,
     * oldest-first (suitable for a trend chart). Each entry has {@code period}
     * (YYYY-MM), {@code requestCount}, {@code chatCount}, {@code documentCount}.
     *
     * <p>Reads the {@code organizations/{orgId}/usage} subcollection — the same
     * per-period documents written by {@link #recordRequest}.
     */
    public java.util.List<Map<String, Object>> getUsageHistory(String orgId, int months) {
        int limit = months <= 0 ? 12 : Math.min(months, 36);

        if (devMode) {
            Map<String, Object> only = new java.util.LinkedHashMap<>();
            only.put("period",        currentPeriod());
            only.put("requestCount",  devStore.getOrDefault(orgId, new AtomicLong(0)).get());
            only.put("chatCount",     0L);
            only.put("documentCount", 0L);
            return java.util.List.of(only);
        }

        try {
            Firestore db = FirestoreClient.getFirestore();
            var snaps = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("usage")
                    .orderBy("period", com.google.cloud.firestore.Query.Direction.DESCENDING)
                    .limit(limit)
                    .get().get().getDocuments();

            java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
            for (var s : snaps) {
                Map<String, Object> m = new java.util.LinkedHashMap<>();
                m.put("period",        s.getId());            // doc id == period (YYYY-MM)
                m.put("requestCount",  longOrZero(s, "requestCount"));
                m.put("chatCount",     longOrZero(s, "chatCount"));
                m.put("documentCount", longOrZero(s, "documentCount"));
                out.add(m);
            }
            java.util.Collections.reverse(out); // oldest → newest for charting
            return out;

        } catch (Exception e) {
            log.error("Failed to get usage history for org {}: {}", orgId, e.getMessage());
            return java.util.List.of();
        }
    }

    /**
     * Set (or clear) a custom monthly request cap for an enterprise org.
     *
     * <p>Enterprise plans are unlimited by default; this lets admins set an
     * internal spending ceiling (useful when billed at base fee + per-request cost).
     *
     * <p>Pass {@code limit <= 0} to remove the cap and revert to unlimited.
     *
     * @throws IllegalArgumentException if the org is not on an enterprise plan
     * @throws java.util.NoSuchElementException if the org document does not exist
     * @throws Exception on any Firestore error
     */
    public void setCustomLimit(String orgId, int limit) throws Exception {
        Firestore db = FirestoreClient.getFirestore();

        var orgSnap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).get().get();
        if (!orgSnap.exists()) {
            throw new java.util.NoSuchElementException("Org not found: " + orgId);
        }
        String plan = orgSnap.getString("plan");
        if (!"enterprise".equalsIgnoreCase(plan)) {
            throw new IllegalArgumentException(
                    "Custom usage limits are an enterprise feature. Current plan: " + plan);
        }

        Map<String, Object> update = new HashMap<>();
        if (limit > 0) {
            update.put("usageLimitOverride", (long) limit);
        } else {
            // Remove the override — revert to unlimited
            update.put("usageLimitOverride", FieldValue.delete());
        }
        db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .set(update, SetOptions.merge())
                .get();

        log.info("Usage limit override {}: org={} limit={}",
                limit > 0 ? "set" : "cleared", orgId, limit > 0 ? limit : "—");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Current billing period as {@code YYYY-MM} in UTC. */
    private String currentPeriod() {
        return YearMonth.now(ZoneOffset.UTC).toString();
    }

    private long longOrZero(com.google.cloud.firestore.DocumentSnapshot snap, String field) {
        Long v = snap.getLong(field);
        return v != null ? v : 0L;
    }
}
