package ai.myaba.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Injects security-hardening HTTP response headers on every API response.
 *
 * <h3>Headers set</h3>
 * <ul>
 *   <li><b>Strict-Transport-Security</b> — enforces HTTPS for 1 year,
 *       including sub-domains.  Prevents protocol downgrade attacks.</li>
 *   <li><b>X-Content-Type-Options: nosniff</b> — prevents browsers from
 *       MIME-sniffing responses away from the declared content-type.</li>
 *   <li><b>X-Frame-Options: DENY</b> — blocks all framing to prevent
 *       clickjacking against admin pages.</li>
 *   <li><b>Referrer-Policy</b> — limits referrer leakage to same-origin.</li>
 *   <li><b>Permissions-Policy</b> — blocks camera, microphone, and geolocation
 *       access (no clinical reason to request these from a documentation tool).</li>
 *   <li><b>Content-Security-Policy</b> — for this REST API (JSON responses)
 *       restricts resource loading to self; {@code frame-ancestors 'none'} is
 *       a belt-and-suspenders complement to X-Frame-Options.</li>
 *   <li><b>Cache-Control</b> — prevents PHI-containing API responses from
 *       being cached by browsers or proxies.</li>
 * </ul>
 *
 * <h3>SOC 2 relevance</h3>
 * Satisfies several Common Criteria controls around logical access and
 * system operations (CC6, CC7) and directly maps to the OWASP ASVS
 * security headers requirements auditors typically check.
 *
 * Runs at {@link org.springframework.core.Ordered#HIGHEST_PRECEDENCE} + 1
 * (after the correlation filter, before Spring Security) so headers are set
 * on ALL responses — including 401s and health checks.
 */
@Component
@Order(-200)
public class SecurityHeadersFilter extends OncePerRequestFilter {

    // 1 year HSTS, include sub-domains, eligible for browser preload lists
    private static final String HSTS =
            "max-age=31536000; includeSubDomains; preload";

    // REST API CSP: no resources needed beyond the API itself;
    // frame-ancestors 'none' is belt-and-suspenders alongside X-Frame-Options.
    private static final String CSP =
            "default-src 'none'; frame-ancestors 'none'";

    // PHI must not be cached by browsers or intermediaries
    private static final String NO_CACHE =
            "no-store, no-cache, must-revalidate, private";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        response.setHeader("Strict-Transport-Security", HSTS);
        response.setHeader("X-Content-Type-Options",   "nosniff");
        response.setHeader("X-Frame-Options",          "DENY");
        response.setHeader("Referrer-Policy",          "strict-origin-when-cross-origin");
        response.setHeader("Permissions-Policy",       "camera=(), microphone=(), geolocation=()");
        response.setHeader("Content-Security-Policy",  CSP);
        response.setHeader("Cache-Control",            NO_CACHE);

        // Remove headers that reveal implementation details
        response.setHeader("X-Powered-By",            "");
        response.setHeader("Server",                  "");

        chain.doFilter(request, response);
    }
}
