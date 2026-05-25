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
        /** All client IDs referenced in this query — populated for cross-client chats.
         *  The Rego policy uses this to apply stricter cross-client PHI governance. */
        @JsonProperty("client_ids")
        private List<String> clientIds;
    }

    /**
     * Organisation-specific policy layer.
     * myABA fetches the org's current policy from its own store and includes it
     * here so ACLX can factor it into evaluation without a separate DB call.
     * ACLX applies these rules on top of its baseline HIPAA ruleset.
     */
    @Data
    @Builder
    public static class OrgPolicy {
        /** Patterns the org has explicitly approved — reduce escalation likelihood. */
        @JsonProperty("allowed_patterns")
        @Builder.Default
        private List<String> allowedPatterns = List.of();

        /** Patterns the org has explicitly blocked — stricter than HIPAA baseline. */
        @JsonProperty("blocked_patterns")
        @Builder.Default
        private List<String> blockedPatterns = List.of();

        /**
         * Minimum ACLX sensitivity level that should trigger ESCALATE.
         * e.g. "HIGH" means MEDIUM content is auto-allowed rather than escalated.
         * Null = use ACLX default (escalate at MEDIUM+).
         */
        @JsonProperty("escalate_at_sensitivity")
        private String escalateAtSensitivity;
    }

    /** Org-specific policy — included on every evaluate call when available. */
    @JsonProperty("org_policy")
    private OrgPolicy orgPolicy;
}
