package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Request body for creating or updating a federation (OIDC/SAML) provider config.
 *
 * OIDC required fields: clientId, clientSecret, issuerUrl
 * SAML required fields: idpEntityId, ssoUrl, x509Certificate, rpEntityId
 */
@Data
public class FederationConfigRequest {
    @NotBlank
    private String type;           // "oidc" | "saml"
    @NotBlank
    private String displayName;    // shown on the sign-in button, e.g. "Sign in with Okta"

    // ── OIDC ─────────────────────────────────────────────────────────────────
    private String clientId;
    private String clientSecret;   // stored encrypted in production
    private String issuerUrl;      // e.g. https://accounts.google.com

    // ── SAML ─────────────────────────────────────────────────────────────────
    private String idpEntityId;    // IdP entity ID
    private String ssoUrl;         // IdP SSO endpoint
    private String x509Certificate;
    private String rpEntityId;     // Relying-party entity ID (your app)

    private Boolean isEnabled;
}
