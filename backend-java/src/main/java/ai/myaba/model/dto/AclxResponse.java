package ai.myaba.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class AclxResponse {

    @JsonProperty("content_id")
    private String contentId;

    private Decision decision;
    private AclxLabel aclx;

    @Data
    public static class Decision {
        private String decision;      // ALLOW | REDACT | BLOCK | ESCALATE
        @JsonProperty("final_text")
        private String finalText;
        private String reason;
    }

    @Data
    public static class AclxLabel {
        private String domain;
        private String category;
        private String subcategory;
        private String sensitivity;
    }
}
