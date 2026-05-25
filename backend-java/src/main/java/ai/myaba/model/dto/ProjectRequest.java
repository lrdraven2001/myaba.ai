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
     * Custom system prompt injected into every Claude call made within this project.
     * Think of it like project-level instructions — "You are helping a BCBA team review…"
     */
    private String instructions;
    private List<String> clientIds;
    private Boolean isShared;
    /** Initial members beyond the owner: { userId: "editor"|"viewer" } */
    private Map<String, String> members;
}
