package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ProjectRequest;
import ai.myaba.model.dto.UserRole;
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
        boolean isShared = Boolean.TRUE.equals(req.getIsShared());

        Map<String, Object> data = new HashMap<>();
        data.put("title",        req.getTitle());
        data.put("description",  req.getDescription()  != null ? req.getDescription()  : "");
        data.put("instructions", req.getInstructions() != null ? req.getInstructions() : "");
        data.put("orgId",        user.getOrgId());
        data.put("ownerId",      user.getUid());
        data.put("clientIds",    clientIds);
        data.put("isShared",     isShared);
        data.put("containsPhi",  Boolean.TRUE.equals(req.getContainsPhi()));
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
        if (req.getIsShared()     != null) updates.put("isShared",     req.getIsShared());
        if (req.getContainsPhi()  != null) updates.put("containsPhi",  req.getContainsPhi());
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
            // PHI gate: non-clinical roles cannot be added to PHI projects
            if (Boolean.TRUE.equals(project.get("containsPhi"))) {
                // targetUserId's role comes from Firestore org member lookup
                // For now we rely on the frontend to pre-filter; log a warning here
                // so security teams can audit unexpected attempts.
                log.warn("PHI project member add: projectId={} targetUser={} — caller is responsible for role validation",
                        projectId, targetUserId);
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
        if (!UserRole.ORG_SUPER_ADMIN.equals(user.getRole()))
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
        if (!UserRole.ORG_SUPER_ADMIN.equals(user.getRole()))
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
        getProject(user, projectId); // auth check
        if (devMode) {
            return new ArrayList<>(devKnowledgeDocs.getOrDefault(projectId, List.of()));
        }
        Firestore db = FirestoreClient.getFirestore();
        var docs = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                     .collection(FirestoreCollections.PROJECTS).document(projectId)
                     .collection("knowledgeDocs")
                     .orderBy("createdAt").get().get().getDocuments();
        return toList(docs);
    }

    /**
     * Add a knowledge document to a project.
     * Returns the new document's ID.
     */
    public String addKnowledgeDoc(AppUser user, String projectId,
                                   String title, String textContent) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canManageProject(user, project))
            throw new SecurityException("Cannot add knowledge to project: " + projectId);

        String now = TimestampUtil.now();
        Map<String, Object> doc = new HashMap<>();
        doc.put("projectId",   projectId);
        doc.put("title",       title);
        doc.put("textContent", textContent != null ? textContent : "");
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

    /** Remove a knowledge document from a project. */
    public void removeKnowledgeDoc(AppUser user, String projectId, String docId) throws Exception {
        Map<String, Object> project = fetchProject(user.getOrgId(), projectId);
        if (!canManageProject(user, project))
            throw new SecurityException("Cannot remove knowledge from project: " + projectId);

        if (devMode) {
            List<Map<String, Object>> docs = devKnowledgeDocs.get(projectId);
            if (docs != null) docs.removeIf(d -> docId.equals(d.get("id")));
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection(FirestoreCollections.PROJECTS).document(projectId)
          .collection("knowledgeDocs").document(docId).delete().get();
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
                for (Map<String, Object> doc : docs) {
                    String title   = (String) doc.getOrDefault("title",       "Document");
                    String content = (String) doc.getOrDefault("textContent", "");
                    if (content != null && !content.isBlank()) {
                        sb.append("### ").append(title).append("\n")
                          .append(content.trim()).append("\n\n");
                    }
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
