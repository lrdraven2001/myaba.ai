package ai.myaba.service.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * Shared HTTP + Google ADC plumbing used by every {@link LlmProvider}.
 *
 * <p>Kept provider-agnostic so {@code GeminiService} and any future provider reuse
 * the same connection handling and short-lived credential minting instead of
 * duplicating it.
 */
@Component
@RequiredArgsConstructor
public class LlmHttpSupport {

    private final ObjectMapper mapper;

    /**
     * Build the Vertex AI hostname for the given region.
     *
     * <p>The global endpoint uses a region-less hostname
     * ({@code aiplatform.googleapis.com}) with {@code global} as the location path
     * segment. Regional endpoints prefix the hostname with the region
     * (e.g. {@code us-east5-aiplatform.googleapis.com}).
     */
    public String vertexHost(String location) {
        return "global".equalsIgnoreCase(location)
                ? "aiplatform.googleapis.com"
                : "%s-aiplatform.googleapis.com".formatted(location);
    }

    /**
     * Obtain a short-lived Google OAuth2 access token via Application Default
     * Credentials. On Cloud Run the attached service account is used automatically;
     * locally, {@code gcloud auth application-default login} provides ADC.
     *
     * <p>The {@code google-auth-library-oauth2-http} artifact is a transitive
     * dependency of {@code firebase-admin} — no extra pom.xml entry needed.
     */
    public String googleAccessToken() throws IOException {
        GoogleCredentials credentials = GoogleCredentials
                .getApplicationDefault()
                .createScoped(Collections.singletonList(
                        "https://www.googleapis.com/auth/cloud-platform"));
        credentials.refreshIfExpired();
        return credentials.getAccessToken().getTokenValue();
    }

    /**
     * Open a POST connection for a JSON request.
     *
     * @param endpoint    full URL
     * @param bearerToken value for the {@code Authorization} header, or {@code null}
     */
    public HttpURLConnection openConnection(String endpoint,
                                            String bearerToken) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(120_000);   // long timeout: large context windows
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        if (bearerToken != null) {
            conn.setRequestProperty("Authorization", bearerToken);
        }
        return conn;
    }

    public void sendBody(HttpURLConnection conn, Object body) throws IOException {
        byte[] payload = mapper.writeValueAsBytes(body);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(payload);
        }
    }

    public String readResponse(HttpURLConnection conn, int status) throws IOException {
        byte[] bytes = (status == 200)
                ? conn.getInputStream().readAllBytes()
                : conn.getErrorStream().readAllBytes();
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
