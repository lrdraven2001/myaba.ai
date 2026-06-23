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
    /**
     * Number of tokens redacted by ACLX when {@code decision == REDACT}.
     * Zero on ALLOW, BLOCK, and ESCALATE decisions.
     * Surface this to the UI so clinicians know the document was partially modified.
     */
    private int redactedTokenCount;
    /**
     * Groundedness score from ACLX semantic detector (0.0-1.0).
     * Null when no grounding sources were provided or the detector did not run.
     * Scores below 0.70 indicate the AI may have generated facts not supported
     * by the org's resource library.
     */
    private Double groundednessScore;

    /**
     * True when groundednessScore is non-null and below 0.70.
     * The UI should display: "Some content could not be verified against your
     * organization's documentation library. Please review carefully."
     */
    private boolean groundednessWarning;
    // Used when decision = ESCALATE
    private String status;
    private String message;
    private String reviewId;
}
