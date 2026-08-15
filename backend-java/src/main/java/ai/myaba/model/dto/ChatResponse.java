package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class ChatResponse {
    private String reply;
    private String decision;  // ALLOW | REDACT | BLOCK | ESCALATE
    private String chatId;    // echoed back so the client can correlate
    /**
     * Downloadable translation offers produced by the {@code translate_document} chat
     * tool. Each entry identifies an ATTACHED document (client document or project
     * knowledge file) the user asked to translate:
     * {@code {scope, clientId|projectId, docId, docTitle, language?, languageLabel?}}.
     * The client renders a download card per offer that calls the existing translate
     * endpoint — no translated bytes are stored server-side. Null/empty when the turn
     * produced no translation offer.
     */
    private List<Map<String, Object>> translations;
    /**
     * Number of tokens redacted by ACLX when {@code decision == REDACT}.
     * Zero on all other decisions.
     * Surface in the chat UI so clinicians know the response was partially modified
     * before delivery (e.g. "1 token redacted for compliance").
     */
    private int redactedTokenCount;
    /**
     * Groundedness score from ACLX semantic detector (0.0-1.0).
     * Null when no grounding sources were provided.
     */
    private Double groundednessScore;
}
