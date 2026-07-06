package ai.myaba.service;

import ai.myaba.service.llm.LlmHttpSupport;
import ai.myaba.service.llm.LlmProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.HashMap;
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
        return callGeminiMessages(geminiModelFast, fastGenerationConfig(), system, messages);
    }

    @Override
    public String complete(String system, List<Map<String, String>> messages, boolean reasoning) {
        return reasoning
                ? callGeminiMessages(geminiModelReasoning, reasoningGenerationConfig(), system, messages)
                : callGeminiMessages(geminiModelFast, fastGenerationConfig(), system, messages);
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

    /**
     * Transcribe scanned document pages (PNG images) to plain text. Used as the OCR
     * fallback for PDFs with no extractable text layer. Runs on the fast tier with
     * thinking off — transcription is mechanical, and the images carry the cost.
     */
    public String transcribeImages(String instruction, List<byte[]> pngPages) {
        List<Map<String, Object>> parts = new ArrayList<>();
        parts.add(Map.of("text", instruction));
        for (byte[] png : pngPages) {
            parts.add(Map.of("inlineData", Map.of(
                    "mimeType", "image/png",
                    "data", java.util.Base64.getEncoder().encodeToString(png))));
        }
        return callGemini(geminiModelFast,
                Map.of("maxOutputTokens", 32768, "thinkingConfig", Map.of("thinkingBudget", 0)),
                "You transcribe scanned documents. Output only the transcription — no commentary.",
                List.of(Map.of("role", "user", "parts", parts)));
    }

    private String callGeminiMessages(String model, Map<String, Object> generationConfig,
                                      String system, List<Map<String, String>> messages) {
        // Map internal assistant/user messages → Gemini contents.
        // role: "assistant" → "model"; everything else → "user".
        return callGemini(model, generationConfig, system, toContents(messages));
    }

    private String callGemini(String model, Map<String, Object> generationConfig,
                              String system, List<Map<String, Object>> contents) {
        Map<?, ?> candidate = callGeminiCandidate(model, generationConfig, system, contents, null);
        String text = extractText((Map<?, ?>) candidate.get("content"));
        if (text == null || text.isBlank()) {
            // A thinking model can exhaust the output budget on reasoning → no text part.
            Object finish = candidate.get("finishReason");
            log.error("Gemini ({}) returned no text (finishReason={})", model, finish);
            throw new RuntimeException("Gemini returned no text (finishReason=" + finish + ")");
        }
        return text;
    }

    /**
     * Chat with a single declared tool (Gemini function calling). When the model
     * emits a matching functionCall, {@code executor} runs it and the result is
     * fed back as a functionResponse turn; loops until the model produces text
     * (max {@code MAX_TOOL_ROUNDS} tool invocations as a runaway guard).
     *
     * <p>The model's tool-call turn is echoed back verbatim — Gemini 3.x requires
     * thought signatures from that turn to be returned with the function response.
     */
    public String completeWithTool(String system, List<Map<String, String>> messages, boolean reasoning,
                                   Map<String, Object> functionDeclaration,
                                   java.util.function.Function<Map<String, Object>, Map<String, Object>> executor) {
        String model = reasoning ? geminiModelReasoning : geminiModelFast;
        Map<String, Object> config = reasoning ? reasoningGenerationConfig() : fastGenerationConfig();
        List<Map<String, Object>> tools = List.of(Map.of("functionDeclarations", List.of(functionDeclaration)));
        String fname = (String) functionDeclaration.get("name");

        List<Map<String, Object>> contents = new ArrayList<>(toContents(messages));
        for (int round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            Map<?, ?> candidate = callGeminiCandidate(model, config, system, contents, tools);
            @SuppressWarnings("unchecked")
            Map<String, Object> content = (Map<String, Object>) candidate.get("content");
            Map<?, ?> functionCall = findFunctionCall(content, fname);
            if (functionCall == null) {
                String text = extractText(content);
                if (text == null || text.isBlank()) {
                    throw new RuntimeException("Gemini returned no text (finishReason="
                            + candidate.get("finishReason") + ")");
                }
                return text;
            }
            if (round == MAX_TOOL_ROUNDS) break;
            @SuppressWarnings("unchecked")
            Map<String, Object> args = functionCall.get("args") instanceof Map<?, ?> m
                    ? (Map<String, Object>) m : Map.of();
            Map<String, Object> result;
            try {
                result = executor.apply(args);
            } catch (Exception e) {
                log.warn("Tool {} execution failed: {}", fname, e.getMessage());
                result = Map.of("error", "Lookup failed: " + e.getMessage());
            }
            contents.add(content); // model turn with functionCall (+ thought signatures)
            contents.add(Map.of("role", "user", "parts", List.of(Map.of(
                    "functionResponse", Map.of("name", fname, "response", result)))));
        }
        throw new RuntimeException("Gemini exceeded " + MAX_TOOL_ROUNDS + " tool rounds without answering");
    }

    private static final int MAX_TOOL_ROUNDS = 3;

    /** First part carrying a functionCall for {@code name}, else null. */
    private Map<?, ?> findFunctionCall(Map<?, ?> content, String name) {
        if (content == null || !(content.get("parts") instanceof List<?> parts)) return null;
        for (Object p : parts) {
            if (p instanceof Map<?, ?> part && part.get("functionCall") instanceof Map<?, ?> fc
                    && name.equals(fc.get("name"))) {
                return fc;
            }
        }
        return null;
    }

    private List<Map<String, Object>> toContents(List<Map<String, String>> messages) {
        List<Map<String, Object>> contents = new ArrayList<>();
        for (Map<String, String> m : messages) {
            String role = "assistant".equalsIgnoreCase(m.get("role")) ? "model" : "user";
            contents.add(Map.of(
                    "role", role,
                    "parts", List.of(Map.of("text", m.getOrDefault("content", "")))
            ));
        }
        return contents;
    }

    /** Single generateContent call; returns the first candidate (throws when none). */
    private Map<?, ?> callGeminiCandidate(String model, Map<String, Object> generationConfig,
                                          String system, List<Map<String, Object>> contents,
                                          List<Map<String, Object>> tools) {
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

            Map<String, Object> body = new HashMap<>();
            body.put("systemInstruction", Map.of("parts", List.of(Map.of("text", system))));
            body.put("contents", contents);
            body.put("generationConfig", generationConfig);
            body.put("safetySettings", SAFETY_SETTINGS);
            if (tools != null && !tools.isEmpty()) body.put("tools", tools);

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
            return (Map<?, ?>) candidates.get(0);

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
