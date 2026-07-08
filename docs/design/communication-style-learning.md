# Communication-style learning — design overview

**Status:** scoped, not started · **Owner:** Chris · **Drafted:** 2026-07-06

## Goal

Make the system get better over time at *how* it communicates with a given
org/user — tone, format, length, terminology, structure — learned from how they
actually interact, not just from settings they fill in.

## What exists today (and what it isn't)

- **ACLX feedback loop** (`FeedbackStore`, per-org confidence): learns what to
  **block/allow**. Compliance, not style. Out of scope here but the same shape.
- **Project instructions + org content rules**: **explicit** preferences the
  user types in; injected into the system prompt. Not learned.
- There is **no** mechanism that infers communication preferences from behavior.

So: today the system does not learn communication style. This design adds it.

## Principle

Two layers, explicit over learned:

1. **Explicit style profile** — a structured, user-editable preference object.
   Deterministic, transparent, instantly effective. Ships first.
2. **Learned signal** — passively distilled from interaction, proposed to the
   user for confirmation (never silently applied to clinical output). Layered on
   top once the explicit layer is in use.

Both resolve into a **StyleProfile** block injected into the system prompt,
alongside the existing base/clinical/project/policy layers in
`buildChatSystemPrompt` and the document generation prompt.

## The StyleProfile

Stored at `organizations/{orgId}/styleProfile/{scope}` where scope is `org` or a
`user:{uid}` override (user overrides org; org is the default).

```
{
  scope: "org" | "user:{uid}",
  tone:            "concise" | "detailed" | "warm" | "clinical-formal" | ...,
  defaultLength:   "brief" | "standard" | "thorough",
  formatting:      { bullets: bool, headings: bool, tables_for_data: bool },
  terminology:     [ "use 'learner' not 'patient'", "client initials only", ... ],
  documentDefaults:{ progress_note_max_words: 200, ... },
  freeform:        "Any additional written guidance.",
  updatedAt, updatedBy,
  learnedCandidates: [ { text, evidenceCount, status: proposed|accepted|rejected } ]
}
```

Injected as a compact `COMMUNICATION STYLE:` prompt block. Terminology rules
that are safety-adjacent (e.g. name handling) continue to be enforced by the
existing deterministic rewrite pass, not just the prompt.

## Phase 1 — Explicit profile (~1–2 days)

- Settings → new "Communication Style" card (org-level; admins edit).
- `GET/PUT /api/orgs/{orgId}/style-profile`; `OrgService` persistence.
- Inject the profile block in `buildChatSystemPrompt` and document generation.
- Optional per-user override toggle.

Value on its own: users stop repeating "keep it short / use initials / no
jargon" every session.

## Phase 2 — Learned signal (~3–4 days)

Capture lightweight, honest signals — no model guessing in the dark:

- **Explicit:** 👍/👎 with an optional note on any AI response; a "regenerate —
  make it shorter/longer/simpler" control (the chosen adjustment is the signal).
- **Implicit:** when a user edits a generated document before saving, diff the
  original vs. saved (length delta, added/removed sections, terminology swaps).
  Store the *derived preference*, never raw PHI.

Distill signals into `learnedCandidates` (e.g. "tends to shorten progress notes
by ~40%", "consistently changes 'patient' → 'client'"). Surface accepted-pattern
candidates in the Style card as **suggestions the user confirms** ("Apply this
preference?"). Only confirmed candidates enter the active profile.

Storage/telemetry mirrors `FeedbackStore` (durable, per-org; Firestore).

## Explicitly out of scope

- Auto-applying learned style to clinical output without confirmation.
- Learning that changes *what* is said (clinical substance) — style only.
- Cross-org learning / shared models (each org's profile is its own).

## Open decisions

1. Org-only first, or org + per-user from the start? (Lean: org first.)
2. Does the learned layer auto-propose, or only aggregate until an admin looks?
   (Lean: aggregate + propose in the Style card; never silent.)
3. Should document generation honor style differently than chat? (e.g. formal
   docs ignore a "warm" tone.) Likely yes — profile carries per-surface hints.
