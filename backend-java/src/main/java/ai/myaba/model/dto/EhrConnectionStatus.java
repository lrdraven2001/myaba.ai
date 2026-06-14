package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

/**
 * Public-facing status for one EHR integration.
 * Credentials are deliberately excluded — never sent to the frontend.
 */
@Data
@Builder
public class EhrConnectionStatus {

    private String ehrType;       // "centralreach" | "rethink"
    private String displayName;   // "CentralReach" | "Rethink"
    private boolean connected;

    /** "connected" | "disconnected" | "error" | "pending" */
    private String status;
    private String errorMessage;
    private String connectedAt;   // ISO-8601
    private String lastSyncAt;    // ISO-8601

    // CentralReach only — subdomain is not a secret so safe to surface
    private String subdomain;
}
