package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AppUser {
    private String uid;
    private String email;
    private String role;       // TREATING_BCBA, RBT, etc.
    private String purpose;    // treatment, scheduling, etc.
    private String orgId;
}
