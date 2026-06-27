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
    /**
     * "clinical_director" (default) — org creator signs the BAA now and is assigned
     *   CLINICAL_DIRECTOR role with full PHI access.
     * "it_setup" — an IT admin is setting up the org on behalf of the clinical director;
     *   creator is assigned ORG_ADMIN with no PHI access. BAA must be signed later by
     *   someone with the CLINICAL_DIRECTOR role before PHI features are unlocked.
     */
    private String setupMode; // "clinical_director" | "it_setup"
}
