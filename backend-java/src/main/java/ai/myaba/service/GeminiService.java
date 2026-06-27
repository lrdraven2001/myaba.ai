package ai.myaba.service;

import ai.myaba.service.llm.LlmHttpSupport;
import ai.myaba.service.llm.LlmProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Gemini transport — calls Gemini via Vertex AI {@code generateContent}.
 *
 * <p>Uses the same GCP project, region, and Google ADC credentials as the Claude
 * Vertex path ({@link ClaudeService}), so it sits inside the same Google Cloud BAA
 * boundary — no separate vendor agreement is required.
 *
 * <p>This is a pure {@link LlmProvider} transport — it holds no prompt templates or
 * document orchestration (that lives in {@link AiService}). It is always available
 * as a bean; whether it is the <em>active</em> provider depends on
 * {@code ai.provider}. Set {@code AI_PROVIDER=gemini} to make it active.
 *
 * <h3>Schema differences from Claude</h3>
 * Gemini uses a different request/response shape:
 * <ul>
 *   <li>system prompt → {@code systemInstruction.parts[].text}</li>
 *   <li>messages → {@code contents[]} with {@code role} of {@code user}/{@code model}
 *       (the Anthropic {@code assistant} role maps to {@code model}) and
 *       {@code parts[].text} instead of a flat {@code content} string</li>
 *   <li>response text → {@code candidates[0].content.parts[0].text}</li>
 * </ul>
 */
@Service
@Slf4j
public class GeminiService implements LlmProvider {

    /** GCP project ID — required for Vertex AI. */
    private final String vertexProjectId;
    /**
     * Gemini's Vertex region — separate from Claude's. Must be a concrete region
     * (e.g. {@code us-central1} → host {@code us-central1-aiplatform.googleapis.com})
     * or {@code global} ({@code aiplatform.googleapis.com}). The {@code us}/{@code eu}
     * multi-region values are NOT valid Vertex hostname prefixes. Gemini is NOT served
     * from Anthropic's {@code us-east5}, which is why region is a per-model setting.
     */
    private final String geminiLocation;
    /** Gemini model name, e.g. {@code gemini-2.5-flash} (GA) or {@code gemini-3-pro-preview}. */
    private final String geminiModel;

    private final int maxTokens;
    private final ObjectMapper mapper;
    private final LlmHttpSupport http;

    public GeminiService(
            ObjectMapper mapper,
            LlmHttpSupport http,
            @Value("${vertex.project-id:}")            String vertexProjectId,
            @Value("${gemini.location:global}")        String geminiLocation,
            @Value("${gemini.model:gemini-2.5-flash}") String geminiModel,
            @Value("${anthropic.max-tokens:4000}")     int maxTokens) {
        this.mapper          = mapper;
        this.http            = http;
        this.vertexProjectId = vertexProjectId;
        this.geminiLocation  = geminiLocation;
        this.geminiModel     = geminiModel;
        this.maxTokens       = maxTokens;
    }

    @Override
    public String name() { return "gemini"; }

    /**
     * Call Gemini via Vertex AI {@code generateContent}.
     *
     * <p>Endpoint:
     * {@code https://{host}/v1/projects/{projectId}/locations/{location}/
     * publishers/google/models/{model}:generateContent}
     *
     * <p>Auth is the same short-lived ADC bearer token the Claude Vertex path uses.
     */
    @Override
    @SuppressWarnings("unchecked")
    public String complete(String system, List<Map<String, String>> messages) {
        if (vertexProjectId == null || vertexProjectId.isBlank()) {
            throw new IllegalStateException(
                    "ai.provider=gemini but VERTEX_PROJECT_ID is not set. " +
                    "Set it in application.yml or as a Cloud Run env var.");
        }
        try {
            String token = http.googleAccessToken();

            String endpoint = "https://%s/v1/projects/%s/locations/%s"
                    .formatted(http.vertexHost(geminiLocation), vertexProjectId, geminiLocation)
                    + "/publishers/google/models/%s:generateContent".formatted(geminiModel);

            // Map Anthropic-style messages → Gemini contents.
            // role: "assistant" → "model"; everything else → "user".
            List<Map<String, Object>> contents = new ArrayList<>();
            for (Map<String, String> m : messages) {
                String role = "assistant".equalsIgnoreCase(m.get("role")) ? "model" : "user";
                contents.add(Map.of(
                        "role", role,
                        "parts", List.of(Map.of("text", m.getOrDefault("content", "")))
                ));
            }

            Map<String, Object> body = Map.of(
                    "systemInstruction", Map.of("parts", List.of(Map.of("text", system))),
                    "contents", contents,
                    "generationConfig", Map.of("maxOutputTokens", maxTokens)
            );

            HttpURLConnection conn = http.openConnection(endpoint, "Bearer " + token, null);
            http.sendBody(conn, body);

            int status = conn.getResponseCode();
            String responseBody = http.readResponse(conn, status);

            if (status != 200) {
                log.error("Vertex AI Gemini error {}: {}", status, responseBody);
                throw new RuntimeException("Vertex AI returned HTTP " + status + ": " + responseBody);
            }

            Map<?, ?> parsed   = mapper.readValue(responseBody, Map.class);
            List<?> candidates = (List<?>) parsed.get("candidates");
            if (candidates == null || candidates.isEmpty()) {
                // Most commonly a safety block or empty completion — surface the raw body.
                log.error("Vertex AI Gemini returned no candidates: {}", responseBody);
                throw new RuntimeException("Gemini returned no candidates: " + responseBody);
            }
            Map<?, ?> candidate = (Map<?, ?>) candidates.get(0);
            Map<?, ?> content   = (Map<?, ?>) candidate.get("content");
            List<?> parts       = (List<?>) content.get("parts");
            Map<?, ?> firstPart = (Map<?, ?>) parts.get(0);
            return firstPart.get("text").toString();

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Vertex AI Gemini call failed: " + e.getMessage(), e);
        }
    }
}
