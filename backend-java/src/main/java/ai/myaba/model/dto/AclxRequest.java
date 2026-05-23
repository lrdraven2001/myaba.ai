package ai.myaba.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@Builder
public class AclxRequest {

    private String domain;
    private Identity identity;
    @JsonProperty("ai_response")
    private AiResponse aiResponse;
    @JsonProperty("request_context")
    private RequestContext requestContext;

    @Data
    @Builder
    public static class Identity {
        private String subject;
        @JsonProperty("actor_type")
        private String actorType;
        private String role;
        private String purpose;
        private String organization;
        @Builder.Default
        private List<String> scopes = List.of();
        @Builder.Default
        @JsonProperty("allowed_distributions")
        private List<String> allowedDistributions = List.of();
        @Builder.Default
        private Map<String, String> attributes = Map.of();
    }

    @Data
    @Builder
    public static class AiResponse {
        private String text;
        @Builder.Default
        private List<Source> sources = List.of();
    }

    @Data
    @Builder
    public static class Source {
        private String id;
        private String label;
        private String distribution;
        private String owner;
    }

    @Data
    @Builder
    public static class RequestContext {
        private String timestamp;
        @JsonProperty("client_id")
        private String clientId;
    }
}
