package ai.myaba.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

/**
 * PHI-free web research for chat (the {@code research_web} tool): current
 * public facts — payer/insurance policies, state Medicaid ABA requirements,
 * school-district procedures — answered via a search-grounded Gemini call.
 *
 * <p>Boundary: the research request is a SEPARATE model call containing only
 * the guarded question. The clinical conversation (and any PHI in it) never
 * reaches the search-grounded request. Callers must input-guard the question.
 *
 * <p>Results carry source citations (title + URL) and a retrieval timestamp so
 * the chat can present them as verifiable, current-as-of information rather
 * than model memory.
 *
 * <p>Feature-gated via {@code RESEARCH_LOOKUP_ENABLED} (off by default).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WebResearchService {

    private static final String RESEARCH_SYSTEM = """
            You are a research assistant answering a single factual question using \
            current web search results. Be concise and specific: include the concrete \
            requirements, numbers, dates, or steps the question asks about. Only state \
            what the search results support — if they are inconclusive or conflicting, \
            say so plainly. Do not speculate or fill gaps from memory. Plain text only.\
            """;

    private final GeminiService geminiService;

    @Value("${lookup.research-enabled:false}")
    private boolean enabled;

    public boolean isEnabled() {
        return enabled;
    }

    /** Run one guarded research question; returns summary + sources + retrievedAt. */
    public Map<String, Object> research(String question) {
        Map<String, Object> result = geminiService.searchGrounded(RESEARCH_SYSTEM, question);
        result.put("source", "Google Search (web)");
        result.put("retrievedAt", Instant.now().toString());
        return result;
    }
}
