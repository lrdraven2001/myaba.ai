package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatResponse {
    private String reply;
    private String decision;  // ALLOW | REDACT | BLOCK | ESCALATE
    private String chatId;    // echoed back so the client can correlate
}
