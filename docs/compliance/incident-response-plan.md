# Incident Response Plan
**myABA.ai** | Version 1.0 | Classification: Internal

---

## 1. Purpose

This plan defines how myABA.ai detects, contains, investigates, and recovers
from security incidents — including those involving Protected Health Information
(PHI).

HIPAA requires covered entities and business associates to have documented
procedures for responding to security incidents (§164.308(a)(6)).  This plan
satisfies that requirement and supports SOC 2 Common Criteria CC7.3–CC7.5.

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Security incident** | Any actual or suspected unauthorized access, use, disclosure, modification, or destruction of information or systems |
| **PHI breach** | An impermissible use or disclosure of PHI that compromises its security or privacy, as defined under the HIPAA Breach Notification Rule (§164.402) |
| **Severity P1** | Confirmed PHI exposure or complete service outage |
| **Severity P2** | Suspected PHI exposure, partial outage, or active attack in progress |
| **Severity P3** | Security anomaly with no confirmed PHI impact; degraded service |
| **Severity P4** | Policy violation or low-impact finding with no customer data risk |

---

## 3. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **Incident Commander (IC)** | Owns the response; makes go/no-go decisions; customer communication |
| **Security Lead** | Technical investigation; containment; root-cause analysis |
| **Engineering On-Call** | Infrastructure changes; system isolation; evidence collection |
| **Legal / Compliance** | HIPAA breach notification decisions; regulatory reporting |
| **Customer Success** | Drafts customer communications under IC direction |

---

## 4. Response Phases

### Phase 1 — Detection & Triage (Target: ≤ 1 hour)

**Trigger sources:**
- Cloud Monitoring alert
- ACLX anomaly spike
- Audit log query showing anomalous patterns
- Customer report
- Security researcher disclosure (see SECURITY.md)
- Employee observation

**Actions:**
1. On-call engineer acknowledges the alert and opens an incident channel (#incident-YYYY-MM-DD).
2. Assign initial severity (P1–P4) based on available information.
3. Page the Incident Commander for P1/P2.
4. Begin a running incident log (Google Doc or Confluence page) — timestamp every action.
5. Do **not** delete, modify, or overwrite any logs or artifacts until evidence preservation is confirmed.

### Phase 2 — Containment (Target: ≤ 4 hours for P1/P2)

**Immediate containment options (use the minimum necessary):**

| Action | When to use |
|---|---|
| Revoke Firebase tokens for affected user(s) | Compromised account |
| Disable affected organization in Firestore | Org-level compromise |
| Rotate affected API keys / secrets | Credential exposure |
| Block offending IP at load balancer | Active attack source |
| Take snapshot of affected Firestore collections | Evidence preservation before remediation |
| Enable Cloud Run traffic splitting to isolate new versions | Suspected malicious deployment |

**Do NOT:**
- Delete audit logs during active investigation
- Modify affected Firestore documents without a backup
- Communicate publicly before the IC approves messaging

### Phase 3 — Investigation & Eradication (P1/P2: ≤ 24 hours to root cause)

1. Pull audit logs for the affected time window (query `auditLog` collection on `timestamp`/`userId`/`sourceIp`).
2. Correlate with Cloud Run request logs using the `X-Correlation-Id` header.
3. Determine:
   - What data was accessed/exposed?
   - Which user accounts, orgs, or clients are affected?
   - Was the access authorized under HIPAA treatment/payment/operations?
   - Is the vulnerability still present?
4. Remove the root cause (patch code, revoke credential, fix misconfiguration).
5. Deploy the fix to production.

### Phase 4 — PHI Breach Assessment (P1/P2 only)

Legal/Compliance conducts a formal breach assessment:

1. Apply the HIPAA Breach Risk Assessment four-factor test:
   - Nature and extent of PHI involved (identifiability, sensitivity)
   - Who used the PHI / to whom it was disclosed
   - Whether the PHI was actually acquired or viewed
   - Extent to which risk has been mitigated
2. If risk of harm is **not low** → notification required.

**Notification deadlines:**
| Recipient | Deadline |
|---|---|
| Affected covered entity customers (via BAA) | Without unreasonable delay; ≤ 60 days of discovery |
| HHS Office for Civil Rights | ≤ 60 days (< 500 individuals); annual report otherwise |
| HHS OCR (≥ 500 individuals in a state) | ≤ 60 days + prominent media notice |
| Affected individuals (if required by covered entity) | Per customer's direction |

### Phase 5 — Recovery

1. Verify the vulnerability is fully remediated before restoring full service.
2. Monitor for 48 hours post-recovery for recurrence.
3. Update relevant rate-limit, DLP, or ACLX rules if the incident revealed a gap.
4. Clear incident channel to #incident-resolved and notify affected customers.

### Phase 6 — Post-Incident Review (≤ 5 business days after resolution)

Hold a blameless post-mortem with:
- Timeline of events
- Root cause analysis (5 Whys or similar)
- What worked well in the response
- What could be improved
- Action items with owners and due dates

Publish the internal post-mortem to the #security-incidents archive.  A
sanitized summary may be shared with affected customers on request.

---

## 5. Evidence Preservation Checklist

Before making any changes to affected systems:

- [ ] Export Firestore audit log entries for the affected time window
- [ ] Download Cloud Run request logs for the affected time window
- [ ] Note all IAM role memberships for involved service accounts
- [ ] Screenshot any anomalous dashboard states
- [ ] Record the git commit SHA of the code running at time of incident

---

## 6. Contact Directory

> **Keep this list current.** Update on every personnel change.

| Role | Name | Primary contact | Backup contact |
|---|---|---|---|
| Incident Commander | Chris Hunt | _primary_ | _backup_ |
| Security Lead | _TBD_ | | |
| Engineering On-Call | _Rotation_ | PagerDuty | |
| Legal / Compliance | _Counsel_ | | |
| Google Cloud Support | — | Cloud Console → Support | Priority support ticket |

---

## 7. Plan Review

This plan is tested **annually** via tabletop exercise and updated after any
significant incident or regulatory change.

| Review date | Reviewer | Notes |
|---|---|---|
| 2026-06-14 | Initial | |
