# Data Retention Policy
**myABA.ai** | Version 1.0 | Classification: Internal

---

## 1. Purpose

This policy defines how long myABA.ai retains different categories of data and
how data is securely disposed of when it is no longer needed.

Maintaining documented retention periods is required by HIPAA (§164.316(b)(2)),
proposed 2025 HIPAA Security Rule updates (documentation retention ≥ 6 years),
and SOC 2 Common Criteria CC6.5 (disposal of assets).

---

## 2. Retention Schedule

### 2.1 Audit Logs

| Field | Value |
|---|---|
| **Retention period** | 7 years (2,555 days) |
| **Storage location** | Firestore collection: `auditLog` |
| **Enforcement** | Automated nightly purge via `DataRetentionService` (runs at 02:15 UTC) |
| **Regulatory basis** | HIPAA §164.316(b)(2): 6-year minimum; we retain 7 years to provide a compliance buffer |

Audit logs capture: event type, user ID, organization ID, client ID, source IP,
request correlation ID, AI decision, ACLX governance outcome, and timestamp.

### 2.2 AI-Generated Documents

| Field | Value |
|---|---|
| **Retention period** | Duration of customer contract + 1 year |
| **Storage location** | Firestore collection: `documents` (per-org sub-collection) |
| **Enforcement** | Manual process on contract termination; automated tooling planned |
| **Notes** | Customers retain ownership of generated documents; myABA.ai acts as data processor |

### 2.3 Chat Histories

| Field | Value |
|---|---|
| **Retention period** | 90 days of inactivity (configurable per organization) |
| **Storage location** | Firestore collection: `chats` |
| **Enforcement** | Automated purge (planned — tracked in backlog) |

### 2.4 EHR Integration Credentials

| Field | Value |
|---|---|
| **Retention period** | Duration of EHR integration + 30 days |
| **Storage location** | Firestore, encrypted (AES-256-GCM) |
| **Enforcement** | Deleted when customer disconnects integration; 30-day grace period for reconnection |

### 2.5 Employee and Contractor Data

| Field | Value |
|---|---|
| **Retention period** | Duration of employment/engagement + 7 years |
| **Storage location** | HR system (external to myABA.ai platform) |
| **Enforcement** | HR off-boarding checklist |

### 2.6 Application / Server Logs (Cloud Run)

| Field | Value |
|---|---|
| **Retention period** | 30 days |
| **Storage location** | Google Cloud Logging |
| **Enforcement** | Cloud Logging default retention; configured at project level |

---

## 3. Secure Disposal

| Data type | Disposal method |
|---|---|
| Firestore documents | Hard delete via Firebase Admin SDK; Firestore does not retain soft-deleted documents after 7 days |
| EHR credentials | Firestore document deletion; encryption key material is rotated (old key cannot decrypt deleted data) |
| Employee data | HR system deletion per HR policy |
| Uploaded files (OfficePuzzle import) | Processed in memory only; never persisted to disk or object storage |
| Cloud Run container images | Deleted from Artifact Registry after 90 days; latest 3 versions retained for rollback |

---

## 4. Customer Data Deletion Requests

### 4.1 On contract termination
Within 30 days of contract end, myABA.ai will:
1. Delete all customer organization data (documents, clients, chats, templates).
2. Delete EHR credentials.
3. Retain audit logs for the remainder of the 7-year retention period
   (required for regulatory compliance — not subject to early deletion).
4. Provide written confirmation of deletion.

### 4.2 During contract (specific record deletion)
Customers may request deletion of specific client records or documents at any
time by contacting support.  myABA.ai will confirm deletion within 5 business
days.

---

## 5. Retention Exceptions

Retention periods may be extended when:
- Records are subject to a litigation hold
- A regulatory investigation is in progress
- A law enforcement request requires preservation

The Security Lead and Legal must approve any hold and document it with an
expiration date or termination condition.

---

## 6. Enforcement and Monitoring

`DataRetentionService` runs daily at 02:15 UTC and logs:
- Number of audit log records purged
- Any errors encountered during purge

The purge is logged to the application log (searchable in Cloud Logging) and
can be verified by running:

```
SELECT COUNT(*) FROM auditLog WHERE timestampMs < <cutoff_epoch_ms>
```
(Firestore equivalent: query `auditLog` where `timestampMs < cutoff`.)

---

## 7. Policy Review

This policy is reviewed **annually** or when regulatory requirements change.

| Review date | Reviewer | Notes |
|---|---|---|
| 2026-06-14 | Initial | |
