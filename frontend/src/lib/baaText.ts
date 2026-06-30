/**
 * MyABA.ai Business Associate Agreement — version 1.1
 *
 * Shared between OnboardingView (sign during setup) and SettingsView (self-service sign).
 * When the BAA version changes, update the text here and bump BAA_VERSION.
 *
 * NOTE: This document is a pre-release draft for internal review. It must be
 * reviewed and approved by qualified legal counsel before use with external agencies.
 */

export const BAA_VERSION = '1.1';

export const BAA_TEXT = `BUSINESS ASSOCIATE AGREEMENT
myABA.ai — Version 1.1

This Business Associate Agreement ("BAA" or "Agreement") is entered into as of the date of electronic acceptance ("Effective Date") by and between the organization identified at acceptance ("Covered Entity") and MyABA.ai, LLC, a subsidiary of ACLX, Inc. ("Business Associate"). This Agreement is incorporated into and supplements the MyABA.ai Terms of Service.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECITALS

WHEREAS, Business Associate provides an AI-powered clinical documentation platform (the "Platform") designed specifically for Applied Behavior Analysis ("ABA") therapy practices, including behavioral therapists, Board Certified Behavior Analysts ("BCBAs"), Registered Behavior Technicians ("RBTs"), and ABA therapy agencies;

WHEREAS, in the course of providing the Platform, Business Associate may create, receive, maintain, or transmit Protected Health Information on behalf of Covered Entity;

WHEREAS, the parties desire to protect the privacy and provide for the security of PHI in compliance with the Health Insurance Portability and Accountability Act of 1996 ("HIPAA"), the Health Information Technology for Economic and Clinical Health Act of 2009 ("HITECH"), and their implementing regulations at 45 C.F.R. Parts 160 and 164 (collectively, "HIPAA Rules");

NOW, THEREFORE, in consideration of the mutual promises and covenants set forth herein, the parties agree as follows:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 1 — DEFINITIONS

1.1  Statutory Definitions. Terms used but not otherwise defined herein shall have the same meaning as those terms in 45 C.F.R. §§ 160.103 and 164.501.

1.2  Platform. "Platform" means the myABA.ai clinical documentation and AI-assistance software-as-a-service system, including all components described in Section 2.2.

1.3  Protected Health Information (PHI). "PHI" means any individually identifiable health information, in any form or medium, that Business Associate creates, receives, maintains, or transmits on behalf of Covered Entity in connection with the Platform. PHI includes, but is not limited to:
  (a) ABA session notes and session data;
  (b) Behavior Intervention Plans ("BIPs") and Functional Behavior Assessments ("FBAs");
  (c) Client demographic and enrollment records;
  (d) Assessment results, progress reports, and clinical correspondence;
  (e) Billing records and insurance/payer information linked to an identifiable individual;
  (f) Any of the 18 identifiers enumerated at 45 C.F.R. § 164.514(b)(2).

1.4  Electronic PHI (ePHI). "ePHI" means PHI that is created, received, maintained, or transmitted in electronic form.

1.5  AI Processing. "AI Processing" means the use of large language model services to generate, summarize, or analyze clinical documentation content on behalf of Covered Entity users.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 2 — DESCRIPTION OF SERVICES AND PHI FLOWS

2.1  Nature of Business Associate Relationship. Covered Entity engages Business Associate to provide clinical documentation support services, including AI-assisted generation of ABA therapy documentation, which necessarily requires Business Associate to access and process PHI on Covered Entity's behalf.

2.2  Platform Components. The Platform consists of the following components that may process PHI:

  (a) Web Application. A React-based single-page application accessed via web browser, through which authorized Covered Entity personnel create, review, and manage clinical documentation.

  (b) API Backend. A Java/Spring Boot backend service that orchestrates PHI access, applies role-based access controls, and routes AI Processing requests.

  (c) Document Storage. PHI and clinical documents are stored in Google Cloud Firestore, a managed NoSQL database service operated by Google LLC under Google's HIPAA Business Associate Agreement with Business Associate. Firestore data is encrypted at rest (AES-256) and in transit (TLS 1.2+). Each Covered Entity's data is logically isolated by a unique organization identifier.

  (d) AI Processing Pipeline. When a user requests AI-assisted documentation generation, the request (including relevant PHI context) is transmitted to Google Cloud Vertex AI, which hosts Google's Gemini large language model. This transmission occurs within Google Cloud infrastructure under Google's HIPAA BAA, which covers Vertex AI. No third-party AI vendor receives PHI; all AI calls flow exclusively through Google Cloud Vertex AI.

  (e) Output Governance Layer (ACLX). All AI-generated content is evaluated by the ACLX output governance system (also operated by Business Associate) prior to delivery to the end user. ACLX analyzes AI output for potential PHI exposure, HIPAA compliance risks, and clinical accuracy indicators, and may redact, block, or escalate content for human review.

  (f) Authentication. User identity and access control are managed via Google Firebase Authentication, operated under Google's HIPAA BAA. Role-based access controls (BCBA, RBT, Supervising BCBA, Billing Admin, Org Admin, etc.) are enforced at both the application and database layers.

  (g) Audit Logging. Access to PHI and AI processing events are logged for audit purposes. Logs may be stored in Google Cloud and are retained for a minimum of six (6) years.

2.3  PHI the Platform Does Not Process. The Platform does not process psychotherapy notes as defined at 45 C.F.R. § 164.501 unless Covered Entity explicitly stores such notes in Platform document fields. The Platform does not currently process genetic information or substance use disorder records covered by 42 C.F.R. Part 2 unless Covered Entity expressly uploads such records.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 3 — PERMITTED USES AND DISCLOSURES

3.1  Permitted Uses. Business Associate may use PHI only as necessary to:
  (a) Provide the Platform services described in Section 2.2 on behalf of Covered Entity;
  (b) Properly manage and administer its internal operations, to the extent permitted under 45 C.F.R. § 164.504(e)(4);
  (c) Carry out its legal responsibilities; and
  (d) Perform data aggregation services relating to the health care operations of Covered Entity, as permitted under 45 C.F.R. § 164.504(e)(2)(i)(B).

3.2  Prohibited Uses. Business Associate shall not:
  (a) Use or disclose PHI in any manner that would violate Subpart E of 45 C.F.R. Part 164;
  (b) Use PHI to train or fine-tune AI/ML models without explicit written authorization from Covered Entity;
  (c) Sell PHI or use PHI for marketing purposes without individual authorization;
  (d) Use PHI for any purpose not expressly permitted by this BAA or required by law.

3.3  Minimum Necessary. Business Associate shall make reasonable efforts to use, disclose, and request only the minimum amount of PHI necessary to accomplish the intended purpose of the use, disclosure, or request, consistent with 45 C.F.R. § 164.514(d).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 4 — OBLIGATIONS OF BUSINESS ASSOCIATE

4.1  Privacy Safeguards. Business Associate agrees to:
  (a) Not use or further disclose PHI other than as permitted or required by this BAA or as required by law;
  (b) Use appropriate administrative, physical, and technical safeguards, and comply with Subpart C of 45 C.F.R. Part 164 (Security Rule) with respect to ePHI;
  (c) Mitigate, to the extent practicable, any harmful effect that is known to Business Associate arising from a use or disclosure of PHI in violation of this BAA.

4.2  Security Safeguards. Business Associate shall implement and maintain the following controls:
  (a) Administrative Safeguards: security management process, workforce training, access management policies, and contingency planning;
  (b) Physical Safeguards: facility access controls and workstation policies (delegated in part to Google Cloud under their BAA);
  (c) Technical Safeguards: unique user identification, automatic logoff, encryption of ePHI in transit and at rest, audit controls, and integrity controls.

4.3  Breach Notification. Business Associate shall:
  (a) Report to Covered Entity any Security Incident of which it becomes aware, without unreasonable delay;
  (b) Provide written notice of any Breach of Unsecured PHI without unreasonable delay and in no case later than sixty (60) calendar days after discovery of the Breach, as required by 45 C.F.R. § 164.410;
  (c) Include in such notice: (i) identification of each Individual whose PHI was or is reasonably believed to have been involved; (ii) a description of what happened; (iii) the types of PHI involved; (iv) steps Individuals should take to protect themselves; (v) a description of what Business Associate is doing to investigate, mitigate, and prevent future occurrences; and (vi) contact information.

4.4  Individual Rights. Business Associate agrees to:
  (a) Make available PHI in a Designated Record Set upon Covered Entity's request to satisfy obligations under 45 C.F.R. §§ 164.524 (access), 164.526 (amendment), and 164.528 (accounting of disclosures);
  (b) Incorporate any amendments to PHI in a Designated Record Set directed by Covered Entity under 45 C.F.R. § 164.526;
  (c) Make available information required to provide an accounting of disclosures as required by 45 C.F.R. § 164.528.

4.5  Subcontractors. Business Associate shall ensure that any subcontractor that creates, receives, maintains, or transmits PHI on behalf of Business Associate agrees to restrictions and conditions at least as stringent as those that apply to Business Associate under this BAA. Authorized subcontractors and sub-processors include the following (each subject to a HIPAA BAA with Business Associate):

  SUBPROCESSOR          | SERVICE                          | LOCATION
  ──────────────────────|──────────────────────────────────|─────────────────
  Google LLC            | Firebase Auth, Firestore,        | United States
                        | Vertex AI (Gemini model hosting),|
                        | Cloud Run (API hosting),         |
                        | Cloud Logging (audit logs)       |

4.6  HHS Access. Business Associate shall make its internal practices, books, and records relating to the use and disclosure of PHI available to the Secretary of HHS for purposes of determining compliance with HIPAA Rules.

4.7  BACB Standards. Business Associate acknowledges that Covered Entity's personnel may be subject to the Behavior Analyst Certification Board ("BACB") Ethics Code, and Business Associate shall not cause or facilitate any action that would require Covered Entity's personnel to violate BACB documentation standards applicable to ABA therapy records.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 5 — OBLIGATIONS OF COVERED ENTITY

5.1  Covered Entity agrees to:
  (a) Notify Business Associate of any limitation(s) in Covered Entity's Notice of Privacy Practices that may affect Business Associate's use or disclosure of PHI;
  (b) Notify Business Associate of any changes in, or revocation of, permission by an Individual to use or disclose PHI, to the extent that such changes may affect Business Associate's permitted or required uses and disclosures;
  (c) Not request Business Associate to use or disclose PHI in any manner that would not be permissible under HIPAA if done by Covered Entity;
  (d) Obtain any required authorizations or consents before submitting PHI to the Platform;
  (e) Ensure that all Covered Entity personnel who access the Platform are authorized users and are trained on the Platform's appropriate use for HIPAA-compliant clinical documentation;
  (f) Not upload substance use disorder treatment records governed by 42 C.F.R. Part 2 unless separately authorized.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 6 — TERM AND TERMINATION

6.1  Term. This BAA is effective upon electronic acceptance and remains in effect as long as Business Associate creates, receives, maintains, or transmits PHI on behalf of Covered Entity.

6.2  Termination for Cause. Either party may terminate this BAA upon thirty (30) days' written notice if the other party is in material breach of a provision of this BAA and has not cured such breach within the notice period. Covered Entity may terminate immediately if Business Associate has breached a material term and cure is not possible.

6.3  Effect of Termination. Upon termination of this BAA for any reason:
  (a) Business Associate shall, within ninety (90) days of termination, return to Covered Entity or destroy all PHI received from, or created or received on behalf of, Covered Entity that Business Associate maintains in any form;
  (b) If return or destruction is not feasible, Business Associate shall retain the protections of this BAA with respect to such PHI and limit further uses and disclosures to those purposes that make return or destruction infeasible, for as long as Business Associate maintains such PHI;
  (c) Covered Entity shall be responsible for exporting any clinical data needed prior to account deactivation.

6.4  Survival. Sections 4.3 (breach notification obligations for pre-termination incidents), 4.4 (individual rights), 4.6 (HHS access), and 6.3 (effect of termination) survive termination of this BAA.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 7 — GENERAL PROVISIONS

7.1  Interpretation. This BAA shall be interpreted as broadly as necessary to implement and comply with HIPAA, HITECH, and applicable state privacy laws. Any ambiguity shall be resolved in favor of a meaning that permits compliance with applicable law.

7.2  Severability. If any provision of this BAA is found to be invalid, illegal, or unenforceable, the remaining provisions shall remain in full force and effect.

7.3  Amendment. Business Associate may amend this BAA from time to time to comply with changes in applicable law. Business Associate will provide at least thirty (30) days' advance notice of material amendments. Continued use of the Platform after the notice period constitutes acceptance of the amended BAA.

7.4  Governing Law. This BAA is governed by applicable federal law, including HIPAA and HITECH. To the extent state law applies, this BAA is governed by the laws of the state in which Covered Entity is licensed to provide health care services.

7.5  Entire Agreement. This BAA, together with the myABA.ai Terms of Service, constitutes the entire agreement between the parties with respect to the subject matter hereof, and supersedes all prior discussions, representations, and agreements relating thereto.

7.6  Electronic Acceptance. This BAA is effective upon electronic acceptance. The individual accepting this BAA represents and warrants that: (i) they have read and understand this BAA; (ii) they have the legal authority to bind Covered Entity to these terms; and (iii) their electronic acceptance constitutes a legally binding signature equivalent to a handwritten signature.

7.7  Contact. Questions regarding this BAA should be directed to: privacy@myaba.ai

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXHIBIT A — DESCRIPTION OF PHI CATEGORIES AND PERMITTED USES

Category of PHI                   | Permitted Use Under This BAA
──────────────────────────────────|────────────────────────────────────────────
ABA Session Notes                 | Store, retrieve, AI-assist drafting
Behavior Intervention Plans (BIP) | Store, retrieve, AI-assist drafting
Functional Behavior Assessments   | Store, retrieve, AI-assist drafting
Client Demographics               | Store, retrieve for context injection
Progress Reports / Assessments    | Store, retrieve, AI-assist summarization
Billing / Insurance Records       | Store, retrieve for operational use
Staff-Client Assignment Records   | Store, access control enforcement
Communication Records             | Store, retrieve for continuity of care

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
