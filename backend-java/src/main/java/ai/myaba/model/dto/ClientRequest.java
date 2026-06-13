package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class ClientRequest {
    // ── Demographics ──────────────────────────────────────────────────────
    @NotBlank
    private String firstName;
    @NotBlank
    private String lastName;
    private String preferredName;      // optional "goes by" / de-identified display name
    private String dateOfBirth;
    private String gender;
    private String diagnosis;
    private String primaryInsurance;
    private String ehrProvider;
    private String ehrCaseId;

    // ── Authorization assignments ─────────────────────────────────────────
    // If treatingBcbaId is omitted on creation, the requesting user is used.
    private String treatingBcbaId;
    private String supervisingBcbaId;
    private List<String> rbtIds;
    private List<String> viewerIds;    // read-only access (e.g., billing for specific codes)
}
