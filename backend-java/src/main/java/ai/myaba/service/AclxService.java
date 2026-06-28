package ai.myaba.service;

import ai.myaba.model.dto.AclxRequest;
import ai.myaba.model.dto.AclxResponse;
import ai.myaba.model.dto.AppUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
public class AclxService {

    private final ObjectMapper mapper;
    private final OrgAclxPolicyService orgPolicyService;
    private final SubjectAuthorizationService subjectAuthService;
    private final ClientService clientService;
    private final String gatewayUrl;
    private final boolean enabled;
    /**
     * ACLX enforcement domain.  Governs which Rego policy bundle is applied.
     * Supported values: {@code hipaa} (default), {@code cui}, {@code ip},
     * {@code enterprise}, {@code mixed}.
     * Override via {@code ACLX_DOMAIN} env var or {@code aclx.domain} in YAML.
     */
    private final String domain;

    public AclxService(
            ObjectMapper mapper,
            OrgAclxPolicyService orgPolicyService,
            SubjectAuthorizationService subjectAuthService,
            ClientService clientService,
            @Value("${aclx.gateway-url:http://localhost:8080}") String gatewayUrl,
            @Value("${aclx.enabled:true}") boolean enabled,
            @Value("${aclx.domain:hipaa}") String domain) {
        this.mapper             = mapper;
        this.orgPolicyService   = orgPolicyService;
        this.subjectAuthService = subjectAuthService;
        this.clientService      = clientService;
        this.gatewayUrl         = gatewayUrl;
        this.enabled            = enabled;
        this.domain             = domain;
    }

    /** Backward-compatible overload — no grounding sources, ACLX groundedness check skipped. */
    public AclxResponse evaluate(String aiResponse, AppUser user, String clientId) {
        return evaluate(aiResponse, user, clientId, null, List.of());
    }

    /** Evaluate with grounding sources for hallucination detection. */
    public AclxResponse evaluate(String aiResponse, AppUser user, String clientId,
                                 List<ai.myaba.model.dto.AclxRequest.Source> groundingSources) {
        return evaluate(aiResponse, user, clientId, null, groundingSources);
    }

    /**
     * Multi-client evaluation for cross-client project chats.
     * {@code clientIds} should contain ALL client IDs referenced in the query so the
     * Rego policy can apply cross-client PHI governance rules.
     * The org's current policy (allow/block patterns, sensitivity threshold) is
     * loaded from {@link OrgAclxPolicyService} and included in every request so
     * ACLX can factor learned decisions into evaluation without a separate DB call.
     */
    public AclxResponse evaluate(String aiResponse, AppUser user, String clientId,
                                 List<String> clientIds,
                                 List<ai.myaba.model.dto.AclxRequest.Source> groundingSources) {
        if (!enabled) {
            log.debug("ACLX disabled - pass-through ALLOW");
            return buildPassThrough(aiResponse);
        }

        List<String> allClientIds = buildClientIdList(clientId, clientIds);

        // Load org-specific policy — null if org has no custom rules yet
        AclxRequest.OrgPolicy orgPolicy = loadOrgPolicy(user.getOrgId());

        // Load subject authorizations for the primary client — null if none exist
        AclxRequest.AuthorizationContext authContext = loadAuthorizationContext(user.getOrgId(), clientId);

        // Build authorized-subject list for HIPAA Minimum Necessary cross-patient check
        // (45 CFR §164.514(d)). Empty list = check skipped by ACLX detector.
        List<AclxRequest.AuthorizedSubject> authorizedSubjects =
                buildAuthorizedSubjects(user.getOrgId(), allClientIds);

        AclxRequest request = AclxRequest.builder()
                .domain(domain)
                .identity(AclxRequest.Identity.builder()
                        .subject(user.getUid())
                        .actorType("human")
                        .role(user.getRole())
                        .purpose(user.getPurpose())
                        .organization(user.getOrgId())
                        .scopes(buildScopes(user))
                        .allowedDistributions(List.of())
                        .build())
                .aiResponse(AclxRequest.AiResponse.builder()
                        .text(aiResponse)
                        .sources(groundingSources != null ? groundingSources : List.of())
                        .build())
                .requestContext(AclxRequest.RequestContext.builder()
                        .timestamp(Instant.now().toString())
                        .clientId(clientId)
                        .clientIds(allClientIds.size() > 1 ? allClientIds : null)
                        .build())
                .orgPolicy(orgPolicy)
                .authorizationContext(authContext)
                .authorizedSubjects(authorizedSubjects.isEmpty() ? null : authorizedSubjects)
                .build();

        try {
            byte[] payload = mapper.writeValueAsBytes(request);

            HttpURLConnection conn = (HttpURLConnection) new URL(gatewayUrl + "/evaluate").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5_000);
            // 30s read: ACLX evaluation runs LLM-backed detectors (semantic, groundedness)
            // which can take several seconds. Too short a timeout fail-safe BLOCKs valid output.
            conn.setReadTimeout(30_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }

            int status = conn.getResponseCode();
            if (status != 200) {
                log.error("ACLX Gateway error {}", status);
                return buildBlocked("ACLX Gateway returned " + status);
            }

            String body = new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            AclxResponse response = mapper.readValue(body, AclxResponse.class);

            // §1 Synthesis escalation — override ALLOW/REDACT to ESCALATE when
            // the synthesis detector flagged cross-client data aggregation risk.
            // ACLX sets synthesis_detected=true when the Minimum Necessary Rule
            // (45 CFR §164.514(d)) may be violated by the combined output.
            if (response.isSynthesisDetected()
                    && response.getDecision() != null
                    && ("ALLOW".equals(response.getDecision().getDecision())
                        || "REDACT".equals(response.getDecision().getDecision()))) {
                log.warn("synthesis_detected=true — overriding {} to ESCALATE: contentId={}",
                        response.getDecision().getDecision(), response.getContentId());
                String prior = response.getDecision().getReason();
                response.getDecision().setDecision("ESCALATE");
                response.getDecision().setReason(
                        "SYNTHESIS_DETECTED: cross-client data aggregation risk"
                        + (prior != null && !prior.isBlank() ? "; " + prior : ""));
            }

            return response;

        } catch (Exception e) {
            log.error("ACLX Gateway unreachable: {}", e.getMessage());
            return buildBlocked("ACLX Gateway unavailable - response blocked for safety");
        }
    }

    /** Multi-client evaluation without grounding sources - backward compatible. */
    public AclxResponse evaluateMultiClient(String aiResponse, AppUser user,
                                            String clientId, List<String> clientIds) {
        return evaluate(aiResponse, user, clientId, clientIds, List.of());
    }

    /**
     * Submit a human-review feedback signal to the ACLX gateway.
     *
     * <p>Called after an admin approves or denies an escalated item in the review
     * queue. ACLX uses these signals to tune its confidence thresholds over time.
     * This call is best-effort — a failure here never blocks the local verdict
     * from being persisted.
     *
     * @param orgId         organisation that reviewed the content
     * @param contentId     ACLX {@code content_id} from the original evaluate response
     * @param verdict       "APPROVED" or "DENIED"
     * @param eventType     source event type (CHAT_RESPONSE, DOCUMENT_GENERATED, etc.)
     * @param reviewerNotes human notes — forwarded to ACLX for context
     * @param reviewedBy    UID of the reviewer
     */
    public void submitFeedback(String orgId, String contentId, String verdict,
                               String eventType, String reviewerNotes, String reviewedBy) {
        if (!enabled) {
            log.debug("ACLX disabled - feedback suppressed for contentId={}", contentId);
            return;
        }

        Map<String, Object> feedback = Map.of(
                "content_id",     contentId     != null ? contentId     : "",
                "organization",   orgId,
                "verdict",        verdict,
                "event_type",     eventType     != null ? eventType     : "",
                "reviewer_notes", reviewerNotes != null ? reviewerNotes : "",
                "reviewed_by",    reviewedBy    != null ? reviewedBy    : "",
                "reviewed_at",    Instant.now().toString()
        );

        try {
            byte[] payload = mapper.writeValueAsBytes(feedback);

            HttpURLConnection conn = (HttpURLConnection) new URL(gatewayUrl + "/feedback").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5_000);
            conn.setReadTimeout(5_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }

            int status = conn.getResponseCode();
            if (status == 200 || status == 204) {
                log.info("ACLX feedback submitted: contentId={} verdict={} org={}", contentId, verdict, orgId);
            } else {
                log.warn("ACLX feedback endpoint returned {} for contentId={}", status, contentId);
            }

        } catch (Exception e) {
            // Non-fatal — feedback is best-effort; the local verdict is already persisted
            log.warn("ACLX feedback submission failed (non-fatal): {}", e.getMessage());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Build an {@link AclxRequest.AuthorizationContext} from the subject's active
     * authorization records. Returns {@code null} when the client ID is absent or
     * no active authorizations exist — ACLX treats a missing context as no
     * explicit authorizations on record.
     */
    @SuppressWarnings("unchecked")
    private AclxRequest.AuthorizationContext loadAuthorizationContext(String orgId, String clientId) {
        if (clientId == null || clientId.isBlank()) return null;
        try {
            List<Map<String, Object>> auths = subjectAuthService.getActiveAuthorizations(orgId, clientId);
            if (auths.isEmpty()) return null;

            List<AclxRequest.AuthorizationContext.Authorization> authList = auths.stream()
                    .map(a -> AclxRequest.AuthorizationContext.Authorization.builder()
                            .authId((String) a.get("authId"))
                            .type((String) a.get("type"))
                            .scope((List<String>) a.getOrDefault("scope", List.of()))
                            .expiry((String) a.get("expiry"))
                            .status((String) a.get("status"))
                            .issuedAt((String) a.get("issuedAt"))
                            .evidenceRef((String) a.get("evidenceRef"))
                            .build())
                    .collect(Collectors.toList());

            return AclxRequest.AuthorizationContext.builder()
                    .subjectId(clientId)
                    .authorizations(authList)
                    .build();
        } catch (Exception e) {
            log.warn("Failed to load authorization context for subject {} (non-fatal): {}", clientId, e.getMessage());
            return null;
        }
    }

    /**
     * Build an {@link AclxRequest.OrgPolicy} from the org's current rule store.
     * Returns {@code null} when the org has no custom rules — ACLX will then
     * apply its baseline HIPAA ruleset without any org-level override.
     */
    private AclxRequest.OrgPolicy loadOrgPolicy(String orgId) {
        try {
            List<String> allowed     = orgPolicyService.getAllowedPatternSlugs(orgId);
            List<String> blocked     = orgPolicyService.getBlockedPatternSlugs(orgId);
            String       sensitivity = orgPolicyService.getEscalateAtSensitivity(orgId);

            if (allowed.isEmpty() && blocked.isEmpty() && sensitivity == null) {
                return null; // No custom policy — let ACLX use its baseline
            }

            return AclxRequest.OrgPolicy.builder()
                    .allowedPatterns(allowed)
                    .blockedPatterns(blocked)
                    .escalateAtSensitivity(sensitivity)
                    .build();

        } catch (Exception e) {
            log.warn("Failed to load org policy for {} (non-fatal): {}", orgId, e.getMessage());
            return null;
        }
    }

    /**
     * Builds the {@code authorized_subjects} list for an ACLX evaluate request.
     *
     * <p>Fetches each client record and delegates identifier extraction to
     * {@link ClientService#extractIdentifiers} so the ACLX HIPAA detector can
     * attribute PHI in the AI response to a specific authorized subject — or flag
     * it as a cross-patient leak when no match is found.
     *
     * <p>Non-fatal: if a client lookup fails the subject is silently skipped.
     * ACLX will still evaluate with whatever subjects were resolved, and the
     * context-scoping layer (system-prompt injection) provides the primary
     * protection anyway.
     *
     * @param orgId     org that owns the clients
     * @param clientIds IDs of clients explicitly in scope for this interaction
     * @return list of {@link AclxRequest.AuthorizedSubject}; empty if none resolved
     */
    private List<AclxRequest.AuthorizedSubject> buildAuthorizedSubjects(
            String orgId, List<String> clientIds) {
        if (clientIds == null || clientIds.isEmpty()) return List.of();
        List<AclxRequest.AuthorizedSubject> subjects = new ArrayList<>();
        for (String cid : clientIds) {
            try {
                Map<String, Object> client = clientService.getClient(orgId, cid);
                List<String> identifiers = clientService.extractIdentifiers(client);
                if (!identifiers.isEmpty()) {
                    subjects.add(AclxRequest.AuthorizedSubject.builder()
                            .subjectId(cid)
                            .identifiers(identifiers)
                            .build());
                }
            } catch (Exception e) {
                log.warn("buildAuthorizedSubjects: could not resolve client {} (skipped): {}",
                        cid, e.getMessage());
            }
        }
        return subjects;
    }

    /**
     * Evaluate user input text through ACLX before forwarding to Claude.
     *
     * <p>Sends the raw user message as if it were AI output — ACLX's HIPAA
     * detectors will catch SSNs, cross-client PHI, and other sensitive content
     * that should never reach the model context.  Returns a standard
     * {@link AclxResponse}; callers should block on BLOCK or ESCALATE decisions.
     *
     * <p>Uses a minimal identity block and no authorized subjects, since we
     * are evaluating the input before we have evaluated the subject scope.
     * Grounding sources are empty — there is no groundedness concept for input.
     *
     * @param inputText user's raw message text
     * @param user      requesting identity (for identity-aware detection)
     * @return ACLX evaluation result; ALLOW means safe to forward to Claude
     */
    public AclxResponse evaluateInput(String inputText, AppUser user) {
        if (!enabled || inputText == null || inputText.isBlank()) {
            return buildPassThrough(inputText != null ? inputText : "");
        }

        AclxRequest request = AclxRequest.builder()
                .domain(domain)
                .identity(AclxRequest.Identity.builder()
                        .subject(user.getUid())
                        .actorType("human")
                        .role(user.getRole())
                        .purpose(user.getPurpose())
                        .organization(user.getOrgId())
                        .scopes(buildScopes(user))
                        .allowedDistributions(List.of())
                        .build())
                .aiResponse(AclxRequest.AiResponse.builder()
                        .text(inputText)
                        .sources(List.of())
                        .build())
                .requestContext(AclxRequest.RequestContext.builder()
                        .timestamp(java.time.Instant.now().toString())
                        .build())
                .build();

        try {
            byte[] payload = mapper.writeValueAsBytes(request);
            HttpURLConnection conn =
                    (HttpURLConnection) new URL(gatewayUrl + "/evaluate").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(3_000);
            // 20s read: the input-guard /evaluate also runs the LLM-backed semantic
            // detector. Input-guard failure is non-fatal (passes through), but too short
            // a timeout makes every message wait then degrade — give the detector room.
            conn.setReadTimeout(20_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }

            int status = conn.getResponseCode();
            if (status != 200) {
                log.warn("ACLX input-guard returned {} — pass-through (non-fatal)", status);
                return buildPassThrough(inputText);
            }

            String body = new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return mapper.readValue(body, AclxResponse.class);

        } catch (Exception e) {
            // Input guard failure is non-fatal — local guards already ran.
            // Log and pass through rather than blocking every message when ACLX is unreachable.
            log.warn("ACLX input-guard unreachable (non-fatal): {}", e.getMessage());
            return buildPassThrough(inputText);
        }
    }

    /**
     * Build the ACLX {@code scopes} list from the user's role.
     *
     * <p>Scopes constrain the content autonomy envelope in Rego policy beyond
     * the coarse role name — e.g. {@code supervisor_review_required} lets the
     * policy apply stricter handling for BCBA_STUDENT output even within the
     * same broad ALLOW envelope as TREATING_BCBA.
     *
     * @param user authenticated user principal
     * @return ordered list of scope strings; empty for unknown roles
     */
    private List<String> buildScopes(AppUser user) {
        if (user == null || user.getRole() == null) return List.of();
        return switch (user.getRole()) {
            case ai.myaba.model.dto.UserRole.SUPERVISING_BCBA ->
                    List.of("clinical_access", "phi_read", "phi_write",
                            "document_generate", "document_approve", "caseload_oversight");

            case ai.myaba.model.dto.UserRole.RBT ->
                    List.of("session_notes_only", "phi_read_limited", "assigned_clients_only");

            case ai.myaba.model.dto.UserRole.CLINICAL_DIRECTOR ->
                    List.of("org_management", "user_management", "phi_read", "phi_write",
                            "clinical_oversight", "all_clients");

            case ai.myaba.model.dto.UserRole.ORG_SUPER_ADMIN ->
                    List.of("org_management", "user_management", "platform_config", "phi_read");

            default -> List.of();
        };
    }

    private List<String> buildClientIdList(String primaryClientId, List<String> additional) {
        List<String> ids = new ArrayList<>();
        if (primaryClientId != null && !primaryClientId.isBlank()) ids.add(primaryClientId);
        if (additional != null) {
            additional.stream()
                    .filter(id -> id != null && !id.isBlank() && !ids.contains(id))
                    .forEach(ids::add);
        }
        return ids;
    }

    private AclxResponse buildPassThrough(String text) {
        AclxResponse r = new AclxResponse();
        r.setContentId("dev-" + UUID.randomUUID());
        AclxResponse.Decision d = new AclxResponse.Decision();
        d.setDecision("ALLOW");
        d.setFinalText(text);
        d.setPolicyVersion("dev-bypass"); // prevents the null-policyVersion fail-safe from blocking
        r.setDecision(d);
        AclxResponse.AclxLabel label = new AclxResponse.AclxLabel();
        label.setDomain(domain.toUpperCase());
        label.setCategory("PHI");
        label.setSubcategory("NONE");
        label.setSensitivity("LOW");
        r.setAclx(label);
        return r;
    }

    private AclxResponse buildBlocked(String reason) {
        AclxResponse r = new AclxResponse();
        r.setContentId("blocked-" + UUID.randomUUID());
        AclxResponse.Decision d = new AclxResponse.Decision();
        d.setDecision("BLOCK");
        d.setFinalText(null);
        d.setReason(reason);
        r.setDecision(d);
        return r;
    }
}
