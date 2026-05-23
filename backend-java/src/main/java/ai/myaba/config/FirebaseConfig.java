package ai.myaba.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Configuration
@Slf4j
public class FirebaseConfig {

    @Value("${firebase.project-id:}")
    private String projectId;

    @Value("${firebase.service-account-path:}")
    private String serviceAccountPath;

    @Value("${firebase.client-email:}")
    private String clientEmail;

    @Value("${firebase.private-key:}")
    private String privateKey;

    @Value("${dev.auth-enabled:false}")
    private boolean devAuthEnabled;

    @Bean
    public FirebaseApp firebaseApp() throws Exception {
        if (FirebaseApp.getApps().size() > 0) {
            return FirebaseApp.getInstance();
        }

        if (devAuthEnabled) {
            log.warn("DEV_AUTH=true — Firebase auth is disabled. DO NOT use in production.");
            // Initialize with Application Default Credentials if available,
            // otherwise skip — auth filter won't call Firebase anyway.
            try {
                FirebaseOptions options = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.getApplicationDefault())
                        .setProjectId(projectId.isBlank() ? "dev-project" : projectId)
                        .build();
                return FirebaseApp.initializeApp(options);
            } catch (Exception e) {
                log.warn("No ADC found in dev mode — Firebase will not be initialized.");
                return null;
            }
        }

        GoogleCredentials credentials;

        if (!serviceAccountPath.isBlank()) {
            // Local testing: point to a downloaded service account JSON file
            log.info("Loading Firebase credentials from file: {}", serviceAccountPath);
            try (InputStream is = new FileInputStream(serviceAccountPath)) {
                credentials = GoogleCredentials.fromStream(is);
            }
        } else if (!clientEmail.isBlank() && !privateKey.isBlank()) {
            // Cloud Run: credentials supplied as env vars
            log.info("Loading Firebase credentials from environment variables");
            String json = buildServiceAccountJson(projectId, clientEmail,
                    privateKey.replace("\\n", "\n"));
            try (InputStream is = new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8))) {
                credentials = ServiceAccountCredentials.fromStream(is);
            }
        } else {
            // Fall back to Application Default Credentials (Workload Identity on Cloud Run)
            log.info("Using Application Default Credentials for Firebase");
            credentials = GoogleCredentials.getApplicationDefault();
        }

        FirebaseOptions options = FirebaseOptions.builder()
                .setCredentials(credentials)
                .setProjectId(projectId)
                .build();

        return FirebaseApp.initializeApp(options);
    }

    private String buildServiceAccountJson(String project, String email, String key) {
        return """
                {
                  "type": "service_account",
                  "project_id": "%s",
                  "client_email": "%s",
                  "private_key": "%s",
                  "token_uri": "https://oauth2.googleapis.com/token"
                }
                """.formatted(project, email, key.replace("\n", "\\n"));
    }
}
