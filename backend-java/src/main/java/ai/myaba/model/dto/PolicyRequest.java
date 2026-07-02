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
     * The bucket this resource belongs to — a clean, non-overlapping classification used
     * by the Resources screen tabs. Each bucket can be used in any chat.
     * <ul>
     *   <li>{@code LIBRARY} — the Agency Library: Standard Templates, Generation Templates,
     *       and Knowledge References.</li>
     *   <li>{@code GROUNDING} — trusted sources the AI's facts are checked against to
     *       prevent hallucinations.</li>
     *   <li>{@code POLICY} (default) — the agency's rules and SOPs.</li>
     * </ul>
     */
    private String bucket;

    /**
     * For a {@code GENERATION_TEMPLATE} library resource, the client document type this
     * template customizes (e.g. {@code behavior_intervention_plan}). Matches the document
     * type values on the client "Generate Document" page.
     */
    private String documentType;

    /**
     * For seeded default templates: {@code false} until an agency edits the template, then
     * {@code true}. Drives the (Default)/(Customized) label on the Generate Document picker.
     */
    private Boolean customized;

    /**
     * Optional client identifier that scopes this resource to a specific client.
     * When set, the ACLX Gateway will restrict groundedness checking and output
     * to the context of the identified client, preventing cross-client data leakage.
     * Leave {@code null} for org-wide resources that are not client-specific.
     */
    private String clientId;

    // ── Resource-manager metadata (Library / Templates redesign) ────────────

    /** Short human description / subtitle shown in the table and details panel. */
    private String description;

    /** Topical category pill, e.g. Billing | Clinical | Supervision | Parent Training | Intake | Reports | Discharge | Training | Other. */
    private String topicCategory;

    /** File format: PDF | DOCX | PPTX | XLSX | LINK | TEXT. */
    private String fileType;

    /** Where the resource originates: DRIVE | ONEDRIVE | WEB | UPLOAD | MANUAL. */
    private String source;

    /** External URL for LINK / DRIVE / ONEDRIVE / WEB sources. */
    private String url;

    /** Folder path for organization, e.g. "/Resources/Billing/2025/". */
    private String folder;

    /** When true, shared with the whole org; when false, private to the creator. */
    private Boolean shared;

    /** When true, the resource is archived (hidden from active lists, kept for restore). */
    private Boolean archived;

    /**
     * When true, the resource is HIPAA-marked: it can only be archived, and hard
     * deletion is allowed no sooner than 7 days after archiving (enforced server-side).
     */
    private Boolean hipaaMarked;

    /** IDs of templates/clients this resource is linked to (drives the "Linked to" count). */
    private List<String> linkedIds;
}
