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
 * <p>Authenticates with Google ADC (the runtime service account), so it sits inside
 * the Google Cloud BAA boundary — no separate vendor agreement or API key required.
 *
 * <p>This is a pure {@link LlmProvider} transport — it holds no prompt templates or
 * document orchestration (that lives in {@link AiService}).
 *
 * <h3>Gemini request/response schema</h3>
 * <ul>
 *   <li>system prompt → {@code systemInstruction.parts[].text}</li>
 *   <li>messages → {@code contents[]} with {@code role} of {@code user}/{@code model}
 *       (the internal {@code assistant} role maps to {@code model}) and
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
     * Gemini's Vertex region. Must be a concrete region
     * (e.g. {@code us-central1} → host {@code us-central1-aiplatform.googleapis.com})
     * or {@code global} ({@code aiplatform.googleapis.com}). The {@code us}/{@code eu}
     * multi-region values are NOT valid Vertex hostname prefixes.
     */
    private final String geminiLocation;
    /** Tier 1 — fast/cheap model (chat + lightweight docs), e.g. {@code gemini-3.1-flash-lite}. */
    private final String geminiModelFast;
    /** Tier 2 — higher-reasoning model for clinical documents and client-attached chat, e.g. {@code gemini-3.1-pro-preview}. */
    private final String geminiModelReasoning;

    private final int maxTokens;
    /** Larger output budget for the reasoning tier (long, interdependent documents). */
    private final int reasoningMaxTokens;
    private final ObjectMapper mapper;
    private final LlmHttpSupport http;

    public GeminiService(
            ObjectMapper mapper,
            LlmHttpSupport http,
            @Value("${vertex.project-id:}")            String vertexProjectId,
            @Value("${gemini.location:global}")        String geminiLocation,
            // Fast tier defaults to gemini.model-fast, then legacy gemini.model, then Flash-Lite.
            @Value("${gemini.model-fast:${gemini.model:gemini-3.1-flash-lite}}") String geminiModelFast,
            @Value("${gemini.model-reasoning:gemini-3.1-pro-preview}")           String geminiModelReasoning,
            @Value("${gemini.max-tokens:4000}")               int maxTokens,
            @Value("${gemini.max-tokens-reasoning:32768}")    int reasoningMaxTokens) {
        this.mapper               = mapper;
        this.http                 = http;
        this.vertexProjectId      = vertexProjectId;
        this.geminiLocation       = geminiLocation;
        this.geminiModelFast      = geminiModelFast;
        this.geminiModelReasoning = geminiModelReasoning;
        this.maxTokens            = maxTokens;
        this.reasoningMaxTokens   = reasoningMaxTokens;
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
     * <p>Auth is a short-lived Google ADC bearer token (the runtime service account).
     */
    @Override
    public String complete(String system, List<Map<String, String>> messages) {
        return callGemini(geminiModelFast, fastGenerationConfig(), system, messages);
    }

    @Override
    public String complete(String system, List<Map<String, String>> messages, boolean reasoning) {
        return reasoning
                ? callGemini(geminiModelReasoning, reasoningGenerationConfig(), system, messages)
                : callGemini(geminiModelFast, fastGenerationConfig(), system, messages);
    }

    /** Fast tier (Flash-Lite): thinking disabled for low latency, moderate output budget. */
    private Map<String, Object> fastGenerationConfig() {
        return Map.of(
                "maxOutputTokens", maxTokens,
                // No extended reasoning — fast/cheap turnaround for chat + lightweight docs.
                "thinkingConfig", Map.of("thinkingBudget", 0));
    }

    /** Reasoning tier (Pro): high thinking effort and a large budget for long documents. */
    private Map<String, Object> reasoningGenerationConfig() {
        Map<String, Object> cfg = new java.util.HashMap<>();
        cfg.put("maxOutputTokens", reasoningMaxTokens);
        cfg.put("temperature", 1);
        cfg.put("topP", 0.95);
        // thinkingLevel is the Gemini 3.x knob; 2.x models only accept thinkingBudget,
        // so omit it if the reasoning model is ever pinned back to a 2.x release.
        if (geminiModelReasoning.startsWith("gemini-3")) {
            cfg.put("thinkingConfig", Map.of("thinkingLevel", "HIGH"));
        }
        return cfg;
    }

    /**
     * Vertex safety filters disabled: clinical ABA content (self-injurious behavior,
     * aggression, elopement) reliably trips the dangerous-content classifier as false
     * positives. Output governance is ACLX's job — every response still passes through
     * the gateway before delivery.
     */
    private static final List<Map<String, String>> SAFETY_SETTINGS = List.of(
            Map.of("category", "HARM_CATEGORY_HATE_SPEECH",       "threshold", "OFF"),
            Map.of("category", "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold", "OFF"),
            Map.of("category", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold", "OFF"),
            Map.of("category", "HARM_CATEGORY_HARASSMENT",        "threshold", "OFF"));

    @SuppressWarnings("unchecked")
    private String callGemini(String model, Map<String, Object> generationConfig,
                              String system, List<Map<String, String>> messages) {
        if (vertexProjectId == null || vertexProjectId.isBlank()) {
            throw new IllegalStateException(
                    "ai.provider=gemini but VERTEX_PROJECT_ID is not set. " +
                    "Set it in application.yml or as a Cloud Run env var.");
        }
        try {
            String token = http.googleAccessToken();

            String endpoint = "https://%s/v1/projects/%s/locations/%s"
                    .formatted(http.vertexHost(geminiLocation), vertexProjectId, geminiLocation)
                    + "/publishers/google/models/%s:generateContent".formatted(model);

            // Map internal assistant/user messages → Gemini contents.
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
                    "generationConfig", generationConfig,
                    "safetySettings", SAFETY_SETTINGS
            );

            HttpURLConnection conn = http.openConnection(endpoint, "Bearer " + token);
            http.sendBody(conn, body);

            int status = conn.getResponseCode();
            String responseBody = http.readResponse(conn, status);

            if (status != 200) {
                log.error("Vertex AI Gemini ({}) error {}: {}", model, status, responseBody);
                throw new RuntimeException("Vertex AI returned HTTP " + status + ": " + responseBody);
            }

            Map<?, ?> parsed   = mapper.readValue(responseBody, Map.class);
            List<?> candidates = (List<?>) parsed.get("candidates");
            if (candidates == null || candidates.isEmpty()) {
                log.error("Vertex AI Gemini ({}) returned no candidates: {}", model, responseBody);
                throw new RuntimeException("Gemini returned no candidates: " + responseBody);
            }
            Map<?, ?> candidate = (Map<?, ?>) candidates.get(0);
            String text = extractText((Map<?, ?>) candidate.get("content"));
            if (text == null || text.isBlank()) {
                // A thinking model can exhaust the output budget on reasoning → no text part.
                Object finish = candidate.get("finishReason");
                log.error("Gemini ({}) returned no text (finishReason={}): {}", model, finish, responseBody);
                throw new RuntimeException("Gemini returned no text (finishReason=" + finish + ")");
            }
            return text;

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Vertex AI Gemini call failed: " + e.getMessage(), e);
        }
    }

    /** Concatenate text parts, skipping any "thought" parts emitted by reasoning models. */
    private String extractText(Map<?, ?> content) {
        if (content == null) return null;
        Object partsObj = content.get("parts");
        if (!(partsObj instanceof List<?> parts)) return null;
        StringBuilder sb = new StringBuilder();
        for (Object p : parts) {
            if (!(p instanceof Map<?, ?> part)) continue;
            if (Boolean.TRUE.equals(part.get("thought"))) continue; // skip reasoning trace
            Object t = part.get("text");
            if (t != null) sb.append(t);
        }
        return sb.length() > 0 ? sb.toString() : null;
    }
}
