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

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

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

    // Bucket maps — one entry per distinct IP / user UID.
    // Acceptable for a healthcare SaaS at typical scale; replace with
    // Caffeine or Redis for multi-instance horizontal scale.
    private final ConcurrentHashMap<String, Bucket> ipBuckets   = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> userBuckets = new ConcurrentHashMap<>();

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

        // ── Per-IP limit ────────────────────────────────────────────────────
        Bucket ipBucket = ipBuckets.computeIfAbsent(sourceIp, k -> buildIpBucket());
        if (!ipBucket.tryConsume(1)) {
            log.warn("Rate limit exceeded [ip={}] path={}", sourceIp, request.getRequestURI());
            rejectTooManyRequests(response, "IP rate limit exceeded. Please slow down.");
            return;
        }

        // ── Per-user limit (only when authenticated) ────────────────────────
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AppUser user) {
            Bucket userBucket = userBuckets.computeIfAbsent(user.getUid(), k -> buildUserBucket());
            if (!userBucket.tryConsume(1)) {
                log.warn("Rate limit exceeded [user={}] path={}", user.getUid(), request.getRequestURI());
                rejectTooManyRequests(response, "User rate limit exceeded. Please slow down.");
                return;
            }
        }

        chain.doFilter(request, response);
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
