package ai.myaba.service;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.DriveConnectionRequest;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Service for managing HIPAA-compliant Drive (Google Drive / OneDrive) connections.
 *
 * Firestore path: organizations/{orgId}/driveConnections/{id}
 *
 * Dev mode: uses in-memory stub data.
 * Prod mode: stores in Firestore; HIPAA label verification would call the Drive Labels API.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DriveService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    private final Map<String, Map<String, Object>> devConnections = new LinkedHashMap<>();

    // ── Dev data seed ─────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        Map<String, Object> seed = new HashMap<>();
        seed.put("id",                     "drv-001");
        seed.put("driveSource",            "google");
        seed.put("driveItemId",            "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs");
        seed.put("driveItemName",          "HIPAA Policy Manual 2024");
        seed.put("driveItemUrl",           "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view");
        seed.put("driveItemType",          "file");
        seed.put("hipaaVerified",          true);
        seed.put("hipaaLabelName",         "PHI – Restricted");
        seed.put("hipaaAcknowledged",      true);
        seed.put("permissionType",         "org_roles");
        seed.put("allowedRoles",           List.of("SUPERVISING_BCBA", "ORG_ADMIN", "ORG_SUPER_ADMIN"));
        seed.put("allowedUserIds",         List.of());
        seed.put("clientId",               "");
        seed.put("inheritClientPermissions", false);
        seed.put("orgId",                  "dev-org-001");
        seed.put("linkedBy",               "dev-user-001");
        seed.put("linkedAt",               "2026-01-01T00:00:00Z");
        seed.put("notes",                  "");

        devConnections.put("drv-001", seed);
        log.info("Dev mode: seeded {} drive connections", devConnections.size());
    }

    // ── Queries ───────────────────────────────────────────────────────────

    /**
     * Returns drive connections for the user's organization that the caller is
     * permitted to see.
     *
     * <p>Permission is determined by the connection's {@code permissionType} field:
     * <ul>
     *   <li>{@code org_roles} — visible only to users whose role appears in
     *       {@code allowedRoles}, plus org admins (who always see everything).</li>
     *   <li>{@code individual} — visible only to the users in {@code allowedUserIds},
     *       plus org admins.</li>
     *   <li>{@code client_inherited} — visible only to users assigned to the
     *       linked client (checked via the {@code assignedClinicians} list on the
     *       client record), plus org admins.  Simple check here: any clinical user
     *       sees client-scoped connections — the full client-assignment check is done
     *       at the point of AI context injection by PolicyRagService / DriveRagService.</li>
     *   <li>No permissionType or unrecognised value — visible to all org members
     *       (open / legacy records).</li>
     * </ul>
     *
     * <p>Note: visibility here controls whether the connection appears in the
     * Resource Library UI and whether it is used as an AI grounding source.
     * Actual file access is always controlled by the Drive provider's own sharing
     * settings (Google Drive permissions / OneDrive ACLs) — myABA never proxies
     * file content, it stores only the reference URL.
     */
    public List<Map<String, Object>> getConnections(AppUser user) throws Exception {
        if (devMode) {
            return devConnections.values().stream()
                    .filter(c -> user.getOrgId().equals(c.get("orgId")))
                    .filter(c -> canSeeConnection(user, c))
                    .collect(Collectors.toList());
        }

        Firestore db = FirestoreClient.getFirestore();
        var docs = db.collection("organizations").document(user.getOrgId())
                .collection("driveConnections").get().get().getDocuments();
        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        })
        .filter(c -> canSeeConnection(user, c))
        .collect(Collectors.toList());
    }

    /**
     * Returns true when the given user is permitted to see this drive connection.
     *
     * Admins always see all connections in their org.
     * The linking user always sees their own connection.
     * Everyone else is subject to the permissionType rules.
     */
    private boolean canSeeConnection(AppUser user, Map<String, Object> conn) {
        // Admins see everything in their org
        if (user.isAdmin()) return true;

        // The person who linked it always sees it
        if (user.getUid().equals(conn.get("linkedBy"))) return true;

        String permType = (String) conn.getOrDefault("permissionType", "open");

        return switch (permType) {
            case "org_roles" -> {
                Object raw = conn.get("allowedRoles");
                if (!(raw instanceof List)) yield true; // malformed — show it
                @SuppressWarnings("unchecked")
                List<String> allowed = (List<String>) raw;
                yield allowed.isEmpty() || allowed.contains(user.getRole());
            }
            case "individual" -> {
                Object raw = conn.get("allowedUserIds");
                if (!(raw instanceof List)) yield false;
                @SuppressWarnings("unchecked")
                List<String> allowed = (List<String>) raw;
                yield allowed.contains(user.getUid());
            }
            case "client_inherited" ->
                // Clinical users see client-scoped connections.
                // The actual client-assignment check happens at AI context injection.
                user.isClinical();
            default ->
                // "open" or unrecognised — visible to all org members
                true;
        };
    }

    /**
     * Creates a new drive connection record for the user's organization.
     *
     * @return the generated connection ID
     */
    public String createConnection(AppUser user, DriveConnectionRequest req) throws Exception {
        String now = Instant.now().toString();
        String id = "drv-" + UUID.randomUUID().toString().substring(0, 8);

        Map<String, Object> data = new HashMap<>();
        data.put("id",                     id);
        data.put("driveSource",            req.getDriveSource());
        data.put("driveItemId",            req.getDriveItemId() != null ? req.getDriveItemId() : "");
        data.put("driveItemName",          req.getDriveItemName());
        data.put("driveItemUrl",           req.getDriveItemUrl());
        data.put("driveItemType",          req.getDriveItemType() != null ? req.getDriveItemType() : "file");
        data.put("hipaaVerified",          req.isHipaaVerified());
        data.put("hipaaLabelName",         req.getHipaaLabelName() != null ? req.getHipaaLabelName() : "");
        data.put("hipaaAcknowledged",      req.isHipaaAcknowledged());
        data.put("permissionType",         req.getPermissionType());
        data.put("allowedRoles",           req.getAllowedRoles() != null ? req.getAllowedRoles() : List.of());
        data.put("allowedUserIds",         req.getAllowedUserIds() != null ? req.getAllowedUserIds() : List.of());
        data.put("clientId",               req.getClientId() != null ? req.getClientId() : "");
        data.put("inheritClientPermissions", req.isInheritClientPermissions());
        data.put("notes",                  req.getNotes() != null ? req.getNotes() : "");
        data.put("orgId",                  user.getOrgId());
        data.put("linkedBy",               user.getUid());
        data.put("linkedAt",               now);

        if (devMode) {
            devConnections.put(id, data);
            log.info("Dev mode: created drive connection {} for org {}", id, user.getOrgId());
            return id;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection("organizations").document(user.getOrgId())
                .collection("driveConnections").document(id).set(data).get();
        return id;
    }

    /**
     * Deletes a drive connection. Only the user who linked it or an org admin can delete it.
     *
     * @throws SecurityException if the caller is not the owner or an admin
     * @throws NoSuchElementException if the connection does not exist
     */
    public void deleteConnection(AppUser user, String id) throws Exception {
        Map<String, Object> conn = fetchConnection(user.getOrgId(), id);

        boolean isOwner = user.getUid().equals(conn.get("linkedBy"));
        boolean isAdmin = user.isAdmin();
        if (!isOwner && !isAdmin) {
            throw new SecurityException("Only the user who linked this document or an admin can remove it.");
        }

        if (devMode) {
            devConnections.remove(id);
            log.info("Dev mode: deleted drive connection {}", id);
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection("organizations").document(user.getOrgId())
                .collection("driveConnections").document(id).delete().get();
    }

    /**
     * Verifies whether a Drive item has a HIPAA/PHI classification label applied.
     *
     * In dev mode this always returns "not verified" to force the acknowledgment flow.
     * In production this would call the Google Drive Labels API or Microsoft Purview API.
     *
     * @param driveSource "google" or "microsoft"
     * @param url         the Drive share URL
     * @return verification result map
     */
    public Map<String, Object> verifyHipaaLabels(String driveSource, String url) {
        if (devMode) {
            String itemId = extractItemId(url);
            String providerName = "google".equalsIgnoreCase(driveSource) ? "Google Drive" : "OneDrive";
            Map<String, Object> result = new HashMap<>();
            result.put("verified",   false);
            result.put("itemId",     itemId);
            result.put("labelName",  "");
            result.put("message",    "No HIPAA labels detected in " + providerName +
                    ". Please confirm PHI classification before linking.");
            return result;
        }

        // Production: call Drive Labels API / Microsoft Purview
        // TODO: implement when cloud credentials are available
        String itemId = extractItemId(url);
        Map<String, Object> result = new HashMap<>();
        result.put("verified",   false);
        result.put("itemId",     itemId);
        result.put("labelName",  "");
        result.put("message",    "HIPAA label verification is not yet configured in this environment.");
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private Map<String, Object> fetchConnection(String orgId, String id) throws Exception {
        if (devMode) {
            Map<String, Object> c = devConnections.get(id);
            if (c == null) throw new NoSuchElementException("Drive connection not found: " + id);
            if (!orgId.equals(c.get("orgId")))
                throw new NoSuchElementException("Drive connection not found: " + id);
            return c;
        }

        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection("organizations").document(orgId)
                .collection("driveConnections").document(id).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Drive connection not found: " + id);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    /**
     * Extracts a Drive item ID from a share URL.
     * Handles patterns like:
     *   /d/{id}/view          — Google Drive file
     *   /folders/{id}         — Google Drive folder
     *   /file/d/{id}/...      — Google Drive file (alternate)
     *   Anything else         — falls back to a UUID substring
     */
    private String extractItemId(String url) {
        if (url == null || url.isBlank()) {
            return UUID.randomUUID().toString().substring(0, 16);
        }

        // Match /d/{id} or /folders/{id}
        Pattern pattern = Pattern.compile("/(?:d|folders)/([a-zA-Z0-9_-]+)");
        Matcher matcher = pattern.matcher(url);
        if (matcher.find()) {
            return matcher.group(1);
        }

        // Fallback: use a UUID substring
        return UUID.randomUUID().toString().substring(0, 16);
    }
}
