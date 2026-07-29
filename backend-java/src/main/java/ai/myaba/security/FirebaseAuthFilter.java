package ai.myaba.security;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Validates the Firebase ID token on every request and populates Spring Security
 * context with the authenticated {@link AppUser}.
 *
 * Custom claims expected in the Firebase token (set by Cloud Function or admin SDK):
 * <pre>
 *   role         – one of the constants in {@link UserRole}
 *   purpose      – treatment | assessment | oversight | scheduling | payment
 *   orgId        – Firestore organization document ID
 *   supervisorId – (RBT / BCBA_STUDENT only) UID of their supervising BCBA
 *   phiAccess    – boolean; true when the user may process PHI. Set at role assignment.
 *                  Absent on legacy tokens — AppUser.hasPhiAccess() falls back to role inference.
 * </pre>
 *
 * Federation: when OIDC/SAML is configured, a Firebase Cloud Function maps the
 * IdP's claims to these custom claims before the token reaches this filter.
 * The filter itself is IdP-agnostic — it only reads the Firebase custom claims.
 *
 * DEV_AUTH=true bypasses token verification entirely and injects a stub TREATING_BCBA
 * user for local development without Firebase credentials.
 */
@Component
@Slf4j
public class FirebaseAuthFilter extends OncePerRequestFilter {

    @Value("${dev.auth-enabled:false}")
    private boolean devAuthEnabled;

    /**
     * Absolute session cap: force re-authentication this many hours after the user's
     * ORIGINAL sign-in, regardless of Firebase's silent hourly token refresh. 0 disables.
     * Complements the client-side inactivity auto-logoff with a server-enforced ceiling.
     */
    @Value("${auth.max-session-hours:12}")
    private int maxSessionHours;

    /** Injected as nullable — will be null when no Firebase credentials are configured. */
    private final com.google.firebase.FirebaseApp firebaseApp;

    public FirebaseAuthFilter(
            @org.springframework.beans.factory.annotation.Autowired(required = false)
            com.google.firebase.FirebaseApp firebaseApp) {
        this.firebaseApp = firebaseApp;
    }

    private static final AppUser DEV_USER = AppUser.builder()
            .uid("dev-user-001")
            .email("admin@myaba.ai")
            .displayName("Chris Hunt")
            .role(UserRole.ORG_SUPER_ADMIN)
            .purpose("treatment")
            .orgId("dev-org-001")
            .supervisorId(null)
            .build();

    /**
     * The Stripe webhook is authenticated by its own signature (not a Firebase
     * token), so skip this filter entirely for it — it must reach the controller
     * with the raw body and no auth context.
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod())
                && "/api/billing/webhook".equals(request.getServletPath());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // Dev mode: use stub user (explicit flag OR no Firebase configured)
        if (devAuthEnabled || firebaseApp == null) {
            if (firebaseApp == null && !devAuthEnabled) {
                log.warn("Firebase not configured — using dev stub user. Set DEV_AUTH=true explicitly for dev mode.");
            }
            setAuthentication(DEV_USER);
            filterChain.doFilter(request, response);
            return;
        }

        // Prefer a custom header so the token survives the Firebase Hosting →
        // Cloud Run edge: a Bearer token in the standard Authorization header is
        // intercepted by Cloud Run's IAM and rejected (403) before reaching the
        // app. Fall back to Authorization: Bearer for local dev / direct calls.
        String token = request.getHeader("X-Firebase-Token");
        if (token == null || token.isBlank()) {
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                token = header.substring(7);
            }
        }
        if (token == null || token.isBlank()) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
            Map<String, Object> claims = decoded.getClaims();

            // Absolute session cap. auth_time is the ORIGINAL login time (epoch seconds)
            // and does NOT advance on Firebase's silent token refresh — only on a real
            // re-authentication. Once the session exceeds the cap, reject with a
            // distinguishable code so the UI can sign the user out and prompt re-login.
            if (maxSessionHours > 0) {
                Object authTimeClaim = claims.get("auth_time");
                long authTime = authTimeClaim instanceof Number n ? n.longValue() : 0L;
                long ageSeconds = (System.currentTimeMillis() / 1000L) - authTime;
                if (authTime > 0 && ageSeconds > (long) maxSessionHours * 3600L) {
                    log.info("Session cap exceeded (age {}h > {}h) — forcing re-auth for uid={}",
                            ageSeconds / 3600, maxSessionHours, decoded.getUid());
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/json");
                    response.getWriter().write(
                            "{\"error\":\"Session expired. Please sign in again.\",\"code\":\"SESSION_EXPIRED\"}");
                    return;
                }
            }

            AppUser user = AppUser.builder()
                    .uid(decoded.getUid())
                    .email(decoded.getEmail())
                    .displayName(decoded.getName())
                    // Least-privilege fallback when a token has no role claim.
                    .role(str(claims, "role", UserRole.GENERAL_STAFF))
                    .purpose(str(claims, "purpose", "treatment"))
                    .orgId(str(claims, "orgId", ""))
                    .supervisorId(str(claims, "supervisorId", null))
                    .phiAccess(bool(claims, "phiAccess"))
                    .build();

            setAuthentication(user);
        } catch (Exception e) {
            log.warn("Invalid Firebase token: {}", e.getMessage());
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid auth token");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private void setAuthentication(AppUser user) {
        var auth = new UsernamePasswordAuthenticationToken(
                user,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole()))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private String str(Map<String, Object> claims, String key, String defaultValue) {
        Object val = claims.get(key);
        return val != null ? val.toString() : defaultValue;
    }

    /** Returns the Boolean value of a claim, or null if absent or not a boolean. */
    private Boolean bool(Map<String, Object> claims, String key) {
        Object val = claims.get(key);
        if (val instanceof Boolean b) return b;
        if (val instanceof String s) return Boolean.parseBoolean(s);
        return null;
    }
}
