package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ClientRequest;
import ai.myaba.model.dto.UserRole;
import ai.myaba.service.AuditService;
import ai.myaba.service.AuthorizationService;
import ai.myaba.service.ClientService;
import ai.myaba.service.OrgService;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
@Slf4j
public class ClientController {

    private final ClientService clientService;
    private final AuthorizationService authorizationService;
    private final AuditService auditService;
    private final OrgService orgService;

    @org.springframework.beans.factory.annotation.Value("${dev.auth-enabled:false}")
    private boolean devMode;

    /** Returns a 403 response if the org's BAA has not been signed, null otherwise. */
    private ResponseEntity<?> baaGate(AppUser user) {
        if (!orgService.isBaaAccepted(user.getOrgId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "BAA_NOT_SIGNED",
                                 "message", "Your organization's Business Associate Agreement has not been signed. A Clinical Director must sign the BAA before client records can be accessed."));
        }
        return null;
    }

    // ── GET /api/clients ─────────────────────────────────────────────────
    // Returns only clients the requesting user is authorized to see.

    @GetMapping
    public ResponseEntity<?> getClients(@AuthenticationPrincipal AppUser user) {
        ResponseEntity<?> gate = baaGate(user);
        if (gate != null) return gate;
        try {
            List<Map<String, Object>> clients = clientService.getAuthorizedClients(user);
            return ResponseEntity.ok(clients);
        } catch (Exception e) {
            log.error("getClients failed for org {}: {}", user.getOrgId(), e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch clients"));
        }
    }

    // ── GET /api/clients/{clientId} ───────────────────────────────────────

    @GetMapping("/{clientId}")
    public ResponseEntity<?> getClient(@PathVariable String clientId,
                                        @AuthenticationPrincipal AppUser user) {
        ResponseEntity<?> gate = baaGate(user);
        if (gate != null) return gate;
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);

            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to access this client"));
            }

            auditService.log("CLIENT_ACCESSED", user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(client);

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("getClient failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch client"));
        }
    }

    // ── POST /api/clients ─────────────────────────────────────────────────
    // Only BCBA roles and ORG_ADMIN can create client records.

    @PostMapping
    public ResponseEntity<?> createClient(@Valid @RequestBody ClientRequest req,
                                           @AuthenticationPrincipal AppUser user) {
        ResponseEntity<?> baaCheck = baaGate(user);
        if (baaCheck != null) return baaCheck;
        if (!user.isClinical() && !user.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only clinical staff or admins can create client records"));
        }
        try {
            String clientId = clientService.createClient(user.getOrgId(), user.getUid(), req);
            auditService.log("CLIENT_CREATED", user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("clientId", clientId));
        } catch (Exception e) {
            log.error("createClient failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to create client"));
        }
    }

    // ── PUT /api/clients/{clientId} ───────────────────────────────────────

    @PutMapping("/{clientId}")
    public ResponseEntity<?> updateClient(@PathVariable String clientId,
                                           @Valid @RequestBody ClientRequest req,
                                           @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);

            if (!authorizationService.canEditClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to edit this client"));
            }

            clientService.updateClient(user.getOrgId(), clientId, req);
            auditService.log("CLIENT_UPDATED", user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(Map.of("success", true));

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("updateClient failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update client"));
        }
    }

    // ── PUT /api/clients/{clientId}/authorizations ────────────────────────
    // Update caseload assignments (treating BCBA, RBTs, supervising BCBA).
    // Only the treating/supervising BCBA or ORG_ADMIN may reassign.

    @PutMapping("/{clientId}/authorizations")
    public ResponseEntity<?> updateAuthorizations(
            @PathVariable String clientId,
            @RequestBody AuthorizationsRequest req,
            @AuthenticationPrincipal AppUser user) {

        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);

            if (!authorizationService.canManageClientAuthorizations(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to manage assignments for this client"));
            }

            clientService.updateAuthorizations(
                    user.getOrgId(), clientId,
                    req.getTreatingBcbaId(),
                    req.getSupervisorIds(),
                    req.getSupervisingBcbaId(),
                    req.getRbtIds(),
                    req.getViewerIds()
            );

            auditService.log("CLIENT_AUTHORIZATIONS_UPDATED", user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(Map.of("success", true));

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("updateAuthorizations failed {}: {}", clientId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update authorizations"));
        }
    }

    // ── GET /api/clients/{clientId}/documents ────────────────────────────────
    //
    // Lists AI-generated documents persisted for this client.
    // Returns metadata only — no full content — sorted newest-first.

    @GetMapping("/{clientId}/documents")
    public ResponseEntity<?> getClientDocuments(
            @PathVariable String clientId,
            @AuthenticationPrincipal AppUser user) {

        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to view documents for this client"));
            }

            if (devMode) {
                return ResponseEntity.ok(Map.of("documents", List.of()));
            }

            Firestore db = FirestoreClient.getFirestore();
            List<QueryDocumentSnapshot> docs = db
                    .collection("orgs").document(user.getOrgId())
                    .collection("clients").document(clientId)
                    .collection("documents")
                    .orderBy("createdAtMs", com.google.cloud.firestore.Query.Direction.DESCENDING)
                    .limit(50)
                    .get().get().getDocuments();

            List<Map<String, Object>> result = docs.stream()
                    .map(doc -> {
                        Map<String, Object> data = new java.util.LinkedHashMap<>(doc.getData());
                        data.put("id", doc.getId());
                        // Remove raw content from list view — fetch by ID for full content
                        data.remove("content");
                        data.remove("aclxContentLabel");
                        return data;
                    })
                    .toList();

            return ResponseEntity.ok(Map.of("documents", result));

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("getClientDocuments failed {} / {}: {}", user.getOrgId(), clientId, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to load documents"));
        }
    }

    // ── GET /api/clients/{clientId}/documents/{docId} ─────────────────────────
    // Returns a single persisted document INCLUDING its content, so it can be
    // attached as chat context. Authorized clinical staff receive the full text.
    @GetMapping("/{clientId}/documents/{docId}")
    public ResponseEntity<?> getClientDocument(
            @PathVariable String clientId,
            @PathVariable String docId,
            @AuthenticationPrincipal AppUser user) {
        try {
            Map<String, Object> client = clientService.getClient(user.getOrgId(), clientId);
            if (!authorizationService.canAccessClient(user, client)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Not authorized to view documents for this client"));
            }
            if (devMode) {
                return ResponseEntity.ok(Map.of("id", docId, "content", ""));
            }
            Firestore db = FirestoreClient.getFirestore();
            com.google.cloud.firestore.DocumentSnapshot snap = db
                    .collection("orgs").document(user.getOrgId())
                    .collection("clients").document(clientId)
                    .collection("documents").document(docId)
                    .get().get();
            if (!snap.exists()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Document not found"));
            }
            Map<String, Object> data = new java.util.LinkedHashMap<>(snap.getData());
            data.put("id", snap.getId());
            data.remove("aclxContentLabel"); // signing artefact — not needed by the client
            return ResponseEntity.ok(data);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            log.error("getClientDocument failed {} / {} / {}: {}", user.getOrgId(), clientId, docId, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to load document"));
        }
    }

    // ── Inner DTO ─────────────────────────────────────────────────────────

    @lombok.Data
    static class AuthorizationsRequest {
        private String treatingBcbaId;
        /** All supervisors on the case (roster). */
        private List<String> supervisorIds;
        /** Current / primary supervisor — must be one of supervisorIds. */
        private String supervisingBcbaId;
        private List<String> rbtIds;
        private List<String> viewerIds;
    }
}
