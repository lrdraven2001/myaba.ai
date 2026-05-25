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

    private static final AppUser DEV_USER = AppUser.builder()
            .uid("dev-user-001")
            .email("bcba@myaba.dev")
            .displayName("Dev BCBA")
            .role(UserRole.TREATING_BCBA)
            .purpose("treatment")
            .orgId("dev-org-001")
            .supervisorId(null)
            .build();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (devAuthEnabled) {
            setAuthentication(DEV_USER);
            filterChain.doFilter(request, response);
            return;
        }

        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(7);
        try {
            FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
            Map<String, Object> claims = decoded.getClaims();

            AppUser user = AppUser.builder()
                    .uid(decoded.getUid())
                    .email(decoded.getEmail())
                    .displayName(decoded.getName())
                    .role(str(claims, "role", UserRole.TREATING_BCBA))
                    .purpose(str(claims, "purpose", "treatment"))
                    .orgId(str(claims, "orgId", ""))
                    .supervisorId(str(claims, "supervisorId", null))
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
}
