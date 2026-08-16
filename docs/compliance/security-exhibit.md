# Security Exhibit — Technical and Organizational Measures (TOMs)

**myABA.ai** — operated by ACLX LLC, d/b/a myABA.ai

This Security Exhibit describes the technical and organizational measures ("TOMs")
myABA maintains to protect Customer Content and Customer Personal Data. When
attached to a Data Processing Addendum (DPA), Business Associate Agreement (BAA),
or Master Services Agreement (MSA), it is incorporated into that agreement.

These measures are **control-based and durable**. myABA may update them from time
to time, provided the changes do not materially reduce the overall level of
security described here. The measures below describe controls and practices, not
uptime or response-time service levels; any service-level commitments are stated
only in an executed Order or MSA.

*This document is confidential and is provided to customers and prospective
customers under the confidentiality terms of the applicable agreement or NDA.*

---

## 1. Information Security Program & Governance

- myABA maintains a written information security program appropriate to the
  sensitivity of Protected Health Information (PHI) and other personal data it
  processes, and to the size and complexity of its operations.
- Security responsibilities are assigned to accountable personnel. Policies are
  reviewed periodically and after material changes to the Service or threat
  landscape.
- The program is designed to meet the HIPAA Security Rule safeguards
  (administrative, physical, and technical) and to align with recognized security
  frameworks.

## 2. Access Control & Authentication

- **Least privilege.** Access to customer data is limited to personnel and
  services that require it to operate, support, or secure the Service.
- **Role-based access control (RBAC).** Within the Service, customer
  administrators assign roles; access to client records is further constrained by
  caseload assignment and project membership (per-record authorization), not role
  alone.
- **Multi-factor authentication (MFA).** MFA is mandatory for user accounts and
  cannot be disabled by users. Enterprise customers may federate identity using
  SAML 2.0 or OIDC single sign-on.
- **Session management.** Sessions are time-limited; authentication is provided
  through Google Firebase Authentication.
- **Administrative access** to production systems is restricted, authenticated,
  and logged.

## 3. Encryption & Key Management

- **In transit:** all data is encrypted using TLS.
- **At rest:** data is encrypted using the cloud platform's encryption
  (AES-256, provider-managed keys). Customer-managed encryption keys (CMEK) are
  supported for enterprise arrangements.
- Key management for platform-managed encryption is performed by the underlying
  cloud provider under its key-management controls.

## 4. Tenant Separation (Multi-Tenancy)

- Customer data is logically isolated per organization. Every stored object is
  partitioned under an organization-scoped path, and **every read, write, and
  signed-URL operation asserts that the object falls within the caller's own
  organization prefix**, so a request built for the wrong tenant fails rather than
  crossing boundaries.
- The database's client-facing security rules deny all direct access; all data
  access is mediated by the backend, which enforces organization-scope and
  authorization checks on every request.

## 5. Audit Logging & Monitoring

- The Service records an audit trail of security-relevant events, including AI
  requests, document generation, governance decisions, and legal-terms acceptance,
  with organization, actor, and timestamp.
- Audit and compliance logs are retained for seven (7) years, separate from
  operational application logs.
- **Application (operational) logs are designed to exclude PHI**: they record
  pseudonymous identifiers (organization, user, and record IDs) and event codes,
  not client names, dates of birth, diagnoses, document content, or matched
  sensitive values. Any sensitive values captured by content-safety guards are
  excluded from application logs.
- Infrastructure and application telemetry is monitored for errors and anomalous
  conditions, with alerting on defined security and availability conditions.

## 6. AI Content Governance & Data-Loss Prevention

- **Input scanning (DLP).** User input is scanned before it reaches the AI, and
  non-clinical identifiers with no place in a clinical prompt (for example, Social
  Security numbers and payment card numbers) are blocked.
- **Output governance (ACLX).** Every AI response and generated document is scored
  and classified before delivery. Specially protected categories (for example,
  substance-use-disorder records, psychotherapy notes, HIV status, and genetic
  information) are subject to hard-block rules; responses that meet a review
  threshold are held for administrator approval. Governance events are recorded in
  the audit log.
- **Guarded external egress.** External lookups (for example, directory or web
  research features) transmit only guarded, PHI-free queries.
- Customer Content and PHI are **not** used to train, fine-tune, or improve any
  AI or machine-learning model, whether operated by myABA or a third party.

## 7. Secure Development

- Source code is version-controlled, and changes are reviewed before release.
- Dependencies are scanned for known vulnerabilities as part of the build
  pipeline; builds fail on high-severity (CVSS ≥ 7.0) findings absent a documented,
  time-bounded exception.
- Services run under least-privilege service accounts; secrets are stored in a
  managed secret store, not in source code.
- Separate configuration is maintained for development and production.

## 8. Vulnerability & Patch Management

- Platform and dependency vulnerabilities are identified through automated
  scanning and provider advisories, and are remediated on a risk-prioritized basis,
  with higher-severity issues addressed on a more expedited schedule.
- Underlying infrastructure (compute, database, storage, authentication) is
  provider-managed and patched by the cloud provider.

## 9. Incident Response & Breach Notification

- myABA maintains an incident-response process covering detection, triage,
  containment, investigation, remediation, and post-incident review.
- On confirming a breach of unsecured PHI or a reportable security incident
  affecting Customer data, myABA notifies affected customers without undue delay
  and within the timeframes required by the applicable BAA and law, and provides
  information reasonably available to assist the customer's response.
- myABA distinguishes reportable breaches from unsuccessful security incidents
  (for example, blocked attacks, port scans, and failed logins), consistent with
  the definitions in the applicable agreement.

## 10. Backup, Business Continuity & Disaster Recovery

- Customer data is hosted on Google Cloud regional services that replicate across
  multiple zones for resilience.
- The database is backed up on a scheduled basis; backups are retained for up to
  ninety (90) days and are used only for recovery, continuity, and security
  purposes.
- Recovery procedures allow restoration of the Service and data from backups in
  the event of a disruption.

## 11. Data Retention & Deletion

- Customer Content is retained while the account is active or for a
  customer-configured retention window; audit/compliance logs are retained for
  seven (7) years.
- On termination, data is available for export for thirty (30) days before
  deletion.
- After deletion, residual copies in backups are deleted or overwritten no later
  than **ninety (90) days**; deleted objects in file storage are subject to a
  short (approximately 7-day) soft-delete window. Legal holds override deletion.

## 12. Personnel Security

- Personnel with access to customer data are bound by written confidentiality
  obligations.
- Access is provisioned on a least-privilege basis and revoked promptly on role
  change or separation.
- Personnel receive security and privacy guidance appropriate to their role.

## 13. Vendor & Subprocessor Management

- Subprocessors that process customer data are subject to written data-protection
  obligations no less protective than those in the applicable DPA, and, where PHI
  is involved, a Business Associate Agreement.
- A current subprocessor list is maintained and available to customers, and
  material changes are communicated as described in the DPA.
- For PHI, myABA uses only cloud services covered by, and configured within the
  scope of, its Google Cloud BAA.

## 14. Physical & Infrastructure Security

- The Service runs entirely on Google Cloud infrastructure. Physical and
  environmental security of the underlying data centers is provided by Google
  under its infrastructure-security and independent-audit programs (for example,
  SOC 2 / ISO 27001 for the platform). myABA does not operate its own data centers.

## 15. Assurance & Evidence

- myABA can make available, subject to confidentiality, evidence of its controls,
  including audit-log records, dependency-scan results, and configuration
  attestations.
- A SOC 2 examination is in progress; the report will be made available under NDA
  when complete.
- myABA reasonably cooperates with customer security assessments as provided in
  the applicable DPA or MSA, subject to reasonable scope, notice, and
  confidentiality.

---

*Questions regarding this Security Exhibit: compliance@myaba.ai.*
