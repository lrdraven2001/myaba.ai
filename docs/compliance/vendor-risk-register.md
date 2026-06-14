# Vendor Risk Register
**myABA.ai** | Version 1.0 | Classification: Internal

---

## Purpose

This register documents all third-party vendors that process, store, or
transmit Protected Health Information (PHI) or that could materially impact
the security of myABA.ai systems.  Maintaining this register is required by
HIPAA (§164.308(b)) and SOC 2 Common Criteria CC9.2.

---

## Review cadence

- Full register reviewed **annually** by the Security Lead.
- New vendors assessed **before** granting access to PHI.
- Existing vendor compliance status checked on each contract renewal.

---

## Register

### 1. Google Cloud Platform (Firebase + Firestore + Cloud Run)

| Field | Value |
|---|---|
| **Service** | Firebase Authentication, Firestore (database), Cloud Run (container hosting) |
| **Data processed** | PHI (Firestore — client records, audit logs, documents), credentials, org config |
| **Risk tier** | Critical |
| **BAA in place** | Yes — Google Cloud HIPAA BAA |
| **Certifications** | ISO 27001, SOC 2 Type II, FedRAMP High, HIPAA |
| **Data residency** | us-central1 (Iowa) by default; confirm per deployment |
| **Last reviewed** | 2026-06-14 |
| **Notes** | Claude AI also runs on Google Cloud (Vertex AI); covered under same BAA |

### 2. Anthropic (Claude AI via Google Vertex AI)

| Field | Value |
|---|---|
| **Service** | Claude large language model for clinical documentation generation |
| **Data processed** | Clinical prompts containing PHI (sent to model for inference) |
| **Risk tier** | Critical |
| **BAA in place** | Covered under Google Cloud HIPAA BAA (Vertex AI-hosted Claude) |
| **Data training** | Google's enterprise data processing terms prohibit use of customer data for model training |
| **Certifications** | Via Google Cloud: ISO 27001, SOC 2 Type II |
| **Last reviewed** | 2026-06-14 |
| **Notes** | Confirm model version and data terms on each contract renewal |

### 3. CentralReach (EHR Integration)

| Field | Value |
|---|---|
| **Service** | ABA practice management / EHR; API-based client record sync |
| **Data processed** | Client demographic and authorization data (fetched by myABA.ai; not sent to CentralReach) |
| **Risk tier** | High |
| **BAA in place** | Customer's BAA with CentralReach; myABA.ai acts as their BA |
| **Certifications** | HIPAA-compliant (verify current status with CentralReach) |
| **Last reviewed** | 2026-06-14 |
| **Notes** | Credentials stored encrypted (AES-256-GCM) in Firestore; rotated on customer request |

### 4. Rethink (EHR Integration)

| Field | Value |
|---|---|
| **Service** | ABA practice management / EHR; API-based client record sync |
| **Data processed** | Client demographic and authorization data |
| **Risk tier** | High |
| **BAA in place** | Customer's BAA with Rethink; myABA.ai acts as their BA |
| **Certifications** | HIPAA-compliant (verify current status with Rethink) |
| **Last reviewed** | 2026-06-14 |
| **Notes** | Same credential storage pattern as CentralReach |

### 5. OfficePuzzle (File Import)

| Field | Value |
|---|---|
| **Service** | ABA practice management; Excel/CSV file-based client roster import |
| **Data processed** | Client demographic data (uploaded file processed in-memory; not transmitted to OfficePuzzle) |
| **Risk tier** | Low — file import only; no live API connection |
| **BAA in place** | Not required — no data is sent to OfficePuzzle by myABA.ai |
| **Last reviewed** | 2026-06-14 |
| **Notes** | Files processed in memory on the backend; not persisted to disk |

---

## Adding a new vendor

Before onboarding any vendor that will access PHI or critical systems:

1. Complete the Vendor Security Questionnaire (template in `docs/compliance/vendor-questionnaire-template.md`).
2. Confirm BAA execution if the vendor will process PHI.
3. Obtain copies of the vendor's SOC 2 report (or equivalent) and confirm scope covers the services used.
4. Add the vendor to this register with risk tier and review date.
5. Get Security Lead sign-off.

---

## Risk tier definitions

| Tier | Definition |
|---|---|
| **Critical** | Processes or stores PHI, or failure would take down production |
| **High** | Accesses PHI or has privileged access to production systems |
| **Medium** | Accesses internal data but not PHI; material integration dependency |
| **Low** | No access to PHI or production systems; easily replaceable |
