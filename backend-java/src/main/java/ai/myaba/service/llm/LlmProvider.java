package ai.myaba.service.llm;

import java.util.List;
import java.util.Map;

/**
 * Low-level transport for a single LLM provider.
 *
 * <p>Implementations are pure transport — given a system prompt and a list of
 * chat messages they return the model's text reply. They contain no business
 * logic (prompt templates, document orchestration) — that lives in
 * {@link ai.myaba.service.AiService}, which selects and delegates to the active
 * provider based on the {@code ai.provider} setting.
 *
 * <p>Each provider is its own {@code @Service} bean so the others remain available
 * to switch back to at any time without code changes — only the {@code ai.provider}
 * config differs.
 */
public interface LlmProvider {

    /**
     * Single completion.
     *
     * @param system   system prompt / instructions
     * @param messages ordered chat turns; each map has {@code role}
     *                 ({@code user}/{@code assistant}) and {@code content}
     * @return the model's text reply
     */
    String complete(String system, List<Map<String, String>> messages);

    /** Identifier used in logs, e.g. {@code "claude"} or {@code "gemini"}. */
    String name();
}
