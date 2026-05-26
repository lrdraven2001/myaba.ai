package ai.myaba.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-domain hard-block policy configuration.
 *
 * <p>Bound from the {@code aclx.domains} section of {@code application.yml}.
 * Each domain entry describes:
 * <ul>
 *   <li>{@code hardBlockScopes} — data category strings that require explicit
 *       authorization before content can be released (even to ACLX for evaluation).
 *   <li>{@code hardBlockAuthTypes} — authorization type strings that satisfy the
 *       hard-block requirement for this domain.
 *   <li>{@code hardBlockDiagnosisKeywords} — keywords in a subject's
 *       diagnosis/category field that indicate the subject's data falls under
 *       a hard-block scope.
 * </ul>
 *
 * <p>This class is intentionally domain-agnostic. The vocabulary (scope strings,
 * auth types, keywords) is defined per-domain in configuration — not hard-coded
 * in application logic.
 *
 * <p>Example config ({@code application.yml}):
 * <pre>
 *   aclx:
 *     domains:
 *       hipaa:
 *         hard-block-scopes: [SUD, PSYCHOTHERAPY, HIV, GENETIC]
 *         hard-block-auth-types: [PART_2_CONSENT, HIPAA_AUTHORIZATION]
 *         hard-block-diagnosis-keywords: [substance use, hiv, genetic, psychotherapy]
 *       ferpa:
 *         hard-block-scopes: []
 *         hard-block-auth-types: [PARENTAL_CONSENT, STUDENT_CONSENT]
 *         hard-block-diagnosis-keywords: []
 * </pre>
 */
@Component
@ConfigurationProperties(prefix = "aclx")
@Data
public class DomainPolicyConfig {

    /** Domain key (e.g. "hipaa", "ferpa") -> domain policy. */
    private Map<String, DomainPolicy> domains = new HashMap<>();

    @Data
    public static class DomainPolicy {
        private List<String> hardBlockScopes             = new ArrayList<>();
        private List<String> hardBlockAuthTypes          = new ArrayList<>();
        private List<String> hardBlockDiagnosisKeywords  = new ArrayList<>();
    }

    /** Convenience accessor — returns an empty policy if the domain is not registered. */
    public DomainPolicy forDomain(String domain) {
        return domains.getOrDefault(domain, new DomainPolicy());
    }
}
