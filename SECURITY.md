# Security Policy — myABA.ai

## Reporting a Vulnerability

If you discover a security vulnerability in myABA.ai, please report it
**privately** to our security team before public disclosure.

**Do not open a public GitHub issue for security vulnerabilities.**

### How to report

| Channel | Address |
|---|---|
| Email | security@myaba.ai |
| PGP fingerprint | _key published at https://myaba.ai/.well-known/security.txt_ |

We ask that you:

1. Describe the vulnerability and the steps to reproduce it.
2. Include the potential impact (e.g. data exposure, authentication bypass).
3. Provide a contact method so we can follow up with questions.

### Response commitments

| Milestone | Target |
|---|---|
| Acknowledgement | Within 2 business days |
| Initial assessment (CVSS score, severity) | Within 5 business days |
| Remediation plan communicated to reporter | Within 10 business days |
| Patch for Critical/High (CVSS ≥ 7.0) | Within 30 days of acknowledgement |
| Patch for Medium (CVSS 4.0–6.9) | Within 60 days of acknowledgement |
| Patch for Low (CVSS < 4.0) | Next planned release cycle |

We will coordinate public disclosure timing with you.  We commit to crediting
reporters who wish to be acknowledged.

---

## Scope

The following are **in scope** for responsible disclosure:

- `app.myaba.ai` — frontend application
- `api.myaba.ai` — backend REST API
- Firebase Authentication configuration
- ACLX content governance gateway
- Any subdomain under `myaba.ai`

The following are **out of scope**:

- Third-party services (Firebase, Google Cloud, Anthropic/Claude, Firestore)
  — report those directly to their respective vendors
- Social engineering or phishing attacks against myABA.ai employees
- Physical attacks against infrastructure
- Denial-of-service attacks

---

## Security controls overview

myABA.ai is built for HIPAA-covered healthcare organizations.  Key controls:

| Control | Implementation |
|---|---|
| Authentication | Firebase Authentication; MFA mandatory for all users |
| Authorization | Role-based (ORG_SUPER_ADMIN, TREATING_BCBA, RBT, etc.) with per-request enforcement |
| Transport security | TLS 1.3; HSTS with 1-year max-age and preload |
| Encryption at rest | AES-256 (EHR credentials); Google-managed encryption (Firestore) |
| Input governance | DLP scanning blocks SSNs, payment cards, driver's licenses before AI processing |
| Output governance | ACLX content engine scores every AI response; hard-block rules for §2 and specialty PHI |
| Audit logging | Every AI call, document generation, and review decision logged with user, IP, and correlation ID |
| Rate limiting | Per-IP (200 req/min) and per-user (60 req/min) token-bucket throttling |
| Dependency scanning | OWASP Dependency-Check on every build; blocks on CVSS ≥ 7.0 |
| Data retention | Audit logs retained 7 years; automated nightly purge of expired records |

---

## Compliance

- **HIPAA** — BAA required before access; PHI handling reviewed against HIPAA §164.312
- **SOC 2 Type II** — audit in progress
- **HIPAA Security Rule (proposed 2025 updates)** — controls align with proposed mandatory specifications

For compliance inquiries, contact compliance@myaba.ai.
