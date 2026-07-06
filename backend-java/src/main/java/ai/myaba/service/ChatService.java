package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

import ai.myaba.model.dto.AppUser;
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
import java.util.stream.Collectors;

/**
 * Chat and message persistence service.
 *
 * Firestore paths:
 *   organizations/{orgId}/chats/{chatId}
 *   organizations/{orgId}/chats/{chatId}/messages/{messageId}
 *
 * Chat document shape:
 * <pre>
 *   id:           String
 *   title:        String
 *   orgId:        String
 *   createdBy:    String  (userId)
 *   clientId:     String|null
 *   projectId:    String|null
 *   projectLabel: String|null
 *   memberIds:    List<String>  (for access-control queries; starts as [createdBy])
 *   createdAt:    String (ISO-8601)
 *   updatedAt:    String (ISO-8601)
 * </pre>
 *
 * Message document shape:
 * <pre>
 *   id:        String
 *   chatId:    String
 *   role:      "user" | "assistant"
 *   content:   String
 *   createdAt: String (ISO-8601)
 * </pre>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChatService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /** In-memory chats — dev mode only. */
    private final Map<String, Map<String, Object>> devChats = new LinkedHashMap<>();
    /** In-memory messages keyed by chatId → ordered list. */
    private final Map<String, List<Map<String, Object>>> devMessages = new LinkedHashMap<>();

    // ── Dev data seed ─────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        // Mirror the chats from the frontend's fakeData.ts
        putChat("ch-001", Map.ofEntries(
            Map.entry("title",       "BIP Development - Alex M."),
            Map.entry("clientId",    "c-001"),
            Map.entry("projectId",   ""),
            Map.entry("projectLabel",""),
            Map.entry("policyIds",   List.of("pol-001", "pol-002")),
            Map.entry("createdBy",   "dev-user-001"),
            Map.entry("orgId",       "dev-org-001"),
            Map.entry("memberIds",   List.of("dev-user-001")),
            Map.entry("createdAt",   "2026-05-01T10:00:00Z"),
            Map.entry("updatedAt",   "2026-05-20T14:30:00Z")
        ));
        putChat("ch-002", Map.ofEntries(
            Map.entry("title",       "Progress Notes - Jordan T."),
            Map.entry("clientId",    "c-002"),
            Map.entry("projectId",   ""),
            Map.entry("projectLabel",""),
            Map.entry("createdBy",   "dev-user-001"),
            Map.entry("orgId",       "dev-org-001"),
            Map.entry("memberIds",   List.of("dev-user-001")),
            Map.entry("createdAt",   "2026-05-10T09:00:00Z"),
            Map.entry("updatedAt",   "2026-05-22T11:00:00Z")
        ));
        putChat("ch-003", Map.ofEntries(
            Map.entry("title",       "FBA - Sam K."),
            Map.entry("clientId",    "c-003"),
            Map.entry("projectId",   ""),
            Map.entry("projectLabel",""),
            Map.entry("createdBy",   "dev-user-001"),
            Map.entry("orgId",       "dev-org-001"),
            Map.entry("memberIds",   List.of("dev-user-001")),
            Map.entry("createdAt",   "2026-05-15T14:00:00Z"),
            Map.entry("updatedAt",   "2026-05-21T16:00:00Z")
        ));
        putChat("ch-004", Map.ofEntries(
            Map.entry("title",       "Q2 Caseload Review"),
            Map.entry("clientId",    ""),
            Map.entry("projectId",   "proj-001"),
            Map.entry("projectLabel","Q2 Review"),
            Map.entry("createdBy",   "dev-user-001"),
            Map.entry("orgId",       "dev-org-001"),
            Map.entry("memberIds",   List.of("dev-user-001")),
            Map.entry("createdAt",   "2026-05-18T08:00:00Z"),
            Map.entry("updatedAt",   "2026-05-23T10:00:00Z")
        ));
        putChat("ch-005", Map.ofEntries(
            Map.entry("title",       "General Documentation"),
            Map.entry("clientId",    ""),
            Map.entry("projectId",   ""),
            Map.entry("projectLabel",""),
            Map.entry("createdBy",   "dev-user-001"),
            Map.entry("orgId",       "dev-org-001"),
            Map.entry("memberIds",   List.of("dev-user-001")),
            Map.entry("createdAt",   "2026-05-20T12:00:00Z"),
            Map.entry("updatedAt",   "2026-05-24T09:00:00Z")
        ));

        // Seed a starter message for ch-001
        addMessage("ch-001", buildMsg("m-001-1", "ch-001", "user",
            "Help me write a behavior intervention plan for Alex.", "2026-05-20T14:00:00Z"));
        addMessage("ch-001", buildMsg("m-001-2", "ch-001", "assistant",
            "I'll help you create a comprehensive BIP for Alex. Based on the client profile, " +
            "let's start with the target behavior and function. What behaviors are you targeting?",
            "2026-05-20T14:01:00Z"));

        log.info("Dev mode: seeded {} chats", devChats.size());
    }

    private void putChat(String id, Map<String, Object> data) {
        Map<String, Object> m = new HashMap<>(data);
        m.put("id", id);
        devChats.put(id, m);
        devMessages.putIfAbsent(id, new ArrayList<>());
    }

    private Map<String, Object> buildMsg(String id, String chatId, String role,
                                          String content, String createdAt) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", id);
        m.put("chatId", chatId);
        m.put("role", role);
        m.put("content", content);
        m.put("createdAt", createdAt);
        return m;
    }

    private void addMessage(String chatId, Map<String, Object> msg) {
        devMessages.computeIfAbsent(chatId, k -> new ArrayList<>()).add(msg);
    }

    // ── Chat queries ──────────────────────────────────────────────────────

    /**
     * Returns the chats the user participates in (they are in memberIds).
     *
     * <p>This is each user's PERSONAL chat surface — the Chat list, search, and
     * single-chat reads. It is intentionally member-scoped for EVERY role,
     * including admins: a Clinical Director or Practice Administrator does not
     * see colleagues' clinical chats here. Cross-clinician oversight happens
     * through the Review workflow, not by browsing others' chat histories.
     * For a client-record export (all chats about a client) use
     * {@link #getChatsForClient}.
     */
    public List<Map<String, Object>> getChats(AppUser user) throws Exception {
        if (devMode) {
            return devChats.values().stream()
                    .filter(c -> canAccessChat(user, c))
                    .sorted(Comparator.comparing(c -> (String) c.getOrDefault("updatedAt", "")))
                    .collect(Collectors.toList());
        }

        // A brand-new user has no org yet (the orgId claim is unset until they
        // create or join one). Firestore document("") throws, so return no chats.
        if (user.getOrgId() == null || user.getOrgId().isBlank()) {
            return List.of();
        }

        Firestore db = FirestoreClient.getFirestore();
        Query query = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats")
                .whereArrayContains("memberIds", user.getUid())
                .orderBy("updatedAt", Query.Direction.DESCENDING);
        return toList(query.get().get().getDocuments());
    }

    /**
     * Returns ALL chats in the org, regardless of author — the reviewer/oversight
     * view (Review screen's Chat Review tab). Caller MUST gate to oversight roles;
     * this method does not member-scope. Distinct from {@link #getChats}, which is
     * each user's personal, member-scoped chat list.
     */
    public List<Map<String, Object>> getAllOrgChats(String orgId) throws Exception {
        if (orgId == null || orgId.isBlank()) return List.of();
        if (devMode) {
            return devChats.values().stream()
                    .filter(c -> orgId.equals(c.get("orgId")))
                    .sorted(Comparator.comparing(
                            c -> (String) c.getOrDefault("updatedAt", ""), Comparator.reverseOrder()))
                    .collect(Collectors.toList());
        }
        Firestore db = FirestoreClient.getFirestore();
        var docs = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection("chats").orderBy("updatedAt", Query.Direction.DESCENDING)
                .get().get().getDocuments();
        return toList(docs);
    }

    /**
     * Returns ALL chats in the org for a given client, regardless of author —
     * the client-record view, used by the authorization-gated client export.
     * Caller MUST enforce access (e.g. {@code canEditClient}); this method does
     * not member-scope, because a client's archive spans the whole care team.
     */
    public List<Map<String, Object>> getChatsForClient(String orgId, String clientId) throws Exception {
        if (orgId == null || orgId.isBlank() || clientId == null || clientId.isBlank()) return List.of();
        if (devMode) {
            return devChats.values().stream()
                    .filter(c -> clientId.equals(c.get("clientId")))
                    .collect(Collectors.toList());
        }
        Firestore db = FirestoreClient.getFirestore();
        var docs = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection("chats").whereEqualTo("clientId", clientId)
                .get().get().getDocuments();
        return toList(docs);
    }

    /**
     * Raw message read by chat ID with NO per-user authorization — for callers
     * that have already authorized access at a higher level (client export).
     */
    public List<Map<String, Object>> getMessagesForChat(String orgId, String chatId) throws Exception {
        if (devMode) {
            return new ArrayList<>(devMessages.getOrDefault(chatId, List.of()));
        }
        Firestore db = FirestoreClient.getFirestore();
        List<QueryDocumentSnapshot> docs = db
                .collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection("chats").document(chatId)
                .collection("messages").orderBy("createdAt").get().get().getDocuments();
        return toList(docs);
    }

    /**
     * Fetch a single chat by ID.
     *
     * @throws NoSuchElementException if not found
     * @throws SecurityException      if user is not authorized
     */
    public Map<String, Object> getChat(AppUser user, String chatId) throws Exception {
        Map<String, Object> chat = fetchChat(user.getOrgId(), chatId);
        if (!canAccessChat(user, chat)) throw new SecurityException("Access denied to chat: " + chatId);
        return chat;
    }

    /** Returns messages for a chat, oldest-first. */
    public List<Map<String, Object>> getMessages(AppUser user, String chatId) throws Exception {
        getChat(user, chatId); // authorization check
        if (devMode) {
            return new ArrayList<>(devMessages.getOrDefault(chatId, List.of()));
        }
        Firestore db = FirestoreClient.getFirestore();
        List<QueryDocumentSnapshot> docs = db
                .collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats").document(chatId)
                .collection("messages").orderBy("createdAt").get().get().getDocuments();
        return toList(docs);
    }

    // ── Chat writes ───────────────────────────────────────────────────────

    /**
     * Create a new chat document.
     * Returns the new chat's ID.
     */
    public String createChat(AppUser user, String title, String clientId,
                              String projectId, String projectLabel,
                              List<String> policyIds) throws Exception {
        String now = TimestampUtil.now();
        Map<String, Object> data = new HashMap<>();
        data.put("title",        title);
        data.put("orgId",        user.getOrgId());
        data.put("createdBy",    user.getUid());
        data.put("clientId",     clientId != null ? clientId : "");
        data.put("projectId",    projectId != null ? projectId : "");
        data.put("projectLabel", projectLabel != null ? projectLabel : "");
        data.put("policyIds",    policyIds != null ? policyIds : List.of());
        data.put("memberIds",    List.of(user.getUid()));
        data.put("createdAt",    now);
        data.put("updatedAt",    now);

        if (devMode) {
            String id = "ch-" + UUID.randomUUID().toString().substring(0, 8);
            data.put("id", id);
            devChats.put(id, data);
            devMessages.put(id, new ArrayList<>());
            return id;
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats").add(data).get();
        return ref.getId();
    }

    /**
     * Append a user message and the assistant response to a chat.
     * Also bumps the chat's updatedAt timestamp.
     *
     * @param aclxDecision  ACLX decision that was applied to the assistant response
     *                      (ALLOW | REDACT | BLOCK | ESCALATE). Stored on the message
     *                      so API consumers and the audit trail have the label.
     * @param aclxLabelData flattened label fields from the ACLX response
     *                      (domain, category, subcategory, sensitivity). May be empty.
     * @param aclxContentId ACLX content_id assigned to this response. May be null.
     */
    public void appendMessages(AppUser user, String chatId,
                                String userText, String assistantText,
                                String aclxDecision, Map<String, Object> aclxLabelData,
                                String aclxContentId) throws Exception {
        // The user message and the assistant reply are written together, so they must
        // NOT share a createdAt — orderBy("createdAt") returns ties arbitrarily, which
        // swaps the turn. Stamp the assistant 1ms later so it always sorts after the user.
        Instant base = Instant.now();
        String now = base.toString();
        String asstTime = base.plusMillis(1).toString();

        if (devMode) {
            List<Map<String, Object>> msgs = devMessages.computeIfAbsent(chatId, k -> new ArrayList<>());
            Map<String, Object> userMsg = new HashMap<>();
            userMsg.put("id",        "m-" + UUID.randomUUID().toString().substring(0, 8));
            userMsg.put("chatId",    chatId);
            userMsg.put("role",      "user");
            userMsg.put("content",   userText);
            userMsg.put("createdAt", now);
            msgs.add(userMsg);

            Map<String, Object> asstMsg = new HashMap<>();
            asstMsg.put("id",        "m-" + UUID.randomUUID().toString().substring(0, 8));
            asstMsg.put("chatId",    chatId);
            asstMsg.put("role",      "assistant");
            asstMsg.put("content",   assistantText);
            asstMsg.put("createdAt", asstTime);
            if (aclxDecision != null)  asstMsg.put("aclxDecision",  aclxDecision);
            if (aclxContentId != null) asstMsg.put("aclxContentId", aclxContentId);
            if (aclxLabelData != null && !aclxLabelData.isEmpty()) {
                asstMsg.put("aclxLabel", new HashMap<>(aclxLabelData));
            }
            msgs.add(asstMsg);

            // bump updatedAt on chat doc
            Map<String, Object> chat = devChats.get(chatId);
            if (chat != null) chat.put("updatedAt", now);
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        var chatRef = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats").document(chatId);
        var messagesRef = chatRef.collection("messages");

        Map<String, Object> userMsg = new HashMap<>();
        userMsg.put("chatId", chatId);
        userMsg.put("role", "user");
        userMsg.put("content", userText);
        userMsg.put("createdAt", now);
        messagesRef.add(userMsg).get();

        Map<String, Object> asstMsg = new HashMap<>();
        asstMsg.put("chatId", chatId);
        asstMsg.put("role", "assistant");
        asstMsg.put("content", assistantText);
        asstMsg.put("createdAt", asstTime);
        if (aclxDecision != null)  asstMsg.put("aclxDecision",  aclxDecision);
        if (aclxContentId != null) asstMsg.put("aclxContentId", aclxContentId);
        if (aclxLabelData != null && !aclxLabelData.isEmpty()) {
            asstMsg.put("aclxLabel", new HashMap<>(aclxLabelData));
        }
        messagesRef.add(asstMsg).get();

        chatRef.update("updatedAt", now).get();
    }

    /**
     * Deliver a reviewer's verdict into the chat: replace the "flagged for review"
     * placeholder assistant message (matched by ACLX {@code contentId}) with
     * {@code newContent} and set its decision so the UI renders it normally.
     * Called from {@link ReviewQueueService} on approve/deny — no per-user auth
     * here, the caller already requires admin. Returns true if a message updated.
     */
    public boolean updateReviewedResponse(String orgId, String chatId, String contentId,
                                          String newContent, String decision) {
        if (chatId == null || chatId.isBlank() || contentId == null || contentId.isBlank()) return false;
        try {
            if (devMode) {
                List<Map<String, Object>> msgs = devMessages.get(chatId);
                if (msgs == null) return false;
                for (Map<String, Object> m : msgs) {
                    if ("assistant".equals(m.get("role")) && contentId.equals(m.get("aclxContentId"))) {
                        m.put("content", newContent);
                        m.put("aclxDecision", decision);
                        return true;
                    }
                }
                return false;
            }
            Firestore db = FirestoreClient.getFirestore();
            var docs = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .collection("chats").document(chatId).collection("messages")
                    .whereEqualTo("aclxContentId", contentId).get().get().getDocuments();
            for (var doc : docs) {
                if ("assistant".equals(doc.getString("role"))) {
                    doc.getReference().update(Map.of("content", newContent, "aclxDecision", decision)).get();
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            log.error("updateReviewedResponse failed chat={} contentId={}: {}", chatId, contentId, e.getMessage());
            return false;
        }
    }

    /**
     * Update a chat's title (owner or admin only).
     */
    public void updateChatTitle(AppUser user, String chatId, String newTitle) throws Exception {
        Map<String, Object> chat = fetchChat(user.getOrgId(), chatId);
        if (!canManageChat(user, chat)) throw new SecurityException("Cannot update chat: " + chatId);
        String now = TimestampUtil.now();
        if (devMode) {
            chat.put("title", newTitle);
            chat.put("updatedAt", now);
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats").document(chatId)
                .update(Map.of("title", newTitle, "updatedAt", now)).get();
    }

    /** Attach (or, with empty clientId, detach) a client to an existing chat. */
    public void setChatClient(AppUser user, String chatId, String clientId) throws Exception {
        Map<String, Object> chat = fetchChat(user.getOrgId(), chatId);
        if (!canManageChat(user, chat)) throw new SecurityException("Cannot update chat: " + chatId);
        String cid = clientId != null ? clientId.trim() : "";
        String now = TimestampUtil.now();
        if (devMode) {
            chat.put("clientId", cid);
            chat.put("updatedAt", now);
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats").document(chatId)
                .update(Map.of("clientId", cid, "updatedAt", now)).get();
    }

    /**
     * Delete a chat and all its messages (owner or admin only).
     */
    public void deleteChat(AppUser user, String chatId) throws Exception {
        Map<String, Object> chat = fetchChat(user.getOrgId(), chatId);
        if (!canManageChat(user, chat)) throw new SecurityException("Cannot delete chat: " + chatId);
        if (devMode) {
            devChats.remove(chatId);
            devMessages.remove(chatId);
            return;
        }
        // Firestore: delete subcollection messages first, then the chat doc
        Firestore db = FirestoreClient.getFirestore();
        var msgsSnap = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats").document(chatId)
                .collection("messages").get().get();
        for (var doc : msgsSnap.getDocuments()) {
            doc.getReference().delete().get();
        }
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection("chats").document(chatId).delete().get();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private Map<String, Object> fetchChat(String orgId, String chatId) throws Exception {
        if (devMode) {
            Map<String, Object> c = devChats.get(chatId);
            if (c == null) throw new NoSuchElementException("Chat not found: " + chatId);
            return c;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection("chats").document(chatId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Chat not found: " + chatId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    private boolean canAccessChat(AppUser user, Map<String, Object> chat) {
        // Member-scoped for ALL roles — admins do not read colleagues' chats from
        // the chat surface (oversight is via Review). Client-record export uses the
        // separate, controller-authorized getChatsForClient/getMessagesForChat.
        @SuppressWarnings("unchecked")
        List<String> memberIds = (List<String>) chat.getOrDefault("memberIds", List.of());
        return memberIds.contains(user.getUid());
    }

    private boolean canManageChat(AppUser user, Map<String, Object> chat) {
        if (user.isAdmin()) return true;
        return user.getUid().equals(chat.get("createdBy"));
    }

    private List<Map<String, Object>> toList(List<QueryDocumentSnapshot> docs) {
        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        }).collect(Collectors.toList());
    }
}
