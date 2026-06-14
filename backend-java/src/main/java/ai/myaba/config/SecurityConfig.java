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
                // Org creation + invite endpoints must be accessible to authenticated users
                // who don't yet have an orgId (e.g. first-time onboarding, accepting an invite).
                .requestMatchers("/api/orgs").authenticated()
                .requestMatchers("/api/invite/**").authenticated()
                .anyRequest().authenticated()
            )
            // 1. Authenticate via Firebase token
            .addFilterBefore(firebaseAuthFilter, UsernamePasswordAuthenticationFilter.class)
            // 2. Rate-limit after auth so both IP and user identity are available
            .addFilterAfter(rateLimitFilter, FirebaseAuthFilter.class);

        return http.build();
    }
}
