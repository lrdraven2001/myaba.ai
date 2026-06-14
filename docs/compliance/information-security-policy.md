# Information Security Policy
**myABA.ai** | Version 1.0 | Classification: Internal

---

## 1. Purpose

This Information Security Policy establishes the security requirements that
govern how myABA.ai protects the confidentiality, integrity, and availability
of information assets — including Protected Health Information (PHI) processed
on behalf of covered entity customers.

This policy supports myABA.ai's HIPAA Business Associate obligations and
provides the documented security framework required for SOC 2 Type II
certification.

---

## 2. Scope

This policy applies to:

- All myABA.ai employees, contractors, and vendors with access to production
  systems or customer data
- All systems that store, process, or transmit PHI or confidential business
  information
- All environments: production, staging, and development

---

## 3. Information Classification

| Class | Definition | Examples |
|---|---|---|
| **PHI / Restricted** | Protected Health Information; any data covered by HIPAA | Client names, diagnoses, session notes, DOBs |
| **Confidential** | Business-sensitive; not public | API keys, credentials, financial data, employee data |
| **Internal** | General internal information | Architecture docs, runbooks, policies |
| **Public** | Approved for public release | Marketing content, open-source code |

---

## 4. Access Control

### 4.1 Least privilege
Every system account and employee role is granted only the permissions
required to perform its defined function.  Permissions are not granted by
default — they must be explicitly authorized.

### 4.2 Multi-factor authentication (MFA)
MFA is **mandatory** for all access to:
- Production systems and cloud infrastructure
- myABA.ai application accounts (enforced at the platform level; cannot be
  disabled by end users or organization administrators)
- Code repositories and CI/CD systems

### 4.3 Access reviews
- Production IAM roles are reviewed **quarterly** by the Engineering lead.
- Employee access is reviewed on role change and within 24 hours of
  termination (off-boarding checklist triggers revocation).

### 4.4 Service accounts
Service accounts are non-personal, single-purpose, and granted the minimum
IAM roles needed.  Credentials are rotated at least annually and stored in
Google Secret Manager — never in code or configuration files.

---

## 5. Cryptography

| Data state | Requirement |
|---|---|
| Data in transit | TLS 1.2 minimum; TLS 1.3 preferred.  HSTS enforced with 1-year max-age. |
| Data at rest (EHR credentials) | AES-256-GCM; key stored in environment variable, not in code |
| Data at rest (Firestore) | Google-managed AES-256 encryption (default) |
| Secrets | Stored in Google Secret Manager; never committed to source control |

---

## 6. Vulnerability Management

### 6.1 Dependency scanning
Every build runs OWASP Dependency-Check against all Maven dependencies.
The build fails if any dependency has a CVSS score ≥ 7.0 (High or Critical)
without an approved suppression entry.

### 6.2 Patch management
| Severity | Maximum time to patch after disclosure |
|---|---|
| Critical (CVSS ≥ 9.0) | 7 days |
| High (CVSS 7.0–8.9) | 30 days |
| Medium (CVSS 4.0–6.9) | 90 days |
| Low (CVSS < 4.0) | Next release cycle |

### 6.3 Penetration testing
An independent penetration test is conducted **annually** (or after any
significant architectural change) by a qualified third-party firm.  Findings
are tracked to remediation.

---

## 7. Logging and Monitoring

### 7.1 Audit logging
Every AI call, document generation, ACLX governance decision, and review
queue action is logged to Firestore with:
- Event type
- User ID and organization
- Client ID (where applicable)
- Source IP and request correlation ID
- Timestamp (ISO-8601) and epoch milliseconds

### 7.2 Log retention
Audit logs are retained for **7 years** (2,555 days) — exceeding the
HIPAA minimum of 6 years and aligned with the proposed 2025 HIPAA Security
Rule updates.  Automated nightly purge removes records beyond the retention
window.

### 7.3 Alerting
Production anomalies (error rate spikes, rate-limit floods, ACLX hard-block
volume increases) are surfaced via Cloud Monitoring alerts to on-call
engineering.

---

## 8. Data Retention and Disposal

| Data type | Retention period | Disposal method |
|---|---|---|
| Audit logs | 7 years | Automated nightly purge (DataRetentionService) |
| AI-generated documents | Duration of customer contract + 1 year | Customer-initiated or contract-end deletion |
| EHR credentials | Duration of integration + 30 days | Firestore document deletion + key zeroization |
| Employee data | Duration of employment + 7 years | HR system deletion |

---

## 9. Physical and Environmental Security

myABA.ai is a cloud-native application with no on-premises infrastructure.
Physical security obligations are inherited from Google Cloud Platform, which
maintains ISO 27001, SOC 2, and FedRAMP certifications for its data centers.

---

## 10. Incident Response

See the [Incident Response Plan](incident-response-plan.md).

---

## 11. Vendor Risk Management

See the [Vendor Risk Register](vendor-risk-register.md).

---

## 12. Policy Exceptions

Exceptions to this policy require written approval from the Security Lead
and must document:
- The specific control being excepted
- The business justification
- Compensating controls in place
- Exception expiration date (maximum 90 days; renewable with re-approval)

---

## 13. Policy Review

This policy is reviewed **annually** or after a significant security incident
or regulatory change.  The Security Lead owns this document.

| Review date | Reviewer | Version |
|---|---|---|
| 2026-06-14 | Initial | 1.0 |
