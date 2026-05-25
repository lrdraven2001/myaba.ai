package ai.myaba.model.dto;

import lombok.Data;
import java.util.List;

@Data
public class DriveConnectionRequest {
    private String driveSource;          // "google" | "microsoft"
    private String driveItemId;          // ID extracted from URL
    private String driveItemName;
    private String driveItemUrl;
    private String driveItemType;        // "file" | "folder"
    private boolean hipaaVerified;
    private String hipaaLabelName;
    private boolean hipaaAcknowledged;
    private String permissionType;       // "org_roles" | "individual" | "client_inherited"
    private List<String> allowedRoles;
    private List<String> allowedUserIds;
    private String clientId;
    private boolean inheritClientPermissions;
    private String notes;
}
