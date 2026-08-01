# AI Seat Tiers

Status: **P1 + P2 implemented** (model-access enforcement + per-tier Stripe billing with
active seat sync). Owner: Chris. Last updated: 2026-08-01.

## Why

Billing is **per user per month**. Usage in an ABA org is bimodal:

- **Heavy:** BCBAs / Clinical Directors generate BIPs, FBAs, assessments — the
  reasoning tier (Gemini Pro, tens of thousands of output tokens = expensive).
- **Light:** RBTs, technicians, schedulers, billing/admin — quick chat, lookups,
  session-note help — the fast tier (Flash-Lite = cheap).

Charging a full seat for a technician who runs five chats a month blocks
org-wide adoption. **AI seat tiers** let an org put everyone on the platform: a
cheap **lite** seat that is *structurally* limited to the fast model, and a
**full** seat with everything.

## Core idea — cost control by *access*, not *metering*

The cheap seat is bounded by **which model it can reach**, not by counting
tokens. A lite seat can only ever hit **Flash-Lite**, so worst-case cost per
request is capped by the model itself — no per-user token accounting required.

This reuses the model routing that already exists (`GeminiService` picks the
reasoning vs fast model from a `boolean reasoning` flag; `GenerateController`
sets it). Enforcement = deciding that flag (and blocking the reasoning-only
document path), not building a new accounting system.

## The two-axis model

AI access is the **AND** of two independent axes:

| Axis | Lever | Governs |
|---|---|---|
| **Clinical role** (existing permission matrix) | `RoleConfig` capabilities (`AI_CLINICAL_CHAT`, `DOCUMENT_GENERATE`, `phiAccess`, …) | *What kind* of AI work + PHI access |
| **AI tier** (new, per-member) | `aiTier` ∈ {`full`, `lite`} | *Which model* + whether the expensive doc path is available |

They're orthogonal on purpose: you can have a **lite BCBA** (clinical role, but
cheap seat — Flash only, no doc-gen) or a **full technician**. Effective access
requires *both* to allow an action.

### Tier policy

| | `full` (default) | `lite` |
|---|---|---|
| Fast model (Flash-Lite) chat | ✅ | ✅ |
| Reasoning model (Pro) | ✅ | ❌ → **downgraded to Flash** |
| Document generation (BIP/FBA/assessment) | ✅ (if role allows) | ❌ → **blocked** (not downgraded) |
| PHI / clinical capabilities | per role | per role (unchanged) |

**Downgrade vs block:** reasoning *chat* is downgraded to Flash for lite (still
useful, just cheaper). Document *generation* is **blocked**, never downgraded —
a Flash-generated clinical document would be poor quality, so a lite user gets a
clear "upgrade this seat" wall instead.

### Non-negotiable guardrails

- **Compliance is never gated by tier.** A lite user still gets full ACLX / DLP /
  audit governance — tier only limits AI *generation*, never safety.
- **Lite is inherently non-PHI-favorable.** Lite = Flash = general chat →
  naturally fewer PHI-touching seats, smaller compliance surface.
- **Default is `full`** — every existing member is unchanged until an admin
  explicitly sets `lite`.

## Enforcement points (P1 — implemented)

`aiTier` rides in the Firebase custom claims (like `role`/`phiAccess`), so it's
on the decoded `AppUser` with zero hot-path reads. `AiTier.fromClaim()` resolves
it (default `FULL`).

1. **Clinical chat** — `GenerateController.chat` clinical branch:
   `reasoning = (clientAttached || projectAttached) && AiTier.fromClaim(user).allowsReasoningModel()`.
   Lite → `false` → Flash. (General-chat branch already runs Flash-only.)
2. **Document generation** — `GenerateController.generateDocument`: if
   `!AiTier.fromClaim(user).allowsDocumentGeneration()` → **403** `LITE_TIER_NO_DOC_GEN`
   with an upgrade message. Blocked before any model call.
3. **Backstop:** the existing org/seat request cap (`UsageService`) still applies
   — model ceiling *and* request cap. No per-user token counters in P1.

### Claims lifecycle

- `aiTier` is **preserved** across role re-mints: `OrgService.setUserClaims`
  reads and carries forward the existing `aiTier` (default `full`) so a role
  change never wipes the tier.
- Admin sets it via `PUT /api/orgs/{orgId}/members/{uid}/ai-tier { tier }`
  (admin-gated) → `OrgService.changeMemberAiTier` updates the member record and
  re-mints the claim. Takes effect on the member's next token refresh (≤1h /
  re-login), same as a role change.
- New members seed `aiTier = "full"` (`writeMemberRecord`); `getOrgMembers`
  surfaces it so the Team UI can show/set it.

## Admin & user experience

- **Team → member panel:** a "Seat tier" control (Full / Lite) next to Role.
- **Lite user hitting doc-gen:** backend 403 → the UI surfaces
  "Document generation needs a full seat — ask an admin to upgrade yours."

## P2 — per-tier pricing (implemented)

- **Stripe:** one subscription per org, **one line item per tier** — Team-Full
  (`stripe.prices.team`, $35) × full seats and Team-Lite (`stripe.prices.team-lite`,
  $15) × lite seats.
- **$50 floor via price-swap (option A):** when a Team org's per-tier total is below
  $50 (only a 1-seat team, since the admin is always a full seat), the subscription
  is billed on the **Solo price** ($50) instead. `BillingService.computeDesiredItems`
  owns this. Floor amounts are constants (`FULL_SEAT_CENTS`/`LITE_SEAT_CENTS`/
  `MIN_TEAM_CENTS`) that **must be kept in sync with the Stripe Prices**.
- **Active seat sync:** `OrgService` publishes a `MembershipChangedEvent` on member
  add / AI-tier change; `BillingService.onMembershipChanged → syncSubscriptionSeats`
  reconciles the live subscription's line items (add/update/delete) with proration.
  Best-effort — a Stripe failure never breaks member management. No-op until the org
  is subscribed (checkout sets the initial items).
- **Webhook:** seat count = **sum of all line-item quantities**; plan is derived from
  **all** items (any Team/Team-Lite item → `team`; a floored 1-seat team reads `solo`).
- **Config:** set `STRIPE_PRICE_TEAM_LITE` (sandbox `price_1Tzd7nD25u0E4OT7YTbrjO1J`).
  Until it's set, lite seats simply aren't billed (graceful — no line item).

### Known pricing (sandbox, 2026-08-01)

| Tier | Price / user / mo | Stripe |
|---|---|---|
| Team – Full | $35 | (existing `stripe.prices.team`) |
| **Team – Lite** | **$15** | product `prod_UzcMccmizElxV4` — *need the `price_…` id* (the config takes the Price ID, not the Product ID) |
| Solo | $50 | (existing `stripe.prices.solo`) |

### Team billing floor rules (Chris, 2026-08-01)

- **Minimum Team bill = $50/mo.** If the sum of a Team org's per-seat line items
  is below $50 (e.g. only a couple of lite seats), the org still bills **$50**.
- **A one-user Team is billed as Solo** ($50 flat), not per-seat.

> Implementation note: Stripe has no native "minimum invoice" primitive. Likely
> shapes — (a) a $50 base Price that includes the first full seat + per-additional
> per-tier seats, or (b) compute the floor in `BillingService` and set quantities /
> add a top-up line to reach $50. Needs a design pass before coding — money logic.
> **Open:** does "one user" mean one seat *total* (full or lite), or one *full*
> seat? And does the $50 floor apply to lite-only teams too? (Assumed yes.)

## Open product decisions (not guessed — need Chris)

1. **Lite request cap number** — the monthly fast-model request ceiling for a
   lite seat (currently inherits the plan/seat cap).
2. **Blocked-path UX** — hard "upgrade" wall vs. an "request access" flow that
   notifies an admin.
3. **Team floor semantics** — "one user = Solo": one seat *total* or one *full*
   seat? Does the $50 floor apply to lite-only teams? (See P2 above.)

## Phasing

- **P0** — billing-card reframe to per-seat (separate small change).
- **P1** — `aiTier` + model-access enforcement + admin control. ← *this change*
- **P2** — per-tier Stripe Prices + reconciliation.
- **P3 (optional)** — per-user token *reporting* dashboards (nice-to-have; not
  required for cost control).
