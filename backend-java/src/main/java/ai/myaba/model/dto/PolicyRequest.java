package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class PolicyRequest {
    @NotBlank
    private String title;
    @NotBlank
    private String category;    // policy_manual | sop | handbook | clinical_sop | hipaa | billing
    private String textContent; // full text — will pass through DLP once configured
    private Boolean isActive;

    /**
     * One or more purpose tags that declare how this resource will be used by the ACLX Gateway.
     * <ul>
     *   <li>{@code GENERATION} — content is used as source material when generating new documents
     *       (e.g. drafting a policy from a template).</li>
     *   <li>{@code GROUNDING} — content is injected as grounding context so that AI output stays
     *       factually anchored to this resource (e.g. regulatory text, payer rules).</li>
     *   <li>{@code CLASSIFICATION} — content is used as a reference label or rubric when
     *       classifying or tagging other documents.</li>
     * </ul>
     * A single resource may carry multiple purposes (e.g. GROUNDING + CLASSIFICATION).
     */
    private List<String> purposes;

    /**
     * Declares the structural type of this resource so the Gateway can apply the correct
     * handling rules and output filters.
     * <ul>
     *   <li>{@code POLICY} (default) — an organizational policy or procedure document.</li>
     *   <li>{@code TEMPLATE} — a reusable document template with variable placeholders.</li>
     *   <li>{@code CLIENT_RECORD} — a client-specific record (triggers HIPAA PHI controls).</li>
     *   <li>{@code REGULATION} — external regulatory or legal text (e.g. IDEA, HIPAA statute).</li>
     *   <li>{@code PAYER_REQUIREMENT} — payer- or insurer-specific coverage criteria or rules.</li>
     *   <li>{@code STANDARD} — a professional or clinical standard (e.g. BACB Ethics Code).</li>
     * </ul>
     */
    private String resourceType;

    /**
     * Optional client identifier that scopes this resource to a specific client.
     * When set, the ACLX Gateway will restrict groundedness checking and output
     * to the context of the identified client, preventing cross-client data leakage.
     * Leave {@code null} for org-wide resources that are not client-specific.
     */
    private String clientId;
}
