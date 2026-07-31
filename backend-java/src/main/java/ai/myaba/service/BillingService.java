package ai.myaba.service;

import ai.myaba.util.FirestoreCollections;
import ai.myaba.util.TimestampUtil;

import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import com.stripe.Stripe;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Customer;
import com.stripe.model.Event;
import com.stripe.model.Invoice;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.InvoiceListParams;
import com.stripe.param.billingportal.SessionCreateParams;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stripe subscription billing for the existing plan/usage model.
 *
 * <p><b>Card data never touches our servers</b> — card capture happens on Stripe's
 * hosted Checkout, and plan/payment-method management on the Stripe Billing Portal.
 * This keeps the platform out of PCI scope; we only ever hold Stripe object IDs.
 *
 * <p><b>Stripe is the source of truth for paid status.</b> Webhooks
 * ({@link #handleWebhook}) sync {@code stripeCustomerId}, {@code stripeSubscriptionId},
 * {@code subscriptionStatus}, {@code currentPeriodEnd}, and the org's {@code plan}
 * into the org document. {@link UsageService} then enforces limits from that plan +
 * status.
 *
 * <p><b>Fail-graceful:</b> when {@code stripe.secret-key} is unset the service is
 * DISABLED — the billing endpoints report "not configured" instead of erroring, so
 * the app runs normally before Stripe is provisioned (mirrors {@link GcsStorageService}).
 *
 * <p><b>Tenancy:</b> every operation is keyed by the caller's token-derived orgId;
 * the Stripe Customer carries {@code metadata.orgId} and subscriptions carry it too,
 * so inbound webhooks resolve back to exactly one org.
 */
@Service
@Slf4j
public class BillingService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    @Value("${stripe.secret-key:}")
    private String secretKey;

    @Value("${stripe.webhook-secret:}")
    private String webhookSecret;

    @Value("${stripe.prices.solo:}")
    private String priceSolo;
    @Value("${stripe.prices.team:}")
    private String priceTeam;
    @Value("${stripe.prices.enterprise:}")
    private String priceEnterprise;

    @Value("${stripe.checkout-success-url:}")
    private String checkoutSuccessUrl;
    @Value("${stripe.checkout-cancel-url:}")
    private String checkoutCancelUrl;
    @Value("${stripe.portal-return-url:}")
    private String portalReturnUrl;

    private final OrgService orgService;

    public BillingService(OrgService orgService) {
        this.orgService = orgService;
    }

    @PostConstruct
    void init() {
        if (isEnabled()) {
            Stripe.apiKey = secretKey;
            log.info("Stripe billing enabled (prices configured: solo={}, team={}, enterprise={})",
                    !isBlank(priceSolo), !isBlank(priceTeam), !isBlank(priceEnterprise));
        } else {
            log.info("Stripe billing DISABLED — STRIPE_SECRET_KEY not set. Billing endpoints will report not-configured.");
        }
    }

    /** True when Stripe is configured and usable. */
    public boolean isEnabled() {
        return !isBlank(secretKey);
    }

    /** True when the webhook can be signature-verified. */
    public boolean isWebhookConfigured() {
        return !isBlank(webhookSecret);
    }

    // ── Plan ↔ price mapping ────────────────────────────────────────────────────

    /** Stripe Price ID for a plan tier, or null when unset (e.g. enterprise = contact sales). */
    public String priceIdForPlan(String plan) {
        if (plan == null) return null;
        return switch (plan.toLowerCase()) {
            case "solo"       -> emptyToNull(priceSolo);
            case "team"       -> emptyToNull(priceTeam);
            case "enterprise" -> emptyToNull(priceEnterprise);
            default           -> null;
        };
    }

    /** Reverse map: a Stripe Price ID back to our plan tier, or null if unrecognized. */
    private String planForPriceId(String priceId) {
        if (priceId == null) return null;
        if (priceId.equals(emptyToNull(priceSolo)))       return "solo";
        if (priceId.equals(emptyToNull(priceTeam)))       return "team";
        if (priceId.equals(emptyToNull(priceEnterprise))) return "enterprise";
        return null;
    }

    // ── Customer ────────────────────────────────────────────────────────────────

    /**
     * Return the org's Stripe Customer ID, creating the Customer on first use and
     * persisting the ID on the org document. {@code metadata.orgId} lets webhooks
     * resolve back to this tenant.
     */
    public String getOrCreateCustomer(String orgId, String billingEmail) throws Exception {
        Map<String, Object> org = orgService.getOrg(orgId);
        Object existing = org == null ? null : org.get("stripeCustomerId");
        if (existing instanceof String s && !s.isBlank()) {
            return s;
        }
        String orgName = org != null ? String.valueOf(org.getOrDefault("name", "MyABA org")) : "MyABA org";
        CustomerCreateParams.Builder params = CustomerCreateParams.builder()
                .setName(orgName)
                .putMetadata("orgId", orgId);
        if (billingEmail != null && !billingEmail.isBlank()) params.setEmail(billingEmail);
        Customer customer = Customer.create(params.build());
        writeOrgBilling(orgId, Map.of("stripeCustomerId", customer.getId()));
        return customer.getId();
    }

    // ── Checkout & Portal ───────────────────────────────────────────────────────

    /**
     * Create a hosted Checkout Session to subscribe the org to {@code plan}'s monthly
     * price. Returns the redirect URL.
     *
     * @throws IllegalStateException    if Stripe is not configured
     * @throws IllegalArgumentException if the plan has no configured price (e.g. enterprise)
     */
    public String createCheckoutSession(String orgId, String billingEmail, String plan) throws Exception {
        requireEnabled();
        String priceId = priceIdForPlan(plan);
        if (priceId == null) {
            throw new IllegalArgumentException("No Stripe price configured for plan '" + plan
                    + "'. This tier may be contact-sales.");
        }
        String customerId = getOrCreateCustomer(orgId, billingEmail);

        // Per-seat plans (Team) bill quantity = the org's active member count; flat
        // plans (Solo) bill a single unit. The subscription quantity IS the paid
        // seat count — the webhook syncs it back to the org doc, where it also
        // drives the per-seat usage cap (UsageService).
        long quantity = isPerSeat(plan) ? orgService.seatCount(orgId) : 1L;

        com.stripe.param.checkout.SessionCreateParams params =
                com.stripe.param.checkout.SessionCreateParams.builder()
                        .setMode(com.stripe.param.checkout.SessionCreateParams.Mode.SUBSCRIPTION)
                        .setCustomer(customerId)
                        .setSuccessUrl(orDefault(checkoutSuccessUrl, "https://app.myaba.ai/settings?tab=billing"))
                        .setCancelUrl(orDefault(checkoutCancelUrl, "https://app.myaba.ai/settings?tab=billing"))
                        .setClientReferenceId(orgId)
                        .addLineItem(com.stripe.param.checkout.SessionCreateParams.LineItem.builder()
                                .setPrice(priceId).setQuantity(quantity).build())
                        // Stamp orgId on the subscription so subscription.* webhooks resolve the tenant.
                        .setSubscriptionData(com.stripe.param.checkout.SessionCreateParams.SubscriptionData.builder()
                                .putMetadata("orgId", orgId).build())
                        .build();
        Session session = Session.create(params);
        return session.getUrl();
    }

    /** Create a Billing Portal session (manage plan / payment methods / invoices). */
    public String createPortalSession(String orgId, String billingEmail) throws Exception {
        requireEnabled();
        String customerId = getOrCreateCustomer(orgId, billingEmail);
        SessionCreateParams params = SessionCreateParams.builder()
                .setCustomer(customerId)
                .setReturnUrl(orDefault(portalReturnUrl, "https://app.myaba.ai/settings?tab=billing"))
                .build();
        com.stripe.model.billingportal.Session session = com.stripe.model.billingportal.Session.create(params);
        return session.getUrl();
    }

    // ── Billing summary (for the Billing & Usage tab) ───────────────────────────

    /**
     * Billing snapshot for the UI: plan, subscription status, period end, whether a
     * payment method exists, and recent invoices. Reads persisted fields from the org
     * doc and (when a customer exists) recent invoices from Stripe.
     */
    public Map<String, Object> getBillingSummary(String orgId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stripeConfigured", isEnabled());
        try {
            Map<String, Object> org = orgService.getOrg(orgId);
            String plan       = org != null ? (String) org.get("plan") : null;
            String custId     = org != null ? (String) org.get("stripeCustomerId") : null;
            String subId      = org != null ? (String) org.get("stripeSubscriptionId") : null;
            String status     = org != null ? (String) org.get("subscriptionStatus") : null;
            Object periodEnd  = org != null ? org.get("currentPeriodEnd") : null;

            out.put("plan",               plan);
            out.put("subscriptionStatus", status);
            out.put("currentPeriodEnd",   periodEnd);
            out.put("hasSubscription",    subId != null && !subId.isBlank());
            out.put("entitled",           isEntitled(status));
            out.put("hasPriceForUpgrade", Map.of(
                    "solo",       priceIdForPlan("solo")       != null,
                    "team",       priceIdForPlan("team")       != null,
                    "enterprise", priceIdForPlan("enterprise") != null));

            List<Map<String, Object>> invoices = new ArrayList<>();
            if (isEnabled() && custId != null && !custId.isBlank()) {
                try {
                    var list = Invoice.list(InvoiceListParams.builder()
                            .setCustomer(custId).setLimit(6L).build());
                    for (Invoice inv : list.getData()) {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id",        inv.getId());
                        m.put("number",    inv.getNumber());
                        m.put("status",    inv.getStatus());
                        m.put("amountDue", inv.getAmountDue());
                        m.put("amountPaid", inv.getAmountPaid());
                        m.put("currency",  inv.getCurrency());
                        m.put("created",   inv.getCreated());
                        m.put("hostedInvoiceUrl", inv.getHostedInvoiceUrl());
                        m.put("pdf",       inv.getInvoicePdf());
                        invoices.add(m);
                    }
                } catch (Exception e) {
                    log.warn("Could not list invoices for org {}: {}", orgId, e.getMessage());
                }
            }
            out.put("invoices", invoices);
        } catch (Exception e) {
            log.error("getBillingSummary failed for org {}: {}", orgId, e.getMessage());
            out.put("error", "Failed to load billing summary");
        }
        return out;
    }

    // ── Webhook ─────────────────────────────────────────────────────────────────

    /**
     * Verify a Stripe webhook signature and sync subscription state into Firestore.
     * Called from the (unauthenticated, signature-verified) webhook endpoint.
     *
     * @throws SignatureVerificationException if the signature is invalid
     * @throws IllegalStateException          if the webhook secret is not configured
     */
    public void handleWebhook(String payload, String sigHeader) throws Exception {
        if (!isWebhookConfigured()) {
            throw new IllegalStateException("Stripe webhook secret not configured");
        }
        Event event = Webhook.constructEvent(payload, sigHeader, webhookSecret);
        String type = event.getType();
        log.info("Stripe webhook received: {} (id={})", type, event.getId());

        switch (type) {
            case "checkout.session.completed" -> {
                var obj = event.getDataObjectDeserializer().getObject().orElse(null);
                if (obj instanceof Session session) {
                    String orgId = session.getClientReferenceId();
                    if (orgId == null) orgId = metaOrg(session.getMetadata());
                    if (session.getSubscription() != null) {
                        Subscription sub = Subscription.retrieve(session.getSubscription());
                        syncSubscription(orgId, sub, session.getCustomer());
                    } else if (orgId != null && session.getCustomer() != null) {
                        writeOrgBilling(orgId, Map.of("stripeCustomerId", session.getCustomer()));
                    }
                }
            }
            case "customer.subscription.created",
                 "customer.subscription.updated",
                 "customer.subscription.deleted" -> {
                var obj = event.getDataObjectDeserializer().getObject().orElse(null);
                if (obj instanceof Subscription sub) {
                    syncSubscription(metaOrg(sub.getMetadata()), sub, sub.getCustomer());
                }
            }
            case "invoice.paid", "invoice.payment_failed" -> {
                var obj = event.getDataObjectDeserializer().getObject().orElse(null);
                if (obj instanceof Invoice inv && inv.getSubscription() != null) {
                    try {
                        Subscription sub = Subscription.retrieve(inv.getSubscription());
                        syncSubscription(metaOrg(sub.getMetadata()), sub, inv.getCustomer());
                    } catch (Exception e) {
                        log.warn("invoice event: could not retrieve subscription {}: {}",
                                inv.getSubscription(), e.getMessage());
                    }
                }
            }
            default -> log.debug("Unhandled Stripe event type: {}", type);
        }
    }

    /**
     * Persist a subscription's state to the org doc and keep {@code plan} in sync.
     * A lapsed status (not active/trialing) downgrades the plan to "free" so usage
     * enforcement limits the org. orgId may come from subscription metadata or, as a
     * fallback, the customer's metadata.
     */
    private void syncSubscription(String orgId, Subscription sub, String customerId) throws Exception {
        if (orgId == null || orgId.isBlank()) {
            orgId = orgIdFromCustomer(customerId);
        }
        if (orgId == null || orgId.isBlank()) {
            log.warn("Stripe webhook: could not resolve orgId for subscription {} (customer {})",
                    sub != null ? sub.getId() : "null", customerId);
            return;
        }

        String status = sub != null ? sub.getStatus() : null;
        Map<String, Object> updates = new HashMap<>();
        if (customerId != null)   updates.put("stripeCustomerId",     customerId);
        if (sub != null)          updates.put("stripeSubscriptionId", sub.getId());
        updates.put("subscriptionStatus", status);
        updates.put("billingUpdatedAt",   TimestampUtil.now());

        Long periodEnd = subscriptionPeriodEnd(sub);
        if (periodEnd != null) updates.put("currentPeriodEnd", periodEnd);

        // Paid seat count (per-seat plans) → drives the per-seat usage cap.
        Long seats = subscriptionSeats(sub);
        if (seats != null) updates.put("seats", seats);

        // Keep the plan string in sync — Stripe is source of truth for paid status.
        String priceId = firstPriceId(sub);
        String planFromPrice = planForPriceId(priceId);
        boolean deleted = "canceled".equals(status);
        if (deleted || !isEntitled(status)) {
            // Lapsed / canceled → downgrade to the limited free tier.
            updates.put("plan", "free");
        } else if (planFromPrice != null) {
            updates.put("plan", planFromPrice);
        }
        writeOrgBilling(orgId, updates);
        log.info("Synced subscription for org {}: status={} plan={}", orgId, status, updates.get("plan"));
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /** Entitled (full plan) statuses. Null/blank = never subscribed → treat as entitled (unchanged behaviour). */
    public boolean isEntitled(String status) {
        if (status == null || status.isBlank()) return true;
        return "active".equals(status) || "trialing".equals(status);
    }

    private String firstPriceId(Subscription sub) {
        try {
            if (sub != null && sub.getItems() != null && sub.getItems().getData() != null
                    && !sub.getItems().getData().isEmpty()) {
                var price = sub.getItems().getData().get(0).getPrice();
                return price != null ? price.getId() : null;
            }
        } catch (Exception e) {
            log.debug("firstPriceId failed: {}", e.getMessage());
        }
        return null;
    }

    /** True for plans billed per seat (Stripe quantity = seats); false for flat plans. */
    private boolean isPerSeat(String plan) {
        return "team".equalsIgnoreCase(plan);
    }

    /** Paid seat count from the subscription's first item quantity, or null. */
    private Long subscriptionSeats(Subscription sub) {
        try {
            if (sub != null && sub.getItems() != null && sub.getItems().getData() != null
                    && !sub.getItems().getData().isEmpty()) {
                return sub.getItems().getData().get(0).getQuantity();
            }
        } catch (Exception e) {
            log.debug("subscriptionSeats failed: {}", e.getMessage());
        }
        return null;
    }

    private Long subscriptionPeriodEnd(Subscription sub) {
        try {
            return sub != null ? sub.getCurrentPeriodEnd() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String orgIdFromCustomer(String customerId) {
        if (customerId == null || customerId.isBlank() || !isEnabled()) return null;
        try {
            Customer c = Customer.retrieve(customerId);
            return c.getMetadata() != null ? c.getMetadata().get("orgId") : null;
        } catch (Exception e) {
            log.warn("Could not resolve orgId from customer {}: {}", customerId, e.getMessage());
            return null;
        }
    }

    private static String metaOrg(Map<String, String> metadata) {
        return metadata != null ? metadata.get("orgId") : null;
    }

    /** Write billing fields onto the org document via the Admin SDK (server-side). */
    private void writeOrgBilling(String orgId, Map<String, Object> fields) {
        if (devMode) {
            log.info("[BILLING-DEV] org {} update: {}", orgId, fields);
            return;
        }
        try {
            Firestore db = FirestoreClient.getFirestore();
            db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                    .set(fields, com.google.cloud.firestore.SetOptions.merge()).get();
        } catch (Exception e) {
            log.error("Failed to write billing fields for org {}: {}", orgId, e.getMessage());
        }
    }

    private void requireEnabled() {
        if (!isEnabled()) throw new IllegalStateException("Billing is not configured (STRIPE_SECRET_KEY unset).");
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }
    private static String emptyToNull(String s) { return isBlank(s) ? null : s; }
    private static String orDefault(String s, String def) { return isBlank(s) ? def : s; }
}
