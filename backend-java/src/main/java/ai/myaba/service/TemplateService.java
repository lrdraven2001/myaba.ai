package ai.myaba.service;

import ai.myaba.util.TimestampUtil;
import ai.myaba.util.FirestoreCollections;

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
import java.util.regex.Pattern;
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
 *   category:       String  (bip|fba|progress_note|schedule|skill_acquisition|parent_training|other)
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

    private final ClientService clientService;

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
            Map.entry("visibleToRoles", List.of(UserRole.SUPERVISING_BCBA)),
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
                .collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.TEMPLATES)
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
        String now = TimestampUtil.now();
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
        var ref = db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.TEMPLATES).add(data).get();
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
        updates.put("updatedAt", TimestampUtil.now());

        if (devMode) {
            template.putAll(updates);
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.TEMPLATES).document(templateId).update(updates).get();
    }

    /** Delete a template. Caller must have already verified admin access. */
    public void deleteTemplate(AppUser user, String templateId) throws Exception {
        fetchTemplate(user.getOrgId(), templateId); // ensure it exists
        if (devMode) {
            devTemplates.remove(templateId);
            return;
        }
        Firestore db = FirestoreClient.getFirestore();
        db.collection(FirestoreCollections.ORGANIZATIONS).document(user.getOrgId())
                .collection(FirestoreCollections.TEMPLATES).document(templateId).delete().get();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private Map<String, Object> fetchTemplate(String orgId, String templateId) throws Exception {
        if (devMode) {
            Map<String, Object> t = devTemplates.get(templateId);
            if (t == null) throw new NoSuchElementException("Template not found: " + templateId);
            return t;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                .collection(FirestoreCollections.TEMPLATES).document(templateId).get().get();
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

    // ── De-identification ─────────────────────────────────────────────────

    /**
     * Strips client PHI from {@code content} and returns the sanitized text
     * along with a list of field types that were redacted.
     *
     * <p>Replacements applied (in order, most-specific first):
     * <ul>
     *   <li>Full legal name (firstName + lastName) → {@code {{clientName}}}</li>
     *   <li>Preferred name (when different from firstName) → {@code {{clientName}}}</li>
     *   <li>First name alone → {@code {{clientName}}}</li>
     *   <li>Date of birth in ISO, US, and EU formats → {@code {{dateOfBirth}}}</li>
     * </ul>
     *
     * Last name alone is intentionally NOT redacted — it is too likely to appear
     * as a common word (e.g. "Smith", "Brown") and produce false positives in
     * clinical text.
     *
     * @param user     requesting user (used to scope the client lookup)
     * @param clientId Firestore client document ID
     * @param content  raw AI-generated text to de-identify
     * @return map with keys {@code deidentifiedContent} (String) and
     *         {@code redactedFields} (List&lt;String&gt;)
     */
    public Map<String, Object> deidentify(AppUser user, String clientId, String content) throws Exception {
        Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
        List<String> redacted = new ArrayList<>();
        String text = stripPhi(content, client, redacted);
        Map<String, Object> result = new HashMap<>();
        result.put("deidentifiedContent", text);
        result.put("redactedFields", redacted);
        return result;
    }

    /**
     * Applies PHI-stripping regexes to {@code text} using values from {@code client}.
     * Mutates {@code redacted} to record which field categories were found.
     */
    private String stripPhi(String text, Map<String, Object> client, List<String> redacted) {
        String firstName     = safeStr(client, "firstName");
        String lastName      = safeStr(client, "lastName");
        String preferredName = safeStr(client, "preferredName");
        String dob           = safeStr(client, "dob");   // stored as YYYY-MM-DD

        // 1. Full legal name (most specific — do this first so partial replacements
        //    don't break the phrase match)
        if (!firstName.isEmpty() && !lastName.isEmpty()) {
            String full = Pattern.quote(firstName + " " + lastName);
            String replaced = text.replaceAll("(?i)" + full, "{{clientName}}");
            if (!replaced.equals(text)) {
                text = replaced;
                redacted.add("full name");
            }
        }

        // 2. Preferred name (if distinct from first name)
        if (!preferredName.isEmpty() && !preferredName.equalsIgnoreCase(firstName)) {
            String pq = "(?i)\\b" + Pattern.quote(preferredName) + "\\b";
            String replaced = text.replaceAll(pq, "{{clientName}}");
            if (!replaced.equals(text)) {
                text = replaced;
                redacted.add("preferred name");
            }
        }

        // 3. First name alone
        if (!firstName.isEmpty()) {
            String fq = "(?i)\\b" + Pattern.quote(firstName) + "\\b";
            String replaced = text.replaceAll(fq, "{{clientName}}");
            if (!replaced.equals(text)) {
                text = replaced;
                if (!redacted.contains("full name")) redacted.add("first name");
            }
        }

        // 4. Date of birth — try ISO (YYYY-MM-DD), US (M/D/YYYY, MM/DD/YYYY),
        //    EU (D/M/YYYY, DD/MM/YYYY)
        if (!dob.isEmpty()) {
            String[] parts = dob.split("-");
            if (parts.length == 3) {
                try {
                    int yr = Integer.parseInt(parts[0]);
                    int mo = Integer.parseInt(parts[1]);
                    int da = Integer.parseInt(parts[2]);

                    List<String> variants = List.of(
                        dob,                                         // 2015-03-15
                        mo + "/" + da + "/" + yr,                    // 3/15/2015
                        String.format("%02d/%02d/%d", mo, da, yr),   // 03/15/2015
                        da + "/" + mo + "/" + yr,                    // 15/3/2015
                        String.format("%02d/%02d/%d", da, mo, yr)    // 15/03/2015
                    );

                    for (String v : variants) {
                        String replaced = text.replace(v, "{{dateOfBirth}}");
                        if (!replaced.equals(text)) {
                            text = replaced;
                            if (!redacted.contains("date of birth")) {
                                redacted.add("date of birth");
                            }
                        }
                    }
                } catch (NumberFormatException ignored) {
                    log.warn("Could not parse client DOB for de-identification: {}", dob);
                }
            }
        }

        return text;
    }

    private String safeStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return (v instanceof String s) ? s.trim() : "";
    }
}
