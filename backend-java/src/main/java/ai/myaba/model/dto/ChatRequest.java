package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class ChatRequest {
    @NotBlank
    private String message;
    /** Firestore chat document ID — when present, messages are persisted to this chat. */
    private String chatId;
    private String clientId;
    /** Multiple client IDs for cross-client queries — ACLX governs the output boundary. */
    private List<String> clientIds;
    private List<ChatMessage> history;

    @Data
    public static class ChatMessage {
        private String role;
        private String content;
    }
}
