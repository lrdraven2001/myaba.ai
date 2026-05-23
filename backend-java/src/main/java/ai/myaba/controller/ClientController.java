package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.ClientRequest;
import ai.myaba.service.AuditService;
import ai.myaba.service.ClientService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
@Slf4j
public class ClientController {

    private final ClientService clientService;
    private final AuditService auditService;

    @GetMapping
    public ResponseEntity<?> getClients(@AuthenticationPrincipal AppUser user) {
        try {
            return ResponseEntity.ok(Map.of("clients", clientService.getClients(user.getOrgId())));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch clients"));
        }
    }

    @GetMapping("/{clientId}")
    public ResponseEntity<?> getClient(
            @PathVariable String clientId,
            @AuthenticationPrincipal AppUser user) {
        try {
            var client = clientService.getClient(user.getOrgId(), clientId);
            auditService.log("CLIENT_ACCESSED", user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(Map.of("client", client));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to fetch client"));
        }
    }

    @PostMapping
    public ResponseEntity<?> createClient(
            @Valid @RequestBody ClientRequest req,
            @AuthenticationPrincipal AppUser user) {
        try {
            String clientId = clientService.createClient(user.getOrgId(), user.getUid(), req);
            auditService.log("CLIENT_CREATED", user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("clientId", clientId));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to create client"));
        }
    }

    @PutMapping("/{clientId}")
    public ResponseEntity<?> updateClient(
            @PathVariable String clientId,
            @Valid @RequestBody ClientRequest req,
            @AuthenticationPrincipal AppUser user) {
        try {
            clientService.updateClient(user.getOrgId(), clientId, req);
            auditService.log("CLIENT_UPDATED", user.getUid(), clientId, null, null, null, null);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Client not found"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to update client"));
        }
    }
}
