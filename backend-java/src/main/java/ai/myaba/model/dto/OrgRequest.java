package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OrgRequest {
    @NotBlank
    private String name;
    /** solo | team | enterprise */
    @NotBlank
    private String plan;
    /** Optional: display name for the org creator (stored on the admin user record). */
    private String adminDisplayName;
}
