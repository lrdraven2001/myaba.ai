package ai.myaba.config;

import ai.myaba.security.FirebaseAuthFilter;
import ai.myaba.security.RateLimitFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final FirebaseAuthFilter firebaseAuthFilter;
    private final RateLimitFilter    rateLimitFilter;

    @Value("${cors.allowed-origins:http://localhost:5173}")
    private String allowedOrigins;

    /**
     * CORS for cross-origin calls that go straight to Cloud Run (bypassing the
     * Firebase Hosting proxy, whose ~60s timeout would 502 long AI generations).
     * Wiring CORS into Security is what lets the unauthenticated preflight OPTIONS
     * through — MVC-level CORS alone runs after Security rejects it (403).
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cfg);
        return source;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // CORS preflight must be reachable without authentication.
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/actuator/health", "/api/health").permitAll()
                // Invite preview is public — unauthenticated users need to read org/role
                // before they create an account. Claim requires authentication.
                .requestMatchers(org.springframework.http.HttpMethod.GET,  "/api/invite/*").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/invite/*/claim").authenticated()
                // Org creation accessible to authenticated users without an orgId yet
                .requestMatchers("/api/orgs").authenticated()
                .anyRequest().authenticated()
            )
            // 1. Authenticate via Firebase token
            .addFilterBefore(firebaseAuthFilter, UsernamePasswordAuthenticationFilter.class)
            // 2. Rate-limit after auth so both IP and user identity are available
            .addFilterAfter(rateLimitFilter, FirebaseAuthFilter.class);

        return http.build();
    }
}
