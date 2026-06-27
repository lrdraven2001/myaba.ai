package ai.myaba.service;

import ai.myaba.service.llm.LlmProvider;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Provider-agnostic AI generation facade.
 *
 * <p>Owns the clinical prompt templates and document orchestration, and delegates
 * the actual model call to the {@link LlmProvider} selected by {@code ai.provider}:
 *
 * <ul>
 *   <li>{@code vertex} / {@code anthropic} → {@link ClaudeService} (Claude)</li>
 *   <li>{@code gemini} → {@link GeminiService} (Gemini via Vertex AI)</li>
 * </ul>
 *
 * <p>Both providers are always wired as beans, so switching is a config change only
 * ({@code AI_PROVIDER=...}) — no code changes and no redeploy of provider code.
 * Callers depend on this facade rather than any concrete provider.
 */
@Service
@Slf4j
public class AiService {

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

    private final ClaudeService claudeService;
    private final GeminiService geminiService;
    private final String aiProvider;

    public AiService(ClaudeService claudeService,
                     GeminiService geminiService,
                     @Value("${ai.provider:vertex}") String aiProvider) {
        this.claudeService = claudeService;
        this.geminiService = geminiService;
        this.aiProvider    = aiProvider;
    }

    @PostConstruct
    void logActiveProvider() {
        LlmProvider p = provider();
        log.info("AiService initialized: ai.provider={} → {} transport", aiProvider, p.name());
    }

    /** Select the active transport based on {@code ai.provider}. */
    private LlmProvider provider() {
        return "gemini".equalsIgnoreCase(aiProvider) ? geminiService : claudeService;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    public String generateDocument(String documentType, String clientContext, String additionalContext) {
        return generateDocument(documentType, clientContext, additionalContext, null);
    }

    /**
     * Generate a clinical document. When {@code customTemplate} is non-blank, the agency's
     * customized Generation Template (from the Agency Library) is used in place of the
     * built-in default prompt for this document type.
     */
    public String generateDocument(String documentType, String clientContext,
                                   String additionalContext, String customTemplate) {
        String typePrompt;
        if (customTemplate != null && !customTemplate.isBlank()) {
            typePrompt = """
                    Use the agency's customized template below as the structure and content guide
                    for this document. Follow its sections, headings, and instructions closely.

                    AGENCY TEMPLATE:
                    %s
                    """.formatted(customTemplate);
        } else {
            typePrompt = DOCUMENT_PROMPTS.getOrDefault(documentType,
                    "Generate a clinical ABA document based on the provided context.");
        }

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

        return provider().complete(BCBA_SYSTEM_PROMPT, List.of(
                Map.of("role", "user", "content", userContent)
        ));
    }

    public String chat(String systemPrompt, List<Map<String, String>> messages) {
        return provider().complete(
                systemPrompt != null ? systemPrompt : BCBA_SYSTEM_PROMPT,
                messages
        );
    }
}
