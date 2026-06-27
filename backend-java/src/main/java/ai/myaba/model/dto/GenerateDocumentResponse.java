package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

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
     * Signed content passport (JWS compact serialisation) returned by ACLX.
     * Stored with the document so the label can be verified independently of ACLX.
     * Null when {@code LABEL_SIGNING_ENABLED=false} on the gateway.
     */
    private Object contentLabel;

    /**
     * Detector findings from ACLX — summary metadata only (detector name, matched flag,
     * confidence). The UI uses this to explain "why was content redacted/flagged"
     * without exposing raw PHI token content.
     */
    private List<Map<String, Object>> detectorFindings;

    /**
     * Per-token redaction metadata when {@code decision == REDACT}.
     * Each entry: {@code category}, {@code detector}, {@code position}.
     * Token text itself is not included to avoid re-surfacing PHI in the response.
     */
    private List<Map<String, Object>> redactionMetadata;
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
