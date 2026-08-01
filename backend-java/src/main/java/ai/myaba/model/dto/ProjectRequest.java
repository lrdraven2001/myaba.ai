package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class ProjectRequest {
    @NotBlank
    private String title;
    private String description;
    /**
     * Custom system prompt injected into every Gemini call made within this project.
     * Think of it like project-level instructions — "You are helping a BCBA team review…"
     */
    private String instructions;
    private List<String> clientIds;
    private Boolean isShared;
    /**
     * When true, this project contains PHI and may only be shared with users
     * who hold a clinical or administrative org role. GENERAL_STAFF, SCHEDULING_ADMIN,
     * and BILLING_ADMIN are blocked from being added as members and are excluded
     * from org-wide sharing of PHI projects.
     */
    private Boolean containsPhi;
    /** Default PHI behavior for new document uploads: "ask" (default) | "always" | "never". */
    private String documentPhiDefault;
    /** Initial members beyond the owner: { userId: "editor"|"viewer" } */
    private Map<String, String> members;
}
