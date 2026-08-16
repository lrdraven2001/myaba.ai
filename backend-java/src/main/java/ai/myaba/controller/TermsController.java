package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.TermsService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Legal-terms acceptance for the signed-in user. Backs the app's click-through
 * acceptance gate: {@code GET} reports whether the current version is accepted,
 * {@code POST /accept} records an affirmative acceptance.
 */
@RestController
@RequestMapping("/api/me/terms")
@RequiredArgsConstructor
@Slf4j
public class TermsController {

    private final TermsService termsService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> status(@AuthenticationPrincipal AppUser user) {
        return ResponseEntity.ok(termsService.getStatus(user));
    }

    @PostMapping("/accept")
    public ResponseEntity<?> accept(@AuthenticationPrincipal AppUser user,
                                    @RequestBody Map<String, String> body,
                                    HttpServletRequest request) {
        try {
            String version = body == null ? null : body.get("version");
            termsService.recordAcceptance(user, version, request.getHeader("X-Forwarded-For"));
            return ResponseEntity.ok(Map.of("accepted", true, "version", TermsService.CURRENT_TERMS_VERSION));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "These terms were updated. Please reload and accept the current version.",
                    "currentVersion", TermsService.CURRENT_TERMS_VERSION));
        } catch (Exception e) {
            log.error("Terms acceptance failed for {}: {}", user.getUid(), e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Could not record acceptance."));
        }
    }
}
