package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ClientRequest;
import ai.myaba.model.dto.UserRole;
import ai.myaba.service.AuditService;
import ai.myaba.service.AuthorizationService;
import ai.myaba.service.ClientService;
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

    // ── GET /api/clients ─────────────────────────────────────────────────
    // Returns only clients the requesting user is authorized to see.

    @GetMapping
    public ResponseEntity<?> getClients(@AuthenticationPrincipal AppUser user) {
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

    // ── Inner DTO ─────────────────────────────────────────────────────────

    @lombok.Data
    static class AuthorizationsRequest {
        private String treatingBcbaId;
        private String supervisingBcbaId;
        private List<String> rbtIds;
        private List<String> viewerIds;
    }
}
