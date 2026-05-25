package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class CreateChatRequest {
    @NotBlank
    private String title;
    private String clientId;         // null for project / general chats
    private String projectId;        // link to an existing project
    private String projectLabel;     // label when no projectId yet (new project chat)
    /** Policy IDs whose text will be injected into the Claude system prompt for this chat. */
    private List<String> policyIds;
}
