package ai.myaba.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * AI generation service — calls Claude via either:
 *
 * <ul>
 *   <li><b>Anthropic direct</b> ({@code ai.provider=anthropic}): uses {@code ANTHROPIC_API_KEY}.
 *       Suitable for local development; requires a separate Anthropic BAA for PHI.</li>
 *   <li><b>Vertex AI</b> ({@code ai.provider=vertex}, default in production): uses Google
 *       Application Default Credentials (ADC).  On Cloud Run the attached service account
 *       is picked up automatically — no key files required.  Google Cloud's BAA covers
 *       Vertex AI, so no separate Anthropic BAA is needed.</li>
 * </ul>
 *
 * <h3>Vertex AI setup</h3>
 * <ol>
 *   <li>Enable Vertex AI API in the GCP project.</li>
 *   <li>Enable the Claude model family in Vertex AI Model Garden.</li>
 *   <li>Attach a service account to the Cloud Run revision with the
 *       {@code roles/aiplatform.user} IAM role.</li>
 *   <li>Set {@code VERTEX_PROJECT_ID} and optionally {@code VERTEX_LOCATION} /
 *       {@code VERTEX_MODEL} env vars on Cloud Run.</li>
 * </ol>
 *
 * <h3>Local dev with Vertex AI</h3>
 * Run {@code gcloud auth application-default login} once.  ADC picks up the
 * developer's credentials automatically.  No service account key needed locally.
 *
 * <h3>BAA position</h3>
 * When {@code ai.provider=vertex} Cloud Run, Firebase Auth, Firestore, and Vertex AI
 * are all covered by a single Google Cloud BAA.  ACLX output governance (the
 * /evaluate call) does not touch PHI directly — it evaluates the AI output, not
 * the raw patient record — so the ACLX vendor relationship is a Business Associate
 * arrangement but at a lower data sensitivity tier.
 */
@Service
@Slf4j
public class ClaudeService {

    private static final String BCBA_SYSTEM_PROMPT = """
            You are an expert BCBA (Board Certified Behavior Analyst) clinical documentation \
            assistant for the myABA.ai platform. You help generate high-quality, evidence-based \
            ABA clinical documents including Behavior Intervention Plans (BIPs), Functional \
            Behavior Assessments (FBAs), and progress notes.

            Guidelines:
            - Follow BACB professional standards
            - Use behavioral terminology accurately (operational definitions, ABC analysis, etc.)
            - Structure documents according to accepted clinical formats
            - Be specific and measurable in all behavioral descriptions
            - All client context provided is de-identified; do not re-identify or infer personal details
            - If insufficient clinical information is provided, ask clarifying questions

            Formatting rules (strictly enforced):
            - Do NOT use emoji, icons, unicode symbols, or decorative characters of any kind
            - Use plain text and standard punctuation only
            - Use numbered lists or bullet points (- or *) for structured content
            - Do NOT use markdown bold (**text**) or italic (*text*) — use plain text labels instead
            - Do NOT use markdown headers (##, ###) — use ALL CAPS labels like "SECTION:" instead
            - Keep responses professional and clinical in tone
            """;

    private static final Map<String, String> DOCUMENT_PROMPTS = Map.of(
        "bip", """
            Generate a comprehensive Behavior Intervention Plan (BIP) following BACB guidelines.
            Include:
            1. Target behaviors with operational definitions
            2. Functional behavior assessment summary
            3. Replacement behaviors and rationale
            4. Intervention strategies (antecedent modifications, teaching, consequence strategies)
            5. Data collection procedures
            6. Crisis management protocol
            7. Generalization and maintenance plan
            """,
        "fba", """
            Generate a Functional Behavior Assessment (FBA) following BACB guidelines.
            Include:
            1. Reason for referral and background
            2. Assessment methods used
            3. Behavioral description (topography, frequency, intensity, duration)
            4. Antecedent analysis (setting events, immediate antecedents)
            5. Consequence analysis
            6. Hypothesized function(s) of behavior
            7. Summary statements and recommendations
            """,
        "progress_note", """
            Generate an ABA session progress note.
            Include:
            1. Session date, duration, and setting
            2. Goals targeted and programs run
            3. Data summary (% correct, trials, rate)
            4. Client behavior and engagement
            5. Prompting and reinforcement strategies used
            6. Notable events or behavioral observations
            7. Plan for next session
            """
    );

    // ── AI provider selection ──────────────────────────────────────────────────

    /** {@code vertex} (production) or {@code anthropic} (dev fallback). */
    private final String aiProvider;

    // ── Anthropic direct config ────────────────────────────────────────────────
    private final String anthropicApiKey;
    private final String anthropicBaseUrl;

    // ── Vertex AI config ───────────────────────────────────────────────────────
    /** GCP project ID — required when ai.provider=vertex. */
    private final String vertexProjectId;
    /** Vertex AI region, e.g. us-east5, us-central1. */
    private final String vertexLocation;
    /**
     * Vertex AI Claude model name in {@code model@version} format.
     * Examples: {@code claude-opus-4-5@20250514}, {@code claude-sonnet-4-5@20251022}.
     * Find current names at: Vertex AI Model Garden → Anthropic Claude.
     */
    private final String vertexModel;

    // ── Shared config ──────────────────────────────────────────────────────────
    private final int maxTokens;
    private final ObjectMapper mapper;

    public ClaudeService(
            ObjectMapper mapper,
            @Value("${ai.provider:vertex}")              String aiProvider,
            @Value("${anthropic.api-key:}")              String anthropicApiKey,
            @Value("${anthropic.base-url:https://api.anthropic.com}") String anthropicBaseUrl,
            @Value("${vertex.project-id:}")              String vertexProjectId,
            @Value("${vertex.location:us-east5}")        String vertexLocation,
            @Value("${vertex.model:claude-opus-4-5@20250514}") String vertexModel,
            @Value("${anthropic.max-tokens:4000}")       int maxTokens) {
        this.mapper           = mapper;
        this.aiProvider       = aiProvider;
        this.anthropicApiKey  = anthropicApiKey;
        this.anthropicBaseUrl = anthropicBaseUrl;
        this.vertexProjectId  = vertexProjectId;
        this.vertexLocation   = vertexLocation;
        this.vertexModel      = vertexModel;
        this.maxTokens        = maxTokens;

        log.info("ClaudeService initialized: provider={} model={}",
                aiProvider,
                "vertex".equalsIgnoreCase(aiProvider) ? vertexModel : "claude (direct)");
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    public String generateDocument(String documentType, String clientContext, String additionalContext) {
        String typePrompt = DOCUMENT_PROMPTS.getOrDefault(documentType,
                "Generate a clinical ABA document based on the provided context.");

        String userContent = """
                CLIENT CONTEXT (de-identified):
                %s

                ADDITIONAL CONTEXT FROM CLINICIAN:
                %s

                %s
                """.formatted(
                clientContext,
                additionalContext != null ? additionalContext : "None provided",
                typePrompt);

        return callMessages(BCBA_SYSTEM_PROMPT, List.of(
                Map.of("role", "user", "content", userContent)
        ));
    }

    public String chat(String systemPrompt, List<Map<String, String>> messages) {
        return callMessages(
                systemPrompt != null ? systemPrompt : BCBA_SYSTEM_PROMPT,
                messages
        );
    }

    // ── Dispatch ───────────────────────────────────────────────────────────────

    private String callMessages(String system, List<Map<String, String>> messages) {
        if ("vertex".equalsIgnoreCase(aiProvider)) {
            return callVertexAi(system, messages);
        }
        return callAnthropicDirect(system, messages);
    }

    // ── Vertex AI (production / BAA path) ─────────────────────────────────────

    /**
     * Call Claude via Vertex AI rawPredict.
     *
     * <p>Endpoint:
     * {@code https://{location}-aiplatform.googleapis.com/v1/projects/{projectId}/
     * locations/{location}/publishers/anthropic/models/{model}:rawPredict}
     *
     * <p>The request body is the same JSON structure as Anthropic's Messages API.
     * Auth is a short-lived Bearer token obtained from Google ADC — no API key.
     *
     * <p>On Cloud Run, the service account attached to the revision provides
     * credentials automatically.  Locally, {@code gcloud auth application-default login}
     * sets up ADC in {@code ~/.config/gcloud/application_default_credentials.json}.
     */
    @SuppressWarnings("unchecked")
    private String callVertexAi(String system, List<Map<String, String>> messages) {
        if (vertexProjectId == null || vertexProjectId.isBlank()) {
            throw new IllegalStateException(
                    "ai.provider=vertex but VERTEX_PROJECT_ID is not set. " +
                    "Set it in application.yml or as a Cloud Run env var.");
        }
        try {
            String token    = getGoogleAccessToken();
            String endpoint = "https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s"
                    .formatted(vertexLocation, vertexProjectId, vertexLocation)
                    + "/publishers/anthropic/models/%s:rawPredict".formatted(vertexModel);

            // rawPredict body: same JSON as Anthropic Messages API.
            // The model field is encoded in the URL; including it in the body is optional.
            Map<String, Object> body = Map.of(
                    "anthropic_version", "vertex-2023-10-16",
                    "max_tokens", maxTokens,
                    "system", system,
                    "messages", messages
            );

            HttpURLConnection conn = openConnection(endpoint, "Bearer " + token, null);
            sendBody(conn, body);

            int status = conn.getResponseCode();
            String responseBody = readResponse(conn, status);

            if (status != 200) {
                log.error("Vertex AI Claude error {}: {}", status, responseBody);
                throw new RuntimeException("Vertex AI returned HTTP " + status + ": " + responseBody);
            }

            Map<?, ?> parsed = mapper.readValue(responseBody, Map.class);
            List<?> content  = (List<?>) parsed.get("content");
            Map<?, ?> first  = (Map<?, ?>) content.get(0);
            return first.get("text").toString();

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Vertex AI call failed: " + e.getMessage(), e);
        }
    }

    /**
     * Obtain a short-lived Google OAuth2 access token via Application Default Credentials.
     *
     * <p>The {@code google-auth-library-oauth2-http} artifact is a transitive dependency
     * of {@code firebase-admin} — no extra pom.xml entry is needed.
     *
     * <p>Tokens are valid for ~1 hour; {@code refreshIfExpired()} handles renewal.
     */
    private String getGoogleAccessToken() throws IOException {
        GoogleCredentials credentials = GoogleCredentials
                .getApplicationDefault()
                .createScoped(Collections.singletonList(
                        "https://www.googleapis.com/auth/cloud-platform"));
        credentials.refreshIfExpired();
        return credentials.getAccessToken().getTokenValue();
    }

    // ── Anthropic direct (local dev) ───────────────────────────────────────────

    /**
     * Call Anthropic's API directly using an API key.
     * Use for local development only — PHI must not flow through this path in production
     * unless a separate Anthropic BAA is in place.
     */
    @SuppressWarnings("unchecked")
    private String callAnthropicDirect(String system, List<Map<String, String>> messages) {
        if (anthropicApiKey == null || anthropicApiKey.isBlank()) {
            throw new IllegalStateException(
                    "ai.provider=anthropic but ANTHROPIC_API_KEY is not set. " +
                    "For production use ai.provider=vertex (no API key needed).");
        }
        try {
            String endpoint = anthropicBaseUrl + "/v1/messages";

            Map<String, Object> body = Map.of(
                    "model", "claude-opus-4-5",   // model embedded in body for direct API
                    "max_tokens", maxTokens,
                    "system", system,
                    "messages", messages
            );

            HttpURLConnection conn = openConnection(endpoint, null, anthropicApiKey);
            sendBody(conn, body);

            int status = conn.getResponseCode();
            String responseBody = readResponse(conn, status);

            if (status != 200) {
                log.error("Anthropic API error {}: {}", status, responseBody);
                throw new RuntimeException("Anthropic API returned HTTP " + status + ": " + responseBody);
            }

            Map<?, ?> parsed = mapper.readValue(responseBody, Map.class);
            List<?> content  = (List<?>) parsed.get("content");
            Map<?, ?> first  = (Map<?, ?>) content.get(0);
            return first.get("text").toString();

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Anthropic API call failed: " + e.getMessage(), e);
        }
    }

    // ── HTTP helpers ───────────────────────────────────────────────────────────

    private HttpURLConnection openConnection(String endpoint,
                                             String bearerToken,
                                             String apiKey) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(120_000);   // long timeout: Claude 200k context window
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        if (bearerToken != null) {
            conn.setRequestProperty("Authorization", bearerToken);
        }
        if (apiKey != null) {
            conn.setRequestProperty("x-api-key", apiKey);
            conn.setRequestProperty("anthropic-version", "2023-06-01");
        }
        return conn;
    }

    private void sendBody(HttpURLConnection conn, Object body) throws IOException {
        byte[] payload = mapper.writeValueAsBytes(body);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(payload);
        }
    }

    private String readResponse(HttpURLConnection conn, int status) throws IOException {
        byte[] bytes = (status == 200)
                ? conn.getInputStream().readAllBytes()
                : conn.getErrorStream().readAllBytes();
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
