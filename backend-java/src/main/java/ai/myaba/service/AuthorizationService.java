package ai.myaba.service;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.UserRole;
import ai.myaba.security.Capability;
import ai.myaba.security.Permissions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Layer 2 authorization — enforces who can access which client records.
 *
 * Design principle: this service answers "can user X access resource Y?"
 * using the resource's own data (already fetched from Firestore / dev store).
 * It does NOT fetch from Firestore itself — that avoids circular dependencies
 * with ClientService and keeps each method a pure policy decision.
 *
 * ACLX (Layer 3) handles a separate, orthogonal concern: given the user CAN
 * access the data, what can the AI *say* about it?  These two layers are
 * intentionally decoupled — changing the ACLX policy never affects who can
 * open a client record, and changing caseload assignments never affects PHI
 * redaction rules.
 *
 * Firestore client document shape (authorizations sub-map):
 * <pre>
 *   treatingBcbaId:    String
 *   supervisingBcbaId: String (nullable)
 *   rbtIds:            List&lt;String&gt;
 *   viewerIds:         List&lt;String&gt;  (read-only: billing, scheduling per-record)
 *   memberIds:         List&lt;String&gt;  (union of all above — used for Firestore queries)
 * </pre>
 */
@Service
@Slf4j
public class AuthorizationService {

    // ── Client access ─────────────────────────────────────────────────────

    /**
     * Read access to a client record.
     * ORG_ADMIN / ORG_SUPER_ADMIN can see all client metadata;
     * clinical content is still governed by ACLX at response time.
     */
    public boolean canAccessClient(AppUser user, Map<String, Object> clientData) {
        if (UserRole.isAdmin(user.getRole())) return true;

        String uid = user.getUid();
        if (uid.equals(clientData.get("treatingBcbaId")))    return true;
        if (uid.equals(clientData.get("supervisingBcbaId"))) return true;
        if (listContains(clientData, "rbtIds", uid))         return true;
        if (listContains(clientData, "viewerIds", uid))      return true;

        return false;
    }

    /**
     * Write access to a client record (edit demographics, update assignments).
     * Treating BCBA, supervising BCBA, or org admin.
     */
    public boolean canEditClient(AppUser user, Map<String, Object> clientData) {
        if (UserRole.isAdmin(user.getRole())) return true;
        String uid = user.getUid();
        return uid.equals(clientData.get("treatingBcbaId")) ||
               uid.equals(clientData.get("supervisingBcbaId"));
    }

    /**
     * Authorisation to generate AI documents or initiate clinical chat for a client.
     * All clinical roles with read access are permitted; ACLX then governs the output.
     */
    public boolean canGenerateForClient(AppUser user, Map<String, Object> clientData) {
        if (!UserRole.isClinical(user.getRole())) {
            log.debug("canGenerateForClient denied: role {} is not clinical", user.getRole());
            return false;
        }
        return canAccessClient(user, clientData);
    }

    /**
     * Manage client authorization assignments (who is the treating BCBA, which RBTs
     * are on the case).  Restricted to treating/supervising BCBA and org admins.
     */
    public boolean canManageClientAuthorizations(AppUser user, Map<String, Object> clientData) {
        return canEditClient(user, clientData);
    }

    // ── Cross-client queries ──────────────────────────────────────────────

    /**
     * Returns the subset of {@code clientIds} that the user is NOT authorized for.
     * An empty list means the user has access to all requested clients.
     *
     * @param clientsById map of clientId → client document (all must be pre-fetched)
     */
    public List<String> getUnauthorizedClientIds(AppUser user,
                                                  List<String> clientIds,
                                                  Map<String, Map<String, Object>> clientsById) {
        return clientIds.stream()
                .filter(id -> {
                    Map<String, Object> data = clientsById.get(id);
                    if (data == null) {
                        log.warn("Client {} not found during cross-client auth check", id);
                        return true; // treat unknown as unauthorized
                    }
                    return !canAccessClient(user, data);
                })
                .toList();
    }

    // ── Org content management ────────────────────────────────────────────

    /**
     * Add / edit org-level templates and policies.
     * ORG_ADMIN and ORG_SUPER_ADMIN only — BCBAs are consumers, not authors, of org content.
     */
    public boolean canWriteOrgContent(AppUser user) {
        return Permissions.can(user, Capability.ORG_CONTENT_WRITE);
    }

    /**
     * Read org-level templates and policies.
     * All authenticated org members can read.
     */
    public boolean canReadOrgContent(AppUser user) {
        return user.getOrgId() != null && !user.getOrgId().isBlank();
    }

    // ── Projects ──────────────────────────────────────────────────────────

    /**
     * Access a project based on the project's members map.
     * {@code permission} is one of: "owner", "editor", "viewer".
     * Passing "viewer" accepts any level; "editor" accepts editor or owner; "owner" is exact.
     */
    public boolean canAccessProject(AppUser user,
                                     Map<String, Object> projectData,
                                     String requiredPermission) {
        if (UserRole.isAdmin(user.getRole())) return true;

        @SuppressWarnings("unchecked")
        Map<String, String> members = (Map<String, String>)
                projectData.getOrDefault("members", Map.of());

        String actual = members.get(user.getUid());
        if (actual == null) return false;

        return switch (requiredPermission) {
            case "viewer" -> true;                                   // any membership
            case "editor" -> "editor".equals(actual) || "owner".equals(actual);
            case "owner"  -> "owner".equals(actual);
            default       -> false;
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private boolean listContains(Map<String, Object> data, String field, String value) {
        Object raw = data.get(field);
        if (!(raw instanceof List)) return false;
        return ((List<String>) raw).contains(value);
    }
}
