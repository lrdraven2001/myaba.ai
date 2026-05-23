package ai.myaba.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ClientRequest {
    @NotBlank
    private String legalName;
    private String preferredName;
    private String dateOfBirth;
    private String gender;
    private String diagnosis;
    private String primaryInsurance;
    private String ehrProvider;
    private String ehrCaseId;
}
