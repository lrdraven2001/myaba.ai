package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class PolicyRequest {
    @NotBlank
    private String title;
    @NotBlank
    private String category;    // policy_manual | sop | handbook | clinical_sop | hipaa | billing
    private String textContent; // full text — will pass through DLP once configured
    private Boolean isActive;
}
