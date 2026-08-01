package ai.myaba.event;

/**
 * Published when an org's billable membership changes — a member is added, or a member's
 * AI seat tier (full/lite) changes. {@code BillingService} listens and reconciles the org's
 * Stripe subscription line items (see docs/ai-tiers.md, "active subscription-item sync").
 *
 * <p>Decouples {@code OrgService} from {@code BillingService} (which already depends on
 * OrgService) — no compile-time cycle.
 */
public record MembershipChangedEvent(String orgId) {}
