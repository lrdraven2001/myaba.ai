package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * In-app notifications (the bell). Each notification is per-user so read state is
 * tracked individually; a broadcast fans out one notification per active member.
 *
 * Firestore path: organizations/{orgId}/notifications/{id}
 *   { id, orgId, userId, title, body, level (info|success|warning|alert),
 *     type (system|event), link, read, createdAt, createdBy }
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    private final OrgService orgService;

    /** dev fallback: orgId → list of notifications */
    private final Map<String, List<Map<String, Object>>> devNotes = new ConcurrentHashMap<>();

    // ── Reads ────────────────────────────────────────────────────────────────

    /** A user's notifications, newest first. */
    public List<Map<String, Object>> list(AppUser user) throws Exception {
        List<Map<String, Object>> all;
        if (devMode) {
            all = new ArrayList<>(devNotes.getOrDefault(user.getOrgId(), List.of()));
        } else {
            Firestore db = FirestoreClient.getFirestore();
            all = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                    .collection("notifications")
                    .whereEqualTo("userId", user.getUid())
                    .get().get().getDocuments().stream()
                    .map(d -> { Map<String, Object> m = d.getData(); m.put("id", d.getId()); return m; })
                    .collect(Collectors.toList());
        }
        return all.stream()
                .filter(n -> user.getUid().equals(n.get("userId")))
                .sorted(Comparator.comparing(
                        (Map<String, Object> n) -> (String) n.getOrDefault("createdAt", ""),
                        Comparator.reverseOrder()))
                .collect(Collectors.toList());
    }

    public long unreadCount(AppUser user) throws Exception {
        return list(user).stream().filter(n -> !Boolean.TRUE.equals(n.get("read"))).count();
    }

    // ── Writes ───────────────────────────────────────────────────────────────

    public void markRead(AppUser user, String id) throws Exception {
        if (devMode) {
            for (Map<String, Object> n : devNotes.getOrDefault(user.getOrgId(), List.of())) {
                if (id.equals(n.get("id")) && user.getUid().equals(n.get("userId"))) n.put("read", true);
            }
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
          .collection("notifications").document(id)
          .update("read", true, "readAt", TimestampUtil.now()).get();
    }

    public void markAllRead(AppUser user) throws Exception {
        if (devMode) {
            for (Map<String, Object> n : devNotes.getOrDefault(user.getOrgId(), List.of())) {
                if (user.getUid().equals(n.get("userId"))) n.put("read", true);
            }
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("notifications").whereEqualTo("userId", user.getUid())
                .whereEqualTo("read", false).get().get();
        for (var doc : snap.getDocuments()) {
            doc.getReference().update("read", true, "readAt", TimestampUtil.now()).get();
        }
    }

    /**
     * Create a single notification for a user. Safe to call from anywhere in the app
     * to surface an event (review item ready, invite accepted, etc.).
     */
    public void notify(String orgId, String userId, String title, String body,
                       String level, String type, String link, String createdBy) {
        String now = TimestampUtil.now();
        Map<String, Object> data = new HashMap<>();
        data.put("orgId",     orgId);
        data.put("userId",    userId);
        data.put("title",     title);
        data.put("body",      body != null ? body : "");
        data.put("level",     level != null ? level : "info");
        data.put("type",      type != null ? type : "event");
        if (link != null) data.put("link", link);
        data.put("read",      false);
        data.put("createdAt", now);
        data.put("createdBy", createdBy != null ? createdBy : "system");
        try {
            if (devMode) {
                String id = "ntf-" + UUID.randomUUID().toString().substring(0, 8);
                data.put("id", id);
                devNotes.computeIfAbsent(orgId, k -> new ArrayList<>()).add(data);
            } else {
                Firestore db = FirestoreClient.getFirestore();
                db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId).collection("notifications").add(data).get();
            }
        } catch (Exception e) {
            log.warn("Failed to create notification for {}: {}", userId, e.getMessage());
        }
    }

    /** Send a system message to every active member of the org. Returns the number sent. */
    public int broadcast(String orgId, String title, String body, String level, String createdBy) throws Exception {
        int sent = 0;
        for (Map<String, Object> m : orgService.getOrgMembers(orgId)) {
            if (Boolean.FALSE.equals(m.get("active"))) continue;
            String uid = (String) m.get("id");
            if (uid == null) continue;
            notify(orgId, uid, title, body, level, "system", null, createdBy);
            sent++;
        }
        log.info("Broadcast system notification to {} member(s) in org {}", sent, orgId);
        return sent;
    }
}
