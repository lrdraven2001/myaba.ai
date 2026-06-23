package ai.myaba.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * Deserialized response from the ACLX gateway {@code /evaluate} endpoint.
 *
 * <p>Against: ACLX Gateway v0.5 / {@code acl-policy-v1.5.0}
 *
 * <p>Decision values: ALLOW | REDACT | BLOCK | ESCALATE
 * (PARTIAL_ALLOW and QUARANTINE were retired in v0.5 — see §1 of the delta brief)
 */
@Data
public class AclxResponse {

    @JsonProperty("content_id")
    private String contentId;

    private Decision decision;
    private AclxLabel aclx;

    // ── Root-level enrichment fields (ACLX Gateway v0.5+) ────────────────────

    /**
     * Findings emitted by each content detector (PHI scanner, synthesis detector,
     * PII classifier, etc.).  Each entry contains at minimum:
     * {@code detector}, {@code matched}, {@code confidence}.
     * Store in the review queue so admins see exactly what triggered the decision.
     */
    @JsonProperty("detector_findings")
    private List<Map<String, Object>> detectorFindings;

    /**
     * {@code true} when the synthesis detector identified cross-client or
     * cross-document data aggregation that creates a de-anonymisation risk
     * (HIPAA Minimum Necessary, 45 CFR §164.514(d)).
     * Surface to reviewers whenever the decision is ESCALATE or BLOCK.
     */
    @JsonProperty("synthesis_detected")
    private boolean synthesisDetected;

    /**
     * Per-token metadata for every redaction applied when {@code decision == REDACT}.
     * Each entry contains: {@code token}, {@code category}, {@code detector}, {@code position}.
     * Null / empty when decision is ALLOW, BLOCK, or ESCALATE.
     */
    @JsonProperty("redaction_metadata")
    private List<Map<String, Object>> redactionMetadata;

    /**
     * The signed content passport (JWS compact serialisation) that travels with
     * the AI output as a chain-of-custody artefact.  Attach to documents stored
     * downstream so the label can be verified independently of ACLX.
     * Null when {@code LABEL_SIGNING_ENABLED=false} on the gateway.
     */
    @JsonProperty("content_label")
    private Object contentLabel;

    /**
     * {@code true} when the ACLX gateway wrote the audit record to its own store.
     * When {@code false}, myABA is the sole audit writer for this event and MUST
     * persist the full audit entry — never skip the {@link AuditService} call.
     */
    @JsonProperty("audit_written")
    private boolean auditWritten;

    // ── Decision ──────────────────────────────────────────────────────────────

    @Data
    public static class Decision {
        /** ALLOW | REDACT | BLOCK | ESCALATE */
        private String decision;

        @JsonProperty("final_text")
        private String finalText;

        private String reason;

        /**
         * OPA bundle version that made this decision.
         * If {@code "unavailable"} or null, the OPA sidecar is unreachable —
         * alert ops and treat sensitive content as BLOCK (see §3 of the delta brief).
         */
        @JsonProperty("policy_version")
        private String policyVersion;

        /**
         * Tokens redacted from {@code finalText} when decision is REDACT.
         * Null / empty on ALLOW, BLOCK, and ESCALATE.
         */
        @JsonProperty("redacted_tokens")
        private List<String> redactedTokens;
    }

    // ── AclxLabel nested types ────────────────────────────────────────────────

    /**
     * The enforcement action and rationale embedded directly in the label.
     * Mirrors {@link Decision#decision} but is part of the immutable audit trail.
     */
    @Data
    public static class AclxHandling {
        /** Final enforcement action: ALLOW | REDACT | BLOCK | ESCALATE */
        private String action;
        /** Human-readable rationale — safe to display to reviewers (not raw content). */
        private String rationale;
        @JsonProperty("applied_at")
        private String appliedAt;
    }

    /**
     * Summary of the authorization check performed by the gateway.
     * Present when {@code input.authorization_context} was included in the request.
     */
    @Data
    public static class AuthorizationAudit {
        /** Whether the gateway attempted an authorization check for this request. */
        @JsonProperty("auth_check_performed")
        private boolean authCheckPerformed;
        /** Whether the provided authorization satisfied the requirement. */
        @JsonProperty("auth_valid")
        private boolean authValid;
        /** The authorization record that was evaluated, if any. */
        @JsonProperty("auth_id")
        private String authId;
        @JsonProperty("auth_type")
        private String authType;
        /**
         * Why the authorization check failed when {@code authValid} is false.
         * Values: {@code NOT_PROVIDED | REVOKED | EXPIRED}
         * Surface this to reviewers so they can take corrective action.
         */
        @JsonProperty("deny_reason")
        private String denyReason;
    }

    /**
     * Full audit record returned alongside every decision.
     * Includes the policy version used and a snapshot of the authorization check result.
     */
    @Data
    public static class AclxAudit {
        @JsonProperty("decision_id")
        private String decisionId;
        /** OPA bundle version — same value as {@link Decision#policyVersion}. */
        @JsonProperty("policy_version")
        private String policyVersion;
        /** Snapshot of the identity context at decision time. */
        @JsonProperty("identity_snapshot")
        private Map<String, String> identitySnapshot;
        /** Authorization check result. Present when auth context was included. */
        @JsonProperty("authorization_audit")
        private AuthorizationAudit authorizationAudit;
    }

    // ── AclxLabel ─────────────────────────────────────────────────────────────

    /**
     * The ACLX governance label attached to the evaluated content.
     * Stored with every audit record; consumed by the review UI and audit log.
     */
    @Data
    public static class AclxLabel {
        /** Gateway spec version (e.g. "0.5"). */
        @JsonProperty("acl_version")
        private String aclVersion;

        /** Domain the decision was made under (e.g. "hipaa"). Lowercase. */
        private String domain;

        /** Gateway origin metadata: system, model, session_id. */
        private Map<String, Object> origin;

        /**
         * The enforcement action embedded in the label.
         * Use {@code handling.action} for display rather than the top-level decision
         * value, as the label is part of the immutable audit trail.
         */
        private AclxHandling handling;

        /**
         * Full audit record: decision ID, policy version, identity snapshot,
         * and authorization audit result.
         */
        private AclxAudit audit;

        // ── Content classification fields (unchanged from v0.4) ───────────────

        private String category;
        private String subcategory;
        private String sensitivity;
    }
}
