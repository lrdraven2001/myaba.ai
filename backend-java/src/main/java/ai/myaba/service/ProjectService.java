package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ProjectRequest;
import ai.myaba.model.dto.UserRole;
import ai.myaba.security.Capability;
import ai.myaba.security.Permissions;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Project collaboration service.
 *
 * Firestore paths:
 *   organizations/{orgId}/projects/{projectId}
 *   organizations/{orgId}/projects/{projectId}/knowledgeDocs/{docId}
 *
 * Project document shape:
 * <pre>
 *   id:           String
 *   title:        String
 *   description:  String|null
 *   instructions: String|null   ← system prompt injected into every chat in this project
 *   orgId:        String
 *   ownerId:      String
 *   clientIds:    List&lt;String&gt;
 *   isShared:     Boolean
 *   members:      Map&lt;String,String&gt;  { userId: "editor"|"viewer" }
 *   memberIds:    List&lt;String&gt;        denormalized union of ownerId + member keys
 *   createdAt:    String (ISO-8601)
 *   updatedAt:    String (ISO-8601)
 * </pre>
 *
 * Knowledge document shape:
 * <pre>
 *   id:          String
 *   projectId:   String
 *   title:       String
 *   textContent: String
 *   createdAt:   String (ISO-8601)
 * </pre>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    // Injected (via @RequiredArgsConstructor) — used by the project file-upload path.
    private final DocumentFormatService documentFormatService;
    private final GcsStorageService     gcsStorageService;
    private final OrgService            orgService;

    private final Map<String, Map<String, Object>>       devProjects      = new LinkedHashMap<>();
    /** projectId → ordered list of knowledge docs */
    private final Map<String, List<Map<String, Object>>> devKnowledgeDocs = new ConcurrentHashMap<>();

    // ── Dev data seed ─────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        // No sample projects seeded — testers create their own data.
    }

    private void put(String id, Map<String, Object> data) {
        Map<String, Object> m = new HashMap<>(data);
        m.put("id", id);
        devProjects.put(id, m);
        devKnowledgeDocs.putIfAbsent(id, new ArrayList<>());
    }

    private void addDevKnowledgeDoc(String projectId, String docId, String title, String text) {
        Map<String, Object> doc = new HashMap<>();
        doc.put("id",          docId);
        doc.put("projectId",   projectId);
        doc.put("title",       title);
        doc.put("textContent", text);
        doc.put("createdAt",   "2026-04-01T00:00:00Z");
        devKnowledgeDocs.computeIfAbsent(projectId, k -> new ArrayList<>()).add(doc);
    }

    // ── Project queries ───────────────────────────────────────────────────

    public List<Map<String, Object>> getProjects(AppUser user) throws Exception {
        if (devMode) {
            return devProjects.values().stream()
                    .filter(p -> p.get("deletedAt") == null)   // hide soft-deleted
                    .filter(p -> canAccessProject(user, p))
                    .sorted(Comparator.comparing(
                        (Map<String, Object> p) -> (String) p.getOrDefault("updatedAt", ""),
                        Comparator.reverseOrder()))
                    .collect(Collectors.toList());
        }
        Firestore db = FirestoreClient.getFirestore();
        Query query = user.isAdmin()
            ? db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                 .collection(FirestoreCollections.PROJECTS).orderBy("updatedAt", Query.Direction.DESCENDING)
            : db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                 .collection(FirestoreCollections.PROJECTS)
                 .whereArrayContains("memberIds", user.getUid())
                 .orderBy("updatedAt", Query.Direction.DESCENDING);
        // Exclude soft-deleted in memory (avoids a composite index on deletedAt + updatedAt).
        return toList(query.get().get().getDocuments()).stream()
                .filter(p -> p.get("deletedAt") == null)
                .collect(Collectors.toList());
    }

    public Map<String, Object> getProject(AppUser user, String projectId) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canAccessProject(user, project))
            throw new SecurityException("Access denied to project: " + projectId);
        return project;
    }

    // ── Project writes ────────────────────────────────────────────────────

    public String createProject(AppUser user, ProjectRequest req) throws Exception {
        String now = TimestampUtil.now();
        List<String> clientIds      = req.getClientIds() != null ? req.getClientIds() : List.of();
        Map<String, String> members = req.getMembers()   != null ? req.getMembers()   : Map.of();

        // NOTE: `isShared` is retired — projects are strictly per-member (owner +
        // explicit members), never auto-shared org-wide. The DTO field is kept for
        // backward-compatible deserialization but is no longer persisted or read.
        Map<String, Object> data = new HashMap<>();
        data.put("title",        req.getTitle());
        data.put("description",  req.getDescription()  != null ? req.getDescription()  : "");
        data.put("instructions", req.getInstructions() != null ? req.getInstructions() : "");
        data.put("orgId",        user.getOrgId());
        data.put("ownerId",      user.getUid());
        data.put("clientIds",    clientIds);
        data.put("containsPhi",  Boolean.TRUE.equals(req.getContainsPhi()));
        data.put("documentPhiDefault", req.getDocumentPhiDefault() != null ? req.getDocumentPhiDefault() : "ask");
        data.put("members",      members);
        data.put("memberIds",    computeMemberIds(user.getUid(), members));
        data.put("createdAt",    now);
        data.put("updatedAt",    now);

        if (devMode) {
            String id = "proj-" + UUID.randomUUID().toString().substring(0, 8);
            data.put("id", id);
            devProjects.put(id, data);
            devKnowledgeDocs.put(id, new ArrayList<>());
            return id;
        }
        Firestore db = FirestoreClient.getFirestore();
        return db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                  .collection(FirestoreCollections.PROJECTS).add(data).get().getId();
    }

    public void updateProject(AppUser user, String projectId, ProjectRequest req) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canManageProject(user, project))
            throw new SecurityException("Cannot update project: " + projectId);

        Map<String, Object> updates = new HashMap<>();
        if (req.getTitle()        != null) updates.put("title",        req.getTitle());
        if (req.getDescription()  != null) updates.put("description",  req.getDescription());
        if (req.getInstructions() != null) updates.put("instructions", req.getInstructions());
        if (req.getClientIds()    != null) updates.put("clientIds",    req.getClientIds());
        // `isShared` intentionally ignored — retired (see createProject).
        if (req.getContainsPhi()  != null) updates.put("containsPhi",  req.getContainsPhi());
        if (req.getDocumentPhiDefault() != null) updates.put("documentPhiDefault", req.getDocumentPhiDefault());
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) { project.putAll(updates); return; }

        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection(FirestoreCollections.PROJECTS).document(projectId).update(updates).get();
    }

    public void shareMember(AppUser user, String projectId, String targetUserId, String role) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canManageProject(user, project))
            throw new SecurityException("Cannot share project: " + projectId);

        @SuppressWarnings("unchecked")
        Map<String, String> members = new HashMap<>((Map<String, String>) project.getOrDefault("members", Map.of()));
        String ownerId = (String) project.get("ownerId");

        if (role == null) {
            members.remove(targetUserId);
        } else {
            if (!"editor".equals(role) && !"viewer".equals(role))
                throw new IllegalArgumentException("Role must be 'editor' or 'viewer'");
            // PHI gate (ENFORCED): a member added to a PHI-flagged project must be
            // able to access PHI. Look up the target's org-member record and reject
            // if they lack PHI access — no longer merely logged.
            if (Boolean.TRUE.equals(project.get("containsPhi")) && !memberHasPhiAccess(user.getOrgId(), targetUserId)) {
                log.warn("Blocked PHI project member add: projectId={} targetUser={} lacks PHI access",
                        projectId, targetUserId);
                throw new IllegalArgumentException(
                        "This project contains PHI. Only members with PHI access (a clinical role) can be added.");
            }
            members.put(targetUserId, role);
        }

        List<String> memberIds = computeMemberIds(ownerId, members);
        String now = TimestampUtil.now();

        if (devMode) {
            project.put("members", members); project.put("memberIds", memberIds); project.put("updatedAt", now);
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection(FirestoreCollections.PROJECTS).document(projectId)
          .update(Map.of("members", members, "memberIds", memberIds, "updatedAt", now)).get();
    }

    /** Soft-delete: marks the project deleted (recoverable for 48h by a super admin). */
    public void deleteProject(AppUser user, String projectId) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canManageProject(user, project))
            throw new SecurityException("Cannot delete project: " + projectId);

        String now = TimestampUtil.now();
        if (devMode) {
            Map<String, Object> p = devProjects.get(projectId);
            if (p != null) { p.put("deletedAt", now); p.put("deletedBy", user.getUid()); }
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection(FirestoreCollections.PROJECTS).document(projectId)
          .update(Map.of("deletedAt", now, "deletedBy", user.getUid())).get();
    }

    /**
     * Restore a soft-deleted project — super admin (Practice Administrator) only,
     * within the 48-hour window. Lets the owner's org recover work deleted on the
     * way out the door.
     */
    public void restoreProject(AppUser user, String projectId) throws Exception {
        if (!Permissions.can(user, Capability.ADMIN_SUPER))
            throw new SecurityException("Only a Practice Administrator can restore projects.");
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        Object deletedAt = project.get("deletedAt");
        if (deletedAt == null)
            throw new IllegalStateException("Project is not deleted.");
        if (!withinRestoreWindow(String.valueOf(deletedAt)))
            throw new IllegalStateException("The 48-hour restore window has passed.");

        if (devMode) {
            Map<String, Object> p = devProjects.get(projectId);
            if (p != null) { p.remove("deletedAt"); p.remove("deletedBy"); }
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection(FirestoreCollections.PROJECTS).document(projectId)
          .update("deletedAt", com.google.cloud.firestore.FieldValue.delete(),
                  "deletedBy", com.google.cloud.firestore.FieldValue.delete()).get();
    }

    /**
     * Trashed projects still within the 48-hour restore window. Super admin only —
     * shows ALL deleted projects in the org so nothing is lost silently.
     */
    public List<Map<String, Object>> getTrashedProjects(AppUser user) throws Exception {
        if (!Permissions.can(user, Capability.ADMIN_SUPER))
            throw new SecurityException("Only a Practice Administrator can view trashed projects.");
        java.util.stream.Stream<Map<String, Object>> all;
        if (devMode) {
            all = devProjects.values().stream();
        } else {
            Firestore db = FirestoreClient.getFirestore();
            all = toList(db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                    .collection(FirestoreCollections.PROJECTS).get().get().getDocuments()).stream();
        }
        return all
                .filter(p -> p.get("deletedAt") != null)
                .filter(p -> withinRestoreWindow(String.valueOf(p.get("deletedAt"))))
                .sorted(Comparator.comparing(
                        (Map<String, Object> p) -> (String) p.getOrDefault("deletedAt", ""),
                        Comparator.reverseOrder()))
                .collect(Collectors.toList());
    }

    /** True if the given ISO timestamp is within the last 48 hours. */
    private boolean withinRestoreWindow(String deletedAtIso) {
        try {
            return Instant.parse(deletedAtIso).isAfter(Instant.now().minus(java.time.Duration.ofHours(48)));
        } catch (Exception e) {
            return false;
        }
    }

    // ── Knowledge docs ────────────────────────────────────────────────────

    public List<Map<String, Object>> getKnowledgeDocs(AppUser user, String projectId) throws Exception {
        Map<String, Object> project = getProject(user, projectId); // auth check + owner lookup
        List<Map<String, Object>> docs;
        if (devMode) {
            docs = new ArrayList<>(devKnowledgeDocs.getOrDefault(projectId, List.of()));
        } else {
            Firestore db = FirestoreClient.getFirestore();
            var snaps = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                          .collection(FirestoreCollections.PROJECTS).document(projectId)
                          .collection("knowledgeDocs")
                          .orderBy("createdAt").get().get().getDocuments();
            docs = toList(snaps);
        }

        // "Uploaded by" fallback for docs that never captured an uploader (legacy
        // pasted/extracted docs): show the project owner, then the org owner.
        boolean anyBlank = docs.stream().anyMatch(d -> {
            Object cb = d.get("createdBy");
            return cb == null || String.valueOf(cb).isBlank();
        });
        if (anyBlank) {
            String fallback = resolveUploaderFallback(user.getOrgId(), project);
            if (!fallback.isBlank()) {
                for (Map<String, Object> doc : docs) {
                    Object cb = doc.get("createdBy");
                    if (cb == null || String.valueOf(cb).isBlank()) doc.put("createdBy", fallback);
                }
            }
        }
        return docs;
    }

    /**
     * Resolve the display name to show for a blank "Uploaded by": the project
     * owner first, then the organization owner. Returns "" if neither resolves.
     */
    private String resolveUploaderFallback(String orgId, Map<String, Object> project) {
        // Project owner first, then the org owner — two point member reads instead
        // of listing + permission-resolving the entire org membership. getOrg() is
        // cached, so the org-owner lookup is effectively free.
        String name = orgService.getMemberName(orgId, (String) project.get("ownerId"));
        if (!name.isBlank()) return name;
        try {
            Map<String, Object> org = orgService.getOrg(orgId);
            String orgOwnerUid = org != null ? (String) org.get("adminUid") : null;
            name = orgService.getMemberName(orgId, orgOwnerUid);
            if (!name.isBlank()) return name;
        } catch (Exception e) {
            log.warn("resolveUploaderFallback: org owner resolution failed for {}: {}", orgId, e.getMessage());
        }
        return "";
    }

    /**
     * Add a knowledge document to a project.
     * Returns the new document's ID.
     */
    /** Human label for the "Uploaded by" column: prefer the display name, fall back to email. */
    private static String uploaderName(AppUser user) {
        String name = user.getDisplayName();
        if (name != null && !name.isBlank()) return name;
        return user.getEmail() != null ? user.getEmail() : "";
    }

    public String addKnowledgeDoc(AppUser user, String projectId,
                                   String title, String textContent,
                                   String sourceFilename, boolean containsPhi) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canEditProject(user, project))
            throw new SecurityException("Cannot add knowledge to project: " + projectId);

        String now = TimestampUtil.now();
        Map<String, Object> doc = new HashMap<>();
        doc.put("projectId",   projectId);
        doc.put("title",       title);
        doc.put("textContent", textContent != null ? textContent : "");
        doc.put("description", "");            // per-document description (editable in the UI)
        doc.put("containsPhi", containsPhi);   // per-document PHI flag (independent of the project flag)
        if (sourceFilename != null && !sourceFilename.isBlank())
            doc.put("sourceFilename", sourceFilename);
        doc.put("createdBy",   uploaderName(user));
        doc.put("createdAt",   now);

        if (devMode) {
            String id = "kd-" + UUID.randomUUID().toString().substring(0, 8);
            doc.put("id", id);
            devKnowledgeDocs.computeIfAbsent(projectId, k -> new ArrayList<>()).add(doc);
            return id;
        }
        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                    .collection(FirestoreCollections.PROJECTS).document(projectId)
                    .collection("knowledgeDocs").add(doc).get();
        return ref.getId();
    }

    /** Remove a knowledge document from a project (Firestore record + GCS original). */
    public void removeKnowledgeDoc(AppUser user, String projectId, String docId) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canEditProject(user, project))
            throw new SecurityException("Cannot remove knowledge from project: " + projectId);

        if (devMode) {
            List<Map<String, Object>> docs = devKnowledgeDocs.get(projectId);
            if (docs != null) docs.removeIf(d -> docId.equals(d.get("id")));
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection(FirestoreCollections.PROJECTS).document(projectId)
          .collection("knowledgeDocs").document(docId);
        // Delete the GCS original first (best-effort), then the Firestore record.
        var snap = ref.get().get();
        if (snap.exists()) {
            Object gcsObject = snap.get("gcsObject");
            if (gcsObject instanceof String s && !s.isBlank()) gcsStorageService.delete(s);
        }
        ref.delete().get();
    }

    /**
     * Update a knowledge document's editable metadata — {@code description} and the per-document
     * {@code containsPhi} flag. Only the given fields are touched (null = leave unchanged).
     */
    public void updateKnowledgeDoc(AppUser user, String projectId, String docId,
                                   String description, Boolean containsPhi) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canEditProject(user, project))
            throw new SecurityException("Cannot edit knowledge in project: " + projectId);

        Map<String, Object> updates = new HashMap<>();
        if (description != null) updates.put("description", description);
        if (containsPhi != null) updates.put("containsPhi", containsPhi);
        if (updates.isEmpty()) return;
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) {
            List<Map<String, Object>> docs = devKnowledgeDocs.get(projectId);
            if (docs != null) docs.stream().filter(d -> docId.equals(d.get("id"))).forEach(d -> d.putAll(updates));
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection(FirestoreCollections.PROJECTS).document(projectId)
          .collection("knowledgeDocs").document(docId).update(updates).get();
    }

    // ── Project file upload (parity with client document upload) ────────────────

    /**
     * Create a PROCESSING placeholder knowledge doc for an uploaded file and
     * return its ID immediately. Heavy extraction + the GCS original upload run in
     * the background via {@link #finalizeKnowledgeUpload}.
     *
     * <p>Gated by {@link #canEditProject}. Enforces the PHI rule: a document may
     * only be saved into a project that is PHI-flagged ({@code containsPhi=true}) —
     * this blocks client-specific PHI leaking into a non-PHI (possibly multi-client)
     * project library.
     *
     * @throws SecurityException     if the caller cannot edit the project
     * @throws IllegalStateException with message {@code "PHI_NOT_ENABLED"} if the
     *                               project is not PHI-flagged
     */
    public String createKnowledgePlaceholder(AppUser user, String projectId,
                                              String title, String filename) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canEditProject(user, project))
            throw new SecurityException("Cannot add knowledge to project: " + projectId);
        if (!Boolean.TRUE.equals(project.get("containsPhi")))
            throw new IllegalStateException("PHI_NOT_ENABLED");

        String now = TimestampUtil.now();
        Map<String, Object> doc = new HashMap<>();
        doc.put("projectId",        projectId);
        doc.put("title",            title);
        doc.put("textContent",      "");
        doc.put("source",           "upload");
        doc.put("sourceFilename",   filename);
        doc.put("extractionStatus", "PROCESSING");
        doc.put("createdBy",        uploaderName(user));
        doc.put("createdAt",        now);

        if (devMode) {
            String id = "kd-" + UUID.randomUUID().toString().substring(0, 8);
            doc.put("id", id);
            devKnowledgeDocs.computeIfAbsent(projectId, k -> new ArrayList<>()).add(doc);
            return id;
        }
        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                    .collection(FirestoreCollections.PROJECTS).document(projectId)
                    .collection("knowledgeDocs").add(doc).get();
        return ref.getId();
    }

    /**
     * Background finalize for an uploaded project knowledge doc: store the original
     * in GCS and extract text into {@code textContent}. Mirrors the client-document
     * pipeline. Called cross-bean so the {@code @Async} proxy applies.
     */
    @org.springframework.scheduling.annotation.Async
    public void finalizeKnowledgeUpload(String orgId, String projectId, String docId,
                                        String filename, String contentType, byte[] bytes) {
        if (devMode) return;
        Map<String, Object> update = new HashMap<>();
        update.put("contentHash", GcsStorageService.sha256Hex(bytes));
        update.put("sizeBytes",   (long) bytes.length);
        if (contentType != null && !contentType.isBlank()) update.put("contentType", contentType);
        if (gcsStorageService.isEnabled()) {
            String objectPath = gcsStorageService.projectObjectPath(orgId, projectId, docId, filename);
            if (gcsStorageService.upload(objectPath, contentType, bytes)) {
                update.put("gcsBucket", gcsStorageService.getBucket());
                update.put("gcsObject", objectPath);
            }
        }
        try {
            String text = documentFormatService.extractText(filename, bytes, true);
            if (text == null || text.isBlank()) {
                update.put("extractionStatus", "FAILED");
                update.put("extractionError", "No readable text found in \"" + filename + "\".");
            } else {
                update.put("textContent", text);
                update.put("characters",  text.length());
                update.put("extractionStatus", "READY");
            }
        } catch (IllegalArgumentException e) {
            update.put("extractionStatus", "FAILED");
            update.put("extractionError", e.getMessage());
        } catch (Exception e) {
            log.error("finalizeKnowledgeUpload extraction failed doc={} file={}: {}", docId, filename, e.getMessage());
            update.put("extractionStatus", "FAILED");
            update.put("extractionError", "Could not read the file.");
        }
        try {
            FirestoreClient.getFirestore()
                    .collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection(FirestoreCollections.PROJECTS).document(projectId)
                    .collection("knowledgeDocs").document(docId)
                    .set(update, com.google.cloud.firestore.SetOptions.merge()).get();
        } catch (Exception e) {
            log.error("finalizeKnowledgeUpload update failed doc={}: {}", docId, e.getMessage());
        }
    }

    /**
     * Fetch a single knowledge doc (including {@code gcsObject}) for the download
     * path. Runs the read auth check via {@link #getProject}. Null if not found.
     */
    public Map<String, Object> getKnowledgeDoc(AppUser user, String projectId, String docId) throws Exception {
        getProject(user, projectId); // auth check (canAccessProject)
        if (devMode) {
            List<Map<String, Object>> docs = devKnowledgeDocs.getOrDefault(projectId, List.of());
            return docs.stream().filter(d -> docId.equals(d.get("id"))).findFirst().orElse(null);
        }
        var snap = FirestoreClient.getFirestore()
                .collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.PROJECTS).document(projectId)
                .collection("knowledgeDocs").document(docId).get().get();
        if (!snap.exists()) return null;
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    // ── Members ─────────────────────────────────────────────────────────────────

    /**
     * List a project's members (owner + explicit members) with their roles,
     * resolved to display name / email. Read-gated via {@link #getProject}.
     */
    public List<Map<String, Object>> getProjectMembers(AppUser user, String projectId) throws Exception {
        Map<String, Object> project = getProject(user, projectId); // auth
        String ownerId = (String) project.get("ownerId");
        @SuppressWarnings("unchecked")
        Map<String, String> members = (Map<String, String>) project.getOrDefault("members", Map.of());

        Map<String, Map<String, Object>> memberById = new HashMap<>();
        if (!devMode) {
            try {
                for (Map<String, Object> m : orgService.getOrgMembers(user.getOrgId())) {
                    memberById.put(String.valueOf(m.get("id")), m);
                }
            } catch (Exception e) {
                log.warn("getProjectMembers: org member resolution failed for {}: {}", projectId, e.getMessage());
            }
        }

        List<Map<String, Object>> out = new ArrayList<>();
        java.util.LinkedHashSet<String> ordered = new java.util.LinkedHashSet<>();
        if (ownerId != null) ordered.add(ownerId);
        ordered.addAll(members.keySet());
        for (String uid : ordered) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("id",   uid);
            entry.put("role", uid.equals(ownerId) ? "owner" : members.getOrDefault(uid, "viewer"));
            Map<String, Object> m = memberById.get(uid);
            if (m != null) {
                entry.put("name",  m.getOrDefault("displayName", m.getOrDefault("email", uid)));
                entry.put("email", m.get("email"));
            }
            out.add(entry);
        }
        return out;
    }

    // ── System prompt builder ─────────────────────────────────────────────

    /**
     * Build the Gemini system prompt fragment for a project.
     * Combines the project's custom instructions with all attached knowledge documents.
     * Returns an empty string if the project has no instructions and no knowledge docs.
     */
    public String buildProjectSystemPrompt(String orgId, String projectId) {
        try {
            Map<String, Object> project = devMode
                ? devProjects.get(projectId)
                : fetchProjectByOrgAndId(orgId, projectId);

            if (project == null) return "";

            StringBuilder sb = new StringBuilder();

            // 1. Project instructions (custom system prompt)
            String instructions = (String) project.get("instructions");
            if (instructions != null && !instructions.isBlank()) {
                sb.append("## Project Instructions\n").append(instructions.trim()).append("\n\n");
            }

            // 2. Knowledge documents
            List<Map<String, Object>> docs = devMode
                ? devKnowledgeDocs.getOrDefault(projectId, List.of())
                : fetchKnowledgeDocsInternal(orgId, projectId);

            if (!docs.isEmpty()) {
                sb.append("## Project Knowledge\n");
                // Bound the concatenated knowledge text so a project with many/large
                // docs can't balloon the system prompt on every request (latency +
                // token cost). Always include at least the first doc, then stop once
                // the budget is exceeded. ~200k chars ≈ 50k tokens.
                final int PROJECT_KNOWLEDGE_CHAR_BUDGET = 200_000;
                int used = 0;
                for (int i = 0; i < docs.size(); i++) {
                    String content = (String) docs.get(i).getOrDefault("textContent", "");
                    if (content == null || content.isBlank()) continue;
                    String trimmed = content.trim();
                    if (used > 0 && used + trimmed.length() > PROJECT_KNOWLEDGE_CHAR_BUDGET) {
                        sb.append("_(Additional project documents omitted to stay within the context budget.)_\n\n");
                        break;
                    }
                    String title = (String) docs.get(i).getOrDefault("title", "Document");
                    sb.append("### ").append(title).append("\n")
                      .append(trimmed).append("\n\n");
                    used += trimmed.length();
                }
            }

            return sb.toString().trim();
        } catch (Exception e) {
            log.warn("Could not build project system prompt for {}: {}", projectId, e.getMessage());
            return "";
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private Map<String, Object> fetchProject(String orgId, String projectId) throws Exception {
        if (devMode) {
            Map<String, Object> p = devProjects.get(projectId);
            if (p == null) throw new NoSuchElementException("Project not found: " + projectId);
            return p;
        }
        return fetchProjectByOrgAndId(orgId, projectId);
    }

    private Map<String, Object> fetchProjectByOrgAndId(String orgId, String projectId) throws Exception {
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                     .collection(FirestoreCollections.PROJECTS).document(projectId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Project not found: " + projectId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    private List<Map<String, Object>> fetchKnowledgeDocsInternal(String orgId, String projectId) throws Exception {
        Firestore db = FirestoreClient.getFirestore();
        return toList(db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                        .collection(FirestoreCollections.PROJECTS).document(projectId)
                        .collection("knowledgeDocs")
                        .orderBy("createdAt").get().get().getDocuments());
    }

    private boolean canAccessProject(AppUser user, Map<String, Object> project) {
        if (user.isAdmin()) return true;
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) project.getOrDefault("memberIds", List.of());
        return ids.contains(user.getUid());
    }

    private boolean canManageProject(AppUser user, Map<String, Object> project) {
        if (user.isAdmin()) return true;
        return user.getUid().equals(project.get("ownerId"));
    }

    /**
     * Write access to project CONTENT (knowledge docs, uploads, instructions):
     * admin, the owner, or an explicit member with the "editor" role. Distinct
     * from {@link #canManageProject} (owner/admin), which governs membership and
     * project settings/deletion.
     */
    private boolean canEditProject(AppUser user, Map<String, Object> project) {
        if (user.isAdmin()) return true;
        if (user.getUid().equals(project.get("ownerId"))) return true;
        @SuppressWarnings("unchecked")
        Map<String, String> members = (Map<String, String>) project.getOrDefault("members", Map.of());
        return "editor".equals(members.get(user.getUid()));
    }

    /**
     * True if the org member identified by {@code uid} may access PHI — used to
     * enforce the PHI gate on project membership. Reads the member's stored role /
     * explicit {@code phiAccess} flag; fails CLOSED (denies) if the member can't be
     * resolved. Admins always qualify.
     */
    private boolean memberHasPhiAccess(String orgId, String uid) {
        if (devMode) return true;
        try {
            for (Map<String, Object> m : orgService.getOrgMembers(orgId)) {
                if (!uid.equals(String.valueOf(m.get("id")))) continue;
                Object explicit = m.get("phiAccess");
                if (explicit instanceof Boolean b) return b;
                String role = (String) m.get("role");
                return Permissions.phiAccess(role, orgId);
            }
        } catch (Exception e) {
            log.warn("memberHasPhiAccess lookup failed org={} uid={}: {}", orgId, uid, e.getMessage());
        }
        return false; // fail closed — unknown member cannot be added to a PHI project
    }

    private List<String> computeMemberIds(String ownerId, Map<String, String> members) {
        Set<String> ids = new LinkedHashSet<>();
        if (ownerId != null) ids.add(ownerId);
        ids.addAll(members.keySet());
        return new ArrayList<>(ids);
    }

    private List<Map<String, Object>> toList(List<QueryDocumentSnapshot> docs) {
        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        }).collect(Collectors.toList());
    }
}
