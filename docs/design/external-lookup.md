# External Lookup — design scope

**Status:** scoped, not started · **Owner:** Chris · **Drafted:** 2026-07-06

## Problem

Clinicians need current facts about external entities — a school's address and
phone, a payer's mailing address, a community resource's intake line. The
clinical AI has no live internet access (by design: chat prompts carry PHI and
must stay inside the Vertex BAA boundary), so today it can only answer from
training data with a verification caveat, or not at all.

## Principle: a separate, PHI-free function

Internet access is **never** wired into the clinical generation path. It is a
standalone capability with its own endpoint, its own input guard, and its own
audit trail. Data flows one way: sanitized public information comes *in* and
becomes governed grounding data; nothing about a client ever goes *out*.

```
user intent ──► query guard (entity name + locality ONLY)
                    │
                    ▼
        ┌── Phase 1: Places API ──► structured contact record
        └── Phase 2: search-grounded Gemini ──► cited research summary
                    │
                    ▼
        sanitizer (plain text, size cap, strip tracking/URLs' params)
                    │
                    ▼
        user reviews & confirms ──► saved with provenance
                    │
                    ▼
        org Directory / knowledge Resources (sensitivity=LOW, source=web)
                    │
                    ▼
        available to chat as a LABELED grounding source (ACLX-governed)
```

## Phase 1 — Directory lookup (contact info) 

The school-address case. No LLM anywhere in the loop.

- **Backend:** `POST /api/lookup/place` → Google Places API (Text Search +
  Place Details). Query is built server-side as `"{entity name} {org city}
  {org state}"` — the org locality already on file biases results correctly.
- **Query guard:** reuse the InputGuard pipeline on the entity-name input —
  reject anything containing client identifiers, DOB-like strings, MRNs.
  The outbound query is *entity name + locality*, nothing else. Audit-log
  every lookup (who, query, result chosen).
- **Result:** name, formatted address, phone, website, Google Maps link,
  `retrievedAt`. User picks the right match from up to 5 candidates.
- **Storage:** new org-scoped collection `organizations/{orgId}/directory`:
  `{ id, type: school|payer|clinic|agency|other, name, address, phone,
  website, sourceUrl, retrievedAt, verifiedBy, verifiedAt }`.
- **Client linkage:** optional `client.schoolDirectoryId` etc. — a client's
  attached chat then includes their school's verified contact block as a
  grounding source (labeled LOW sensitivity), so documents cite real data.
- **UI:** "Look up" affordance in chat (slash-command or button) and a
  Directory section (Resources tab or org settings) to manage saved entries.
- **Cost:** ~US$0.02/lookup (Places Text Search + Details). Negligible.
- **Key setup:** Places API key, HTTP-referrer/IP restricted, billing alert.

## Phase 2 — Research lookup (search-grounded summaries)

Payer policy pages, state Medicaid ABA rules, school-district procedures.

- **Backend:** `POST /api/lookup/research` → Gemini with `googleSearch`
  grounding on a **dedicated non-PHI request** (fast tier). The prompt
  contains only the user's guarded question — never client context, chat
  history, or org documents.
- **Query guard:** same InputGuard pass, plus a semantic check: the request
  is rejected if it references a specific individual.
- **Result:** summary with source citations (URL + title per claim), shown
  to the user for review before anything is saved.
- **Sanitization inbound:** plain-text only, size-capped, sources listed;
  saved content is marked `source=WEB, sensitivity=LOW` in its ACLX label
  metadata so the gateway can treat it as untrusted grounding (prompt-
  injection posture: web text is data, never instructions).
- **Storage:** saved as a knowledge Resource (existing GROUNDING bucket)
  with provenance fields (`sourceUrls[]`, `retrievedAt`, `verifiedBy`).
- **Refresh:** entries carry `retrievedAt`; UI badges anything older than a
  configurable staleness window (default 180 days) as "needs re-verification".

## Explicitly out of scope

- Web access from inside clinical chat/document generation (the model never
  gets a browsing tool there).
- Auto-saving lookups without user confirmation.
- Scraping arbitrary URLs (Phase 2 consumes only search-grounded results
  with citations; a "fetch this URL" importer is a possible Phase 3 with its
  own sanitizer).

## Compliance posture

- Outbound queries carry no PHI by construction (guarded entity name +
  org locality). Places/search calls are still Google infrastructure, but
  BAA coverage is moot because no PHI is transmitted.
- Every lookup is audit-logged per org (`DIRECTORY_LOOKUP`,
  `RESEARCH_LOOKUP` events).
- Inbound content is labeled (source=web, LOW) so ACLX governs it like any
  other grounding source; groundedness scoring treats it as citable support.

## Effort

- Phase 1: ~1 day (endpoint + guard + directory collection + chat/UI hooks).
- Phase 2: ~1–2 days (grounded endpoint + review/save flow + staleness UI).
