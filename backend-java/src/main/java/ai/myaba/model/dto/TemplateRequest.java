package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class TemplateRequest {
    @NotBlank
    private String title;
    @NotBlank
    private String category;   // bip | fba | progress_note | skill_acquisition | parent_training | other
    private String content;    // template body text
    /** Roles that can see this template; empty list = visible to all. */
    private List<String> visibleToRoles;
}
