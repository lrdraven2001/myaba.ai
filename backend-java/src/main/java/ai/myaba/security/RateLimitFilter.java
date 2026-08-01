package ai.myaba.security;

import ai.myaba.model.dto.AppUser;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import org.springframework.scheduling.annotation.Scheduled;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Token-bucket rate limiting applied after Firebase authentication, so both
 * the client IP and the authenticated user identity are available.
 *
 * <h3>Two independent limits</h3>
 * <ol>
 *   <li><b>Per-IP</b> — guards against credential stuffing and brute-force
 *       access from a single source, even for requests with valid tokens.
 *       Default: 300 requests per minute.</li>
 *   <li><b>Per-user</b> — guards against API abuse from a single account
 *       (e.g. runaway automation, compromised credential being scraped).
 *       Default: 60 requests per minute.</li>
 * </ol>
 *
 * <h3>Configuration</h3>
 * <pre>
 *   rate-limit.ip.requests-per-minute:   300
 *   rate-limit.user.requests-per-minute: 60
 * </pre>
 *
 * <h3>SOC 2 relevance</h3>
 * Addresses Common Criteria CC6.1 (logical access controls) and CC7.2
 * (system monitoring).  Limits the blast radius of a compromised credential
 * and provides a detectable signal for anomalous automated access patterns.
 *
 * Runs inside the Spring Security filter chain, after {@link FirebaseAuthFilter},
 * so {@code SecurityContextHolder} is fully populated.
 */
@Component
@Slf4j
public class RateLimitFilter extends OncePerRequestFilter {

    @Value("${rate-limit.ip.requests-per-minute:300}")
    private int ipRequestsPerMinute;

    @Value("${rate-limit.user.requests-per-minute:60}")
    private int userRequestsPerMinute;

    @Value("${rate-limit.enabled:true}")
    private boolean rateLimitEnabled;

    // Bucket maps — one entry per distinct IP / user UID. Bounded by idle
    // eviction (see evictIdleBuckets) plus a hard size cap, so IP churn / a
    // distributed flood can't grow these without limit. Per-instance; replace
    // with Caffeine or Redis for multi-instance horizontal scale.
    private static final long IDLE_EVICT_MS   = 10 * 60_000L; // drop buckets unused for 10 min
    private static final int  MAX_BUCKETS     = 100_000;      // hard per-map cap (memory backstop)

    private record Tracked(Bucket bucket, AtomicLong lastAccessMs) {}
    private final ConcurrentHashMap<String, Tracked> ipBuckets   = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Tracked> userBuckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        if (!rateLimitEnabled) {
            chain.doFilter(request, response);
            return;
        }

        String sourceIp = (String) request.getAttribute(RequestCorrelationFilter.ATTR_SOURCE_IP);
        if (sourceIp == null) sourceIp = request.getRemoteAddr();

        long now = System.currentTimeMillis();

        // ── Per-IP limit ────────────────────────────────────────────────────
        Tracked ip = ipBuckets.computeIfAbsent(sourceIp, k -> new Tracked(buildIpBucket(), new AtomicLong()));
        ip.lastAccessMs().set(now);
        if (!ip.bucket().tryConsume(1)) {
            log.warn("Rate limit exceeded [ip={}] path={}", sourceIp, request.getRequestURI());
            rejectTooManyRequests(response, "IP rate limit exceeded. Please slow down.");
            return;
        }

        // ── Per-user limit (only when authenticated) ────────────────────────
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AppUser user) {
            Tracked u = userBuckets.computeIfAbsent(user.getUid(), k -> new Tracked(buildUserBucket(), new AtomicLong()));
            u.lastAccessMs().set(now);
            if (!u.bucket().tryConsume(1)) {
                log.warn("Rate limit exceeded [user={}] path={}", user.getUid(), request.getRequestURI());
                rejectTooManyRequests(response, "User rate limit exceeded. Please slow down.");
                return;
            }
        }

        chain.doFilter(request, response);
    }

    /**
     * Evict idle buckets so the maps stay bounded under IP churn / distributed
     * floods. Runs every 5 minutes: drops entries unused for {@link #IDLE_EVICT_MS},
     * then — as a last-resort memory backstop under an active large-scale flood
     * (100k+ distinct sources in the window) — clears a map that is still over the
     * hard cap. Clearing only resets counters, never bypasses the limit.
     */
    @Scheduled(fixedDelay = 5 * 60_000L)
    void evictIdleBuckets() {
        long cutoff = System.currentTimeMillis() - IDLE_EVICT_MS;
        prune(ipBuckets, cutoff, "ip");
        prune(userBuckets, cutoff, "user");
    }

    private static void prune(ConcurrentHashMap<String, Tracked> map, long cutoff, String label) {
        map.entrySet().removeIf(e -> e.getValue().lastAccessMs().get() < cutoff);
        if (map.size() > MAX_BUCKETS) {
            log.warn("Rate-limit {} bucket map exceeded {} active entries after eviction — clearing (possible flood).",
                    label, MAX_BUCKETS);
            map.clear();
        }
    }

    private Bucket buildIpBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(ipRequestsPerMinute)
                        .refillGreedy(ipRequestsPerMinute, Duration.ofMinutes(1))
                        .build())
                .build();
    }

    private Bucket buildUserBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(userRequestsPerMinute)
                        .refillGreedy(userRequestsPerMinute, Duration.ofMinutes(1))
                        .build())
                .build();
    }

    private void rejectTooManyRequests(HttpServletResponse response, String message) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json");
        response.setHeader("Retry-After", "60");
        response.getWriter().write("{\"error\":\"" + message + "\",\"retryAfterSeconds\":60}");
    }
}
