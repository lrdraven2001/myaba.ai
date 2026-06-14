package ai.myaba.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Assigns a unique correlation ID to every inbound request and propagates it
 * through the full request/response lifecycle.
 *
 * <h3>What it does</h3>
 * <ul>
 *   <li>Generates a UUID correlation ID (or honours a pre-existing
 *       {@code X-Correlation-Id} header from an upstream proxy/gateway).</li>
 *   <li>Stores the correlation ID in the SLF4J MDC so it appears in every
 *       log line for the duration of this request thread.</li>
 *   <li>Stores the client IP in MDC for log correlation.</li>
 *   <li>Exposes both as request attributes so downstream services
 *       (AuditService, error handlers) can read them without touching MDC.</li>
 *   <li>Sets {@code X-Correlation-Id} on the response so clients can link
 *       API errors to support tickets.</li>
 * </ul>
 *
 * <h3>SOC 2 relevance</h3>
 * Provides the traceability chain required by the Common Criteria:
 * every audit event, log line, and API error can be correlated to a single
 * inbound request, the user who made it, and the IP it came from.
 *
 * Runs at {@link Ordered#HIGHEST_PRECEDENCE} so the correlation ID is in MDC
 * before any other filter or Spring Security component logs anything.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@Slf4j
public class RequestCorrelationFilter extends OncePerRequestFilter {

    public static final String ATTR_CORRELATION_ID = "X-Correlation-Id";
    public static final String ATTR_SOURCE_IP      = "X-Source-IP";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        String correlationId = request.getHeader(ATTR_CORRELATION_ID);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }

        String sourceIp = extractClientIp(request);

        // Store for downstream use
        request.setAttribute(ATTR_CORRELATION_ID, correlationId);
        request.setAttribute(ATTR_SOURCE_IP, sourceIp);

        // Add to MDC so every log line for this thread carries them
        MDC.put("correlationId", correlationId);
        MDC.put("sourceIp", sourceIp);

        // Echo back so clients can reference for support
        response.setHeader(ATTR_CORRELATION_ID, correlationId);

        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove("correlationId");
            MDC.remove("sourceIp");
        }
    }

    /**
     * Returns the real client IP, handling common reverse-proxy headers.
     * Prefers {@code X-Forwarded-For} (first hop) over {@code X-Real-IP}
     * over the direct remote address.
     */
    private String extractClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            // X-Forwarded-For can be a comma-separated list; first entry is the original client
            return xff.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
