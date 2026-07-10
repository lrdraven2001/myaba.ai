package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.AuditService;
import ai.myaba.service.BillingService;
import com.stripe.exception.SignatureVerificationException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Subscription billing endpoints (Stripe).
 *
 * <p>All routes under /api/billing are authenticated and org-scoped EXCEPT the
 * webhook, which Stripe calls unauthenticated but signature-verified. The webhook
 * is exempted from the Firebase auth filter (see SecurityConfig + FirebaseAuthFilter).
 */
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
@Slf4j
public class BillingController {

    private final BillingService billingService;
    private final AuditService auditService;

    // ── GET /api/billing/summary ───────────────────────────────────────────────
    /** Plan, subscription status, period end, and recent invoices for the org. */
    @GetMapping("/summary")
    public ResponseEntity<?> summary(@AuthenticationPrincipal AppUser user) {
        if (unauthenticated(user)) return unauth();
        return ResponseEntity.ok(billingService.getBillingSummary(user.getOrgId()));
    }

    // ── POST /api/billing/checkout  { plan } ───────────────────────────────────
    /** Create a hosted Checkout Session to subscribe to a plan. Admin only. */
    @PostMapping("/checkout")
    public ResponseEntity<?> checkout(@AuthenticationPrincipal AppUser user,
                                      @RequestBody Map<String, String> body) {
        if (unauthenticated(user)) return unauth();
        if (!user.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only an administrator can manage billing"));
        }
        String plan = body.getOrDefault("plan", "");
        if (plan.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "A 'plan' is required"));
        }
        try {
            String url = billingService.createCheckoutSession(user.getOrgId(), user.getEmail(), plan);
            auditService.log("BILLING_CHECKOUT_STARTED", user.getOrgId(), user.getUid(),
                    null, null, null, null, plan);
            return ResponseEntity.ok(Map.of("url", url));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Billing is not configured yet.", "code", "BILLING_NOT_CONFIGURED"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", e.getMessage(), "code", "PLAN_NOT_PURCHASABLE"));
        } catch (Exception e) {
            log.error("checkout failed for org {}: {}", user.getOrgId(), e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Could not start checkout"));
        }
    }

    // ── POST /api/billing/portal ───────────────────────────────────────────────
    /** Create a Billing Portal session (manage plan / payment methods / invoices). Admin only. */
    @PostMapping("/portal")
    public ResponseEntity<?> portal(@AuthenticationPrincipal AppUser user) {
        if (unauthenticated(user)) return unauth();
        if (!user.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only an administrator can manage billing"));
        }
        try {
            String url = billingService.createPortalSession(user.getOrgId(), user.getEmail());
            auditService.log("BILLING_PORTAL_OPENED", user.getOrgId(), user.getUid(),
                    null, null, null, null, null);
            return ResponseEntity.ok(Map.of("url", url));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Billing is not configured yet.", "code", "BILLING_NOT_CONFIGURED"));
        } catch (Exception e) {
            log.error("portal failed for org {}: {}", user.getOrgId(), e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Could not open billing portal"));
        }
    }

    // ── POST /api/billing/webhook ──────────────────────────────────────────────
    /**
     * Stripe webhook. Unauthenticated (no Firebase token) but SIGNATURE-VERIFIED
     * against STRIPE_WEBHOOK_SECRET. Exempted from the auth filter in SecurityConfig.
     * Reads the RAW body (required for signature verification).
     */
    @PostMapping("/webhook")
    public ResponseEntity<String> webhook(@RequestBody String payload,
                                          @RequestHeader(value = "Stripe-Signature", required = false) String sigHeader) {
        if (sigHeader == null || sigHeader.isBlank()) {
            return ResponseEntity.badRequest().body("Missing Stripe-Signature");
        }
        try {
            billingService.handleWebhook(payload, sigHeader);
            return ResponseEntity.ok("ok");
        } catch (SignatureVerificationException e) {
            log.warn("Stripe webhook signature verification failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid signature");
        } catch (IllegalStateException e) {
            // Webhook secret not configured — acknowledge so Stripe doesn't hammer retries.
            log.warn("Stripe webhook received but not configured: {}", e.getMessage());
            return ResponseEntity.ok("ignored");
        } catch (Exception e) {
            log.error("Stripe webhook handling failed: {}", e.getMessage());
            // 500 → Stripe retries later. Only for genuine processing errors.
            return ResponseEntity.internalServerError().body("error");
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private boolean unauthenticated(AppUser user) {
        return user == null || user.getOrgId() == null || user.getOrgId().isBlank();
    }

    private ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}
