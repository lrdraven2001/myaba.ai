package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class GenerateDocumentRequest {
    @NotBlank
    private String clientId;
    @NotBlank
    private String documentType;   // bip | fba | progress_note
    private String additionalContext;
}
