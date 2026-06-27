package ai.myaba.service;

import ai.myaba.service.llm.LlmHttpSupport;
import ai.myaba.service.llm.LlmProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.HttpURLConnection;
import java.util.List;
import java.util.Map;

/**
 * Claude transport — calls Claude via either:
 *
 * <ul>
 *   <li><b>Vertex AI</b> ({@code ai.provider=vertex}): uses Google Application
 *       Default Credentials (ADC). On Cloud Run the attached service account is
 *       picked up automatically — no key files required. Google Cloud's BAA covers
 *       Vertex AI, so no separate Anthropic BAA is needed.</li>
 *   <li><b>Anthropic direct</b> ({@code ai.provider=anthropic}): uses
 *       {@code ANTHROPIC_API_KEY}. Suitable for local development; requires a
 *       separate Anthropic BAA for PHI.</li>
 * </ul>
 *
 * <p>This is a pure {@link LlmProvider} transport — it holds no prompt templates or
 * document orchestration (that lives in {@link AiService}). It is always available
 * as a bean; whether it is the <em>active</em> provider depends on
 * {@code ai.provider}. To switch back to Claude at any time, set
 * {@code AI_PROVIDER=vertex} (or {@code anthropic}) — no code changes needed.
 *
 * <h3>Vertex AI setup</h3>
 * <ol>
 *   <li>Enable Vertex AI API in the GCP project.</li>
 *   <li>Enable the Claude model family in Vertex AI Model Garden.</li>
 *   <li>Attach a service account to the Cloud Run revision with the
 *       {@code roles/aiplatform.user} IAM role.</li>
 *   <li>Set {@code VERTEX_PROJECT_ID} and optionally {@code VERTEX_LOCATION} /
 *       {@code VERTEX_MODEL} env vars.</li>
 * </ol>
 */
@Service
@Slf4j
public class ClaudeService implements LlmProvider {

    /** {@code vertex} (Vertex AI) or {@code anthropic} (direct API). */
    private final String aiProvider;

    // ── Anthropic direct config ────────────────────────────────────────────────
    private final String anthropicApiKey;
    private final String anthropicBaseUrl;

    // ── Vertex AI config ───────────────────────────────────────────────────────
    /** GCP project ID — required when ai.provider=vertex. */
    private final String vertexProjectId;
    /** Vertex AI region, e.g. us-east5, us-central1, global. */
    private final String vertexLocation;
    /**
     * Vertex AI Claude model name in {@code model@version} format.
     * Examples: {@code claude-sonnet-4@20250514}, {@code claude-sonnet-4-6@default}.
     * Find current names at: Vertex AI Model Garden → Anthropic Claude.
     */
    private final String vertexModel;

    // ── Shared config ──────────────────────────────────────────────────────────
    private final int maxTokens;
    private final ObjectMapper mapper;
    private final LlmHttpSupport http;

    public ClaudeService(
            ObjectMapper mapper,
            LlmHttpSupport http,
            @Value("${ai.provider:vertex}")              String aiProvider,
            @Value("${anthropic.api-key:}")              String anthropicApiKey,
            @Value("${anthropic.base-url:https://api.anthropic.com}") String anthropicBaseUrl,
            @Value("${vertex.project-id:}")              String vertexProjectId,
            @Value("${vertex.location:us-east5}")        String vertexLocation,
            @Value("${vertex.model:claude-opus-4-5@20250514}") String vertexModel,
            @Value("${anthropic.max-tokens:4000}")       int maxTokens) {
        this.mapper           = mapper;
        this.http             = http;
        this.aiProvider       = aiProvider;
        this.anthropicApiKey  = anthropicApiKey;
        this.anthropicBaseUrl = anthropicBaseUrl;
        this.vertexProjectId  = vertexProjectId;
        this.vertexLocation   = vertexLocation;
        this.vertexModel      = vertexModel;
        this.maxTokens        = maxTokens;
    }

    @Override
    public String name() { return "claude"; }

    /**
     * Complete via the configured Claude transport. Defaults to Vertex AI; only
     * uses the Anthropic direct API when {@code ai.provider=anthropic}.
     */
    @Override
    public String complete(String system, List<Map<String, String>> messages) {
        if ("anthropic".equalsIgnoreCase(aiProvider)) {
            return callAnthropicDirect(system, messages);
        }
        return callVertexAi(system, messages);
    }

    // ── Vertex AI (production / BAA path) ─────────────────────────────────────

    /**
     * Call Claude via Vertex AI rawPredict.
     *
     * <p>Endpoint:
     * {@code https://{host}/v1/projects/{projectId}/locations/{location}/
     * publishers/anthropic/models/{model}:rawPredict}
     *
     * <p>The request body is the same JSON structure as Anthropic's Messages API.
     * Auth is a short-lived Bearer token obtained from Google ADC — no API key.
     */
    @SuppressWarnings("unchecked")
    private String callVertexAi(String system, List<Map<String, String>> messages) {
        if (vertexProjectId == null || vertexProjectId.isBlank()) {
            throw new IllegalStateException(
                    "ai.provider=vertex but VERTEX_PROJECT_ID is not set. " +
                    "Set it in application.yml or as a Cloud Run env var.");
        }
        try {
            String token = http.googleAccessToken();

            String endpoint = "https://%s/v1/projects/%s/locations/%s"
                    .formatted(http.vertexHost(vertexLocation), vertexProjectId, vertexLocation)
                    + "/publishers/anthropic/models/%s:rawPredict".formatted(vertexModel);

            // rawPredict body: same JSON as Anthropic Messages API.
            // The model field is encoded in the URL; including it in the body is optional.
            Map<String, Object> body = Map.of(
                    "anthropic_version", "vertex-2023-10-16",
                    "max_tokens", maxTokens,
                    "system", system,
                    "messages", messages
            );

            HttpURLConnection conn = http.openConnection(endpoint, "Bearer " + token, null);
            http.sendBody(conn, body);

            int status = conn.getResponseCode();
            String responseBody = http.readResponse(conn, status);

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

    // ── Anthropic direct (local dev) ───────────────────────────────────────────

    /**
     * Call Anthropic's API directly using an API key.
     * Use for local development only — PHI must not flow through this path in
     * production unless a separate Anthropic BAA is in place.
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

            HttpURLConnection conn = http.openConnection(endpoint, null, anthropicApiKey);
            http.sendBody(conn, body);

            int status = conn.getResponseCode();
            String responseBody = http.readResponse(conn, status);

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
}
