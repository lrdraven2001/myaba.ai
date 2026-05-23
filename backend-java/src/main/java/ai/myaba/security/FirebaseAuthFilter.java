package ai.myaba.security;

import ai.myaba.model.dto.AppUser;
import com.google.firebase.FirebaseApp;
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

@Component
@Slf4j
public class FirebaseAuthFilter extends OncePerRequestFilter {

    @Value("${dev.auth-enabled:false}")
    private boolean devAuthEnabled;

    private static final AppUser DEV_USER = AppUser.builder()
            .uid("dev-user-001")
            .email("bcba@myaba.dev")
            .role("TREATING_BCBA")
            .purpose("treatment")
            .orgId("dev-org-001")
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
                    .role(getClaimString(claims, "role", "TREATING_BCBA"))
                    .purpose(getClaimString(claims, "purpose", "treatment"))
                    .orgId(getClaimString(claims, "orgId", ""))
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

    private String getClaimString(Map<String, Object> claims, String key, String defaultValue) {
        Object val = claims.get(key);
        return val != null ? val.toString() : defaultValue;
    }
}
