package ai.myaba.config;

import ai.myaba.security.FirebaseAuthFilter;
import ai.myaba.security.RateLimitFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final FirebaseAuthFilter firebaseAuthFilter;
    private final RateLimitFilter    rateLimitFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
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
