package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatResponse {
    private String reply;
    private String decision;  // ALLOW | REDACT | BLOCK | ESCALATE
    private String chatId;    // echoed back so the client can correlate
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
