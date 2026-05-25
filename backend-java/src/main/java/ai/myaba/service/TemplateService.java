package ai.myaba.service;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.TemplateRequest;
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
import java.util.stream.Collectors;

/**
 * Clinical template service.
 *
 * Firestore path: organizations/{orgId}/templates/{templateId}
 *
 * Template document shape:
 * <pre>
 *   id:             String
 *   title:          String
 *   category:       String  (bip|fba|progress_note|skill_acquisition|parent_training|other)
 *   content:        String  (template body text)
 *   visibleToRoles: List<String>  (empty = all roles can see it)
 *   orgId:          String
 *   createdBy:      String
 *   createdAt:      String (ISO-8601)
 *   updatedAt:      String (ISO-8601)
 * </pre>
 *
 * Read access: any authenticated org member whose role appears in visibleToRoles
 *              (or all members when visibleToRoles is empty).
 * Write access: ORG_ADMIN / ORG_SUPER_ADMIN only.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TemplateService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    private final Map<String, Map<String, Object>> devTemplates = new LinkedHashMap<>();

    // ── Dev data seed ─────────────────────────────────────────────────────

    @PostConstruct
    void seedDevData() {
        if (!devMode) return;

        put("tmpl-001", Map.ofEntries(
            Map.entry("title",          "BIP Template"),
            Map.entry("category",       "bip"),
            Map.entry("content",        "# Behavior Intervention Plan\n\n**Client:** {{clientName}}\n**Date:** {{date}}\n\n## Target Behavior\n\n## Function of Behavior\n\n## Intervention Strategies\n\n## Data Collection\n"),
            Map.entry("visibleToRoles", List.of()),
            Map.entry("orgId",          "dev-org-001"),
            Map.entry("createdBy",      "dev-user-001"),
            Map.entry("createdAt",      "2026-01-01T00:00:00Z"),
            Map.entry("updatedAt",      "2026-01-01T00:00:00Z")
        ));

        put("tmpl-002", Map.ofEntries(
            Map.entry("title",          "Progress Note"),
            Map.entry("category",       "progress_note"),
            Map.entry("content",        "# Progress Note\n\n**Client:** {{clientName}}\n**Session Date:** {{date}}\n**Session Duration:** {{duration}}\n\n## Session Summary\n\n## Skill Acquisition Data\n\n## Behavior Reduction Data\n\n## Caregiver Training\n\n## Plan for Next Session\n"),
            Map.entry("visibleToRoles", List.of()),
            Map.entry("orgId",          "dev-org-001"),
            Map.entry("createdBy",      "dev-user-001"),
            Map.entry("createdAt",      "2026-01-01T00:00:00Z"),
            Map.entry("updatedAt",      "2026-01-01T00:00:00Z")
        ));

        put("tmpl-003", Map.ofEntries(
            Map.entry("title",          "FBA Report"),
            Map.entry("category",       "fba"),
            Map.entry("content",        "# Functional Behavior Assessment\n\n**Client:** {{clientName}}\n**Assessment Period:** {{startDate}} – {{endDate}}\n\n## Referral Concerns\n\n## Background Information\n\n## Assessment Methods\n\n## Behavioral Observations\n\n## Hypothesis Statement\n\n## Recommendations\n"),
            Map.entry("visibleToRoles", List.of(UserRole.TREATING_BCBA, UserRole.SUPERVISING_BCBA, UserRole.BCBA_STUDENT)),
            Map.entry("orgId",          "dev-org-001"),
            Map.entry("createdBy",      "dev-user-001"),
            Map.entry("createdAt",      "2026-01-01T00:00:00Z"),
            Map.entry("updatedAt",      "2026-01-01T00:00:00Z")
        ));

        put("tmpl-004", Map.ofEntries(
            Map.entry("title",          "Skill Acquisition Plan"),
            Map.entry("category",       "skill_acquisition"),
            Map.entry("content",        "# Skill Acquisition Plan\n\n**Client:** {{clientName}}\n**Program Name:** {{programName}}\n**Target Skill:** {{targetSkill}}\n\n## Goal\n\n## Teaching Procedure\n\n## Prompting Hierarchy\n\n## Mastery Criteria\n\n## Generalization Plan\n"),
            Map.entry("visibleToRoles", List.of()),
            Map.entry("orgId",          "dev-org-001"),
            Map.entry("createdBy",      "dev-user-001"),
            Map.entry("createdAt",      "2026-01-01T00:00:00Z"),
            Map.entry("updatedAt",      "2026-01-01T00:00:00Z")
        ));

        put("tmpl-005", Map.ofEntries(
            Map.entry("title",          "Parent Training Guide"),
            Map.entry("category",       "parent_training"),
            Map.entry("content",        "# Parent Training Guide\n\n**Client:** {{clientName}}\n**Training Topic:** {{topic}}\n**Date:** {{date}}\n\n## Overview\n\n## Learning Objectives\n\n## Procedure Steps\n\n## Practice Activities\n\n## Homework\n"),
            Map.entry("visibleToRoles", List.of()),
            Map.entry("orgId",          "dev-org-001"),
            Map.entry("createdBy",      "dev-user-001"),
            Map.entry("createdAt",      "2026-01-01T00:00:00Z"),
            Map.entry("updatedAt",      "2026-01-01T00:00:00Z")
        ));

        log.info("Dev mode: seeded {} templates", devTemplates.size());
    }

    private void put(String id, Map<String, Object> data) {
        Map<String, Object> m = new HashMap<>(data);
        m.put("id", id);
        devTemplates.put(id, m);
    }

    // ── Queries ───────────────────────────────────────────────────────────

    /**
     * Returns templates visible to the requesting user based on their role.
     * Templates with an empty {@code visibleToRoles} list are visible to everyone.
     */
    public List<Map<String, Object>> getTemplates(AppUser user) throws Exception {
        if (devMode) {
            return devTemplates.values().stream()
                    .filter(t -> canReadTemplate(user, t))
                    .collect(Collectors.toList());
        }

        Firestore db = FirestoreClient.getFirestore();
        List<QueryDocumentSnapshot> docs = db
                .collection("organizations").document(user.getOrgId())
                .collection("templates")
                .orderBy("category")
                .get().get().getDocuments();

        return toList(docs).stream()
                .filter(t -> canReadTemplate(user, t))
                .collect(Collectors.toList());
    }

    /** Fetch a single template, enforcing read authorization. */
    public Map<String, Object> getTemplate(AppUser user, String templateId) throws Exception {
        Map<String, Object> template = fetchTemplate(user.getOrgId(), templateId);
        if (!canReadTemplate(user, template))
            throw new SecurityException("Access denied to template: " + templateId);
        return template;
    }

    // ── Writes (ORG_ADMIN only) ───────────────────────────────────────────

    /** Create a new template. Caller must have already verified admin access. */
    public String createTemplate(AppUser user, TemplateRequest req) throws Exception {
        String now = Instant.now().toString();
        Map<String, Object> data = new HashMap<>();
        data.put("title",          req.getTitle());
        data.put("category",       req.getCategory());
        data.put("content",        req.getContent() != null ? req.getContent() : "");
        data.put("visibleToRoles", req.getVisibleToRoles() != null ? req.getVisibleToRoles() : List.of());
        data.put("orgId",          user.getOrgId());
        data.put("createdBy",      user.getUid());
        data.put("createdAt",      now);
        data.put("updatedAt",      now);

        if (devMode) {
            String id = "tmpl-" + UUID.randomUUID().toString().substring(0, 8);
            data.put("id", id);
            devTemplates.put(id, data);
            return id;
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection("organizations").document(user.getOrgId())
                .collection("templates").add(data).get();
        return ref.getId();
    }

    /** Update an existing template. Caller must have already verified admin access. */
    public void updateTemplate(AppUser user, String templateId, TemplateRequest req) throws Exception {
        Map<String, Object> template = fetchTemplate(user.getOrgId(), templateId);
        Map<String, Object> updates = new HashMap<>();
        if (req.getTitle() != null)          updates.put("title", req.getTitle());
        if (req.getCategory() != null)       updates.put("category", req.getCategory());
        if (req.getContent() != null)        updates.put("content", req.getContent());
        if (req.getVisibleToRoles() != null) updates.put("visibleToRoles", req.getVisibleToRoles());
        updates.put("updatedAt", Instant.now().toString());

        if (devMode) {
            template.putAll(updates);
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection("organizations").document(user.getOrgId())
                .collection("templates").document(templateId).update(updates).get();
    }

    /** Delete a template. Caller must have already verified admin access. */
    public void deleteTemplate(AppUser user, String templateId) throws Exception {
        fetchTemplate(user.getOrgId(), templateId); // ensure it exists
        if (devMode) {
            devTemplates.remove(templateId);
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection("organizations").document(user.getOrgId())
                .collection("templates").document(templateId).delete().get();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private Map<String, Object> fetchTemplate(String orgId, String templateId) throws Exception {
        if (devMode) {
            Map<String, Object> t = devTemplates.get(templateId);
            if (t == null) throw new NoSuchElementException("Template not found: " + templateId);
            return t;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection("organizations").document(orgId)
                .collection("templates").document(templateId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Template not found: " + templateId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    @SuppressWarnings("unchecked")
    private boolean canReadTemplate(AppUser user, Map<String, Object> template) {
        List<String> visibleToRoles = (List<String>) template.getOrDefault("visibleToRoles", List.of());
        // empty list = visible to all; otherwise role must be in the list
        return visibleToRoles.isEmpty() || visibleToRoles.contains(user.getRole());
    }

    private List<Map<String, Object>> toList(List<QueryDocumentSnapshot> docs) {
        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        }).collect(Collectors.toList());
    }
}
