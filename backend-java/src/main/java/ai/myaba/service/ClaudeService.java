package ai.myaba.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

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

    private final ObjectMapper mapper;
    private final String apiKey;
    private final String model;
    private final int maxTokens;
    private final String messagesUrl;

    public ClaudeService(
            ObjectMapper mapper,
            @Value("${anthropic.api-key:}") String apiKey,
            @Value("${anthropic.model:claude-sonnet-4-6}") String model,
            @Value("${anthropic.max-tokens:4000}") int maxTokens,
            @Value("${anthropic.base-url:https://api.anthropic.com}") String baseUrl) {
        this.mapper = mapper;
        this.apiKey = apiKey;
        this.model = model;
        this.maxTokens = maxTokens;
        this.messagesUrl = baseUrl + "/v1/messages";
    }

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

    @SuppressWarnings("unchecked")
    private String callMessages(String system, List<Map<String, String>> messages) {
        try {
            Map<String, Object> body = Map.of(
                    "model", model,
                    "max_tokens", maxTokens,
                    "system", system,
                    "messages", messages
            );
            byte[] payload = mapper.writeValueAsBytes(body);

            HttpURLConnection conn = (HttpURLConnection) new URL(messagesUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(60_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("x-api-key", apiKey);
            conn.setRequestProperty("anthropic-version", "2023-06-01");
            conn.setRequestProperty("Content-Type", "application/json");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }

            int status = conn.getResponseCode();
            byte[] responseBytes = (status == 200)
                    ? conn.getInputStream().readAllBytes()
                    : conn.getErrorStream().readAllBytes();
            String responseBody = new String(responseBytes, StandardCharsets.UTF_8);

            if (status != 200) {
                log.error("Claude API error {}: {}", status, responseBody);
                throw new RuntimeException("Claude API returned HTTP " + status + ": " + responseBody);
            }

            Map<?, ?> parsed = mapper.readValue(responseBody, Map.class);
            List<?> content = (List<?>) parsed.get("content");
            Map<?, ?> firstBlock = (Map<?, ?>) content.get(0);
            return firstBlock.get("text").toString();

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to call Claude API: " + e.getMessage(), e);
        }
    }
}
