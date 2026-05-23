package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class GenerateDocumentResponse {
    private boolean success;
    private String documentId;
    private String documentType;
    private String content;
    private String decision;
    private String contentId;
    // Used when decision = ESCALATE
    private String status;
    private String message;
    private String reviewId;
}
