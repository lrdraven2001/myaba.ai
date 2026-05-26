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

    /**
     * Subject-specific authorization records.
     *
     * <p>myABA loads active authorizations for the primary subject (client) from its
     * own store and includes them here so ACLX can verify that a legally-required
     * authorization exists before allowing access to protected data categories.
     *
     * <p>All field values are domain-defined strings — ACLX validates them against
     * the registered vocabulary for {@code input.domain}. This makes the structure
     * reusable across HIPAA, FERPA, GDPR, CUI, and any other registered domain.
     */
    @JsonProperty("authorization_context")
    private AuthorizationContext authorizationContext;

    @Data
    @Builder
    public static class AuthorizationContext {

        /**
         * The individual these authorizations apply to.
         * HIPAA: patient/client ID.  FERPA: student ID.  GDPR: data subject ID.
         */
        @JsonProperty("subject_id")
        private String subjectId;

        @Builder.Default
        private List<Authorization> authorizations = List.of();

        @Data
        @Builder
        public static class Authorization {

            /** Unique identifier for this authorization record. */
            @JsonProperty("auth_id")
            private String authId;

            /**
             * Domain-defined authorization type.
             * HIPAA: RESEARCH | PART_2_CONSENT | HIPAA_AUTHORIZATION
             * FERPA: PARENTAL_CONSENT | STUDENT_CONSENT | LEGITIMATE_INTEREST
             * GDPR:  EXPLICIT_CONSENT | LEGITIMATE_INTEREST | CONTRACT
             * CUI:   CLEARANCE_GRANT | NEED_TO_KNOW | EXPORT_LICENSE
             */
            private String type;

            /**
             * Domain-defined data categories this authorization covers.
             * HIPAA: PHI | CLINICAL | SUD | PSYCHOTHERAPY | HIV | GENETIC
             * FERPA: EDUCATION_RECORDS | DIRECTORY_INFO | FINANCIAL
             * GDPR:  PERSONAL_DATA | SPECIAL_CATEGORY | BIOMETRIC
             * CUI:   CUI_BASIC | CUI_SPECIFIED | EXPORT_CONTROLLED
             */
            @Builder.Default
            private List<String> scope = List.of();

            /** ISO-8601 expiry date, or null if the authorization does not expire. */
            private String expiry;

            /** ACTIVE | EXPIRED | REVOKED */
            private String status;

            @JsonProperty("issued_at")
            private String issuedAt;

            /**
             * Optional reference to the source document evidencing this authorization
             * (e.g. IRB filing ID, consent form document ID).
             */
            @JsonProperty("evidence_ref")
            private String evidenceRef;
        }
    }
}
