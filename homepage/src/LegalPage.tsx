import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy + Terms of Service for myaba.ai.
//
// Revised against a legal-consultation punch list: objective drafting defects fixed,
// disclosures aligned to the actual implementation, and the open decisions supplied
// (ACLX LLC dba myABA.ai, Virginia governing law, US-only, Stripe billing, 7-year
// audit retention, 12-month liability cap with standard carve-outs). Standard
// commercial defaults (non-refundable, 30-day cure/export/price-change, no
// arbitration) should still be sanity-checked by counsel. AI-training and Google
// BAA-scope statements are asserted as fact — keep them accurate to implementation.
// ─────────────────────────────────────────────────────────────────────────────

const EFFECTIVE_DATE = 'August 16, 2026';

interface Section {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

const PRIVACY: Section[] = [
  {
    heading: 'Who We Are',
    paragraphs: [
      'myaba.ai is operated by ACLX LLC, a Virginia limited liability company doing business as “myABA.ai” (“myABA,” “we,” “us”). Our principal address is 620 Windermere Dr, Culpeper, VA 22701. Legal notices may be sent to chris@aclx.ai.',
      'This Privacy Policy explains what information we handle from visitors to myaba.ai and users of the platform, how we handle it, and the choices available to you.',
    ],
  },
  {
    heading: 'Our Roles and How This Policy Relates to the BAA',
    paragraphs: [
      'We handle different categories of data in different legal roles:',
    ],
    bullets: [
      'Customer-controlled PHI (client records and clinical content your organization enters) — we act as a Business Associate under a Business Associate Agreement (BAA) with your organization. The BAA governs PHI and controls where it conflicts with this policy.',
      'Workforce account information (staff identity, role, login records) — we handle this to operate the service.',
      'Website and security telemetry (logs, IP address, device and usage data) — we handle this to secure and improve the service.',
      'Billing and business-contact data — we handle this to administer subscriptions and communications.',
    ],
  },
  {
    heading: 'Information We Collect',
    bullets: [
      'Identity via Google. When you authenticate through Google, we receive the identity information authorized through that service, such as your name, email address, and profile image. Your organization, role, and permissions within myABA are assigned or maintained by your organization or by myABA administrators.',
      'Content you provide. Client records, session data, notes, and documents you enter or upload. This content may include PHI. You control what you enter.',
      'Google Drive data. Only files or folders you explicitly select through the Google Picker (described in the next section).',
      'Usage and security telemetry. Log data such as IP address, browser type, features used, and timestamps.',
      'Billing information. Processed by our payment provider (Stripe). We do not store full payment card numbers on our servers.',
    ],
  },
  {
    heading: 'Google Drive Data',
    paragraphs: [
      'We request the least-privilege Google “drive.file” scope, which grants access only to the specific files or folders you choose through the Google Picker. We cannot see the rest of your Drive.',
      'There are two distinct ways Drive is used, and they are handled differently:',
    ],
    bullets: [
      'Importing a file into the resource library copies that file’s contents into myABA. Google Docs and Sheets are exported to text; other supported files are read at import. The imported copy is stored as an organization resource and remains until you delete it, like any other content you add.',
      'Linking a Drive item to a client stores only a reference (its name, identifier, and link) — not the file’s contents. The original remains in Google Drive and is opened by users in their own Google session; whether another user can open it is governed by Google’s own sharing, not by myABA.',
      'An import is a one-time read; we do not continuously re-access the original Drive file afterward.',
      'Content imported into myABA may be processed by our AI and translation providers in the same way as other content you submit (see Subprocessors).',
      'Authorization uses a short-lived access token obtained in your browser. We do not store Google OAuth refresh tokens.',
      'You may revoke myABA’s Drive access at any time from your Google Account’s security settings. Revocation stops future access; it does not delete copies already imported into myABA — delete those within the platform.',
    ],
  },
  {
    heading: 'Google API Services — Limited Use',
    paragraphs: [
      'myABA’s use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements. We use Google user data solely to provide the features you request; we do not use it for advertising, we do not sell it, and we do not use it to train generalized or foundation AI models.',
    ],
  },
  {
    heading: 'How We Use Information',
    bullets: [
      'To provide, operate, and secure the platform and to generate the AI-assisted documentation you request.',
      'To provide support, send service communications, and administer billing.',
      'To meet legal, regulatory, and security obligations.',
    ],
    paragraphs: [
      'We use PHI only to provide the contracted services, support authorized users, maintain security, and perform other activities expressly permitted by the applicable BAA.',
      'We do not use Customer Content or PHI to train, fine-tune, or improve any artificial intelligence or machine-learning model, whether operated by us or a third party. Limited human review or automated monitoring may occur solely to operate, support, and secure the service and as permitted by the BAA; it is not used to train models.',
      'We do not sell personal information, and we do not use it for advertising.',
    ],
  },
  {
    heading: 'Subprocessors and AI/Translation Processing',
    paragraphs: [
      'We use the following providers to deliver the service. For PHI, we use only Google services covered by, and configured within the scope of, our Google Cloud BAA.',
    ],
    bullets: [
      'Google LLC (Google Cloud) — hosting, authentication (Firebase), database (Firestore), compute (Cloud Run), and file storage (Cloud Storage). Processing location: United States (us-central1).',
      'Google LLC (Vertex AI, Gemini models) — generation of AI-assisted documentation.',
      'Google LLC (Cloud Translation) — document and text translation.',
      'Stripe, Inc. — subscription billing and payment processing.',
      'Google LLC (Google Workspace) — transactional email (invitations, notifications).',
    ],
  },
  {
    heading: 'Provider Processing and Retention of Content',
    paragraphs: [
      'When your content is sent to our AI or translation providers, it is processed to produce the requested result and is not used by those providers to train their models. Provider-side handling of prompts, outputs, logs, and caches is limited as described in those providers’ enterprise terms.',
      'This transient AI/translation processing is separate from the content myABA itself stores (see Data Retention). We maintain a current list of subprocessors, available on request at compliance@myaba.ai, and will provide notice of material changes.',
    ],
  },
  {
    heading: 'Data Retention',
    paragraphs: [
      'Content you add is retained while your account is active. Your organization may configure a retention window (subject to a 30-day minimum), after which records eligible for deletion are purged. If no window is configured, content is retained until you or your organization delete it or the account is closed. On termination, we make your data available for export for 30 days before deletion. Backups expire on their normal cycle, and legal holds override deletion.',
      'Audit and compliance logs are retained separately to meet security and regulatory obligations — by default for seven (7) years, consistent with HIPAA’s minimum documentation-retention requirement. Clinical-record retention is otherwise governed by state law and your organization’s obligations, as addressed in the applicable order and BAA.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'We protect information using encryption in transit (TLS) and encryption at rest provided by our cloud platform (generally AES-256, provider-managed). We apply role-based access controls, per-organization data separation, and access logging, and we maintain administrative, technical, and physical safeguards appropriate to the sensitivity of the data. No method of transmission or storage is perfectly secure.',
    ],
  },
  {
    heading: 'Output Governance',
    paragraphs: [
      'AI outputs pass through an internal output-governance step that applies policy checks, can redact or withhold content, and records governance events in an audit log. This is an operational safeguard; it does not by itself guarantee regulatory compliance.',
    ],
  },
  {
    heading: 'How Information Is Shared',
    paragraphs: [
      'We share information only with the subprocessors listed above, when required by law or valid legal process, to protect rights and safety, or at your direction. We do not sell personal information.',
    ],
  },
  {
    heading: 'Your Choices and Rights',
    bullets: [
      'Requests concerning PHI are handled through the covered entity (your organization) that controls that data, in accordance with the BAA.',
      'For workforce, website/telemetry, and billing data, you may request access, correction, or deletion by contacting us.',
      'Depending on your state of residence, you may have additional rights under applicable U.S. state privacy laws, such as rights to access or delete certain personal information. To exercise any such right, contact us at privacy@myaba.ai.',
      'You may revoke myABA’s access to your Google Drive at any time from your Google Account settings.',
    ],
  },
  {
    heading: 'Cookies',
    paragraphs: [
      'We use cookies and similar technologies necessary for authentication and to secure your session. Our authentication provider (Firebase) and payment provider (Stripe) may set their own cookies as described in their policies. We do not use advertising cookies.',
    ],
  },
  {
    heading: 'Geographic Availability',
    paragraphs: [
      'The Service is offered only to organizations based in the United States, and information is processed and stored in the United States. The Service is not directed to individuals or organizations in the European Economic Area or the United Kingdom.',
    ],
  },
  {
    heading: 'Children’s Privacy',
    paragraphs: [
      'The platform is intended for clinicians and authorized staff, not children. Where client records concern minors, that information is handled as PHI by the treating organization under the BAA.',
    ],
  },
  {
    heading: 'Changes to This Policy',
    paragraphs: [
      'We may update this policy from time to time. Material changes will be reflected by an updated effective date and, where appropriate, additional notice.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'Questions about this policy or your data: privacy@myaba.ai or compliance@myaba.ai.',
    ],
  },
];

const TERMS: Section[] = [
  {
    heading: 'Agreement to Terms',
    paragraphs: [
      'These Terms of Service (“Terms”) govern your access to and use of the myABA.ai platform and myaba.ai (the “Service”), operated by ACLX LLC, a Virginia limited liability company doing business as “myABA.ai” (“myABA,” “we,” “us”). By accessing or using the Service, you agree to these Terms. If you use the Service on behalf of an organization, you represent that you are authorized to bind that organization.',
      'These Terms form a clickwrap agreement accepted when you access the Service. Where an executed order form, master services agreement, BAA, or data processing agreement exists, those govern their respective subject matter.',
    ],
  },
  {
    heading: 'Order of Precedence',
    paragraphs: [
      'In the event of a conflict, the following order controls, from highest to lowest: (1) the BAA, for matters involving PHI; (2) a signed order form or master services agreement, for pricing and other negotiated commercial terms; (3) any data processing agreement, for data-protection matters; and (4) these Terms.',
    ],
  },
  {
    heading: 'Eligibility and Accounts',
    paragraphs: [
      'The Service is currently offered by invitation to select partner organizations. You are responsible for maintaining the confidentiality of your credentials and for activity under your account, which is for authorized clinical and administrative staff of the subscribing organization only.',
    ],
  },
  {
    heading: 'The Service; Not Medical Advice',
    paragraphs: [
      'myABA provides AI-assisted tools to help ABA providers draft and manage clinical documentation. myABA does not practice medicine or behavior analysis and does not provide clinical judgment. AI-generated content is a draft aid that may contain errors or omissions. A qualified clinician must review, edit, and approve all documentation before it is finalized, submitted, or relied upon. You are solely responsible for the accuracy and clinical appropriateness of your documentation.',
      'If future features provide treatment recommendations or clinical decision support beyond drafting assistance, additional terms and regulatory review may apply.',
    ],
  },
  {
    heading: 'Customer Responsibilities',
    bullets: [
      'Provide accurate information and use the Service in compliance with applicable law, including HIPAA and state regulations.',
      'Obtain all client or guardian consents and authorizations required before entering data.',
      'Execute a Business Associate Agreement with myABA before entering PHI.',
      'Safeguard credentials and promptly report any suspected unauthorized access.',
    ],
  },
  {
    heading: 'Acceptable Use',
    bullets: [
      'Do not use the Service for any unlawful purpose or upload data you lack authority to process.',
      'Do not attempt to access other organizations’ data or circumvent security or tenant isolation.',
      'Do not reverse engineer, resell, or misuse the Service, or interfere with its operation.',
      'Do not use generated content to fabricate clinical records, session events, treatment results, signatures, or billing support.',
    ],
  },
  {
    heading: 'Intellectual Property and Content',
    paragraphs: [
      'myABA owns the Service and its underlying software, orchestration, prompts, model configurations, workflows, design, and proprietary technology, excluding Customer Content and third-party technology (including third-party AI models, which remain the property of their providers).',
      'As between the parties, and to the extent any ownership rights exist, you own the outputs generated from your content; some AI-generated material may not independently qualify for intellectual-property protection.',
      'You grant myABA a limited, non-exclusive license to host, process, transmit, and reproduce Customer Content solely to provide and support the Service. You retain ownership of your content.',
    ],
  },
  {
    heading: 'Protected Health Information and BAA',
    paragraphs: [
      'PHI is handled under the BAA between myABA and your organization. Where these Terms conflict with the BAA regarding PHI, the BAA controls.',
    ],
  },
  {
    heading: 'Fees and Billing',
    paragraphs: [
      'Paid subscriptions (Solo, Team, and Enterprise plans) are billed through our payment provider, Stripe, on a recurring basis for the plan and number of seats you select. Subscriptions renew automatically each billing period until cancelled. You may change or cancel your plan and update payment methods through the Stripe billing portal; on cancellation, access continues through the end of the paid period. If a payment fails, we may retry and, on continued nonpayment, suspend access. Fees are exclusive of taxes, which are your responsibility. Except where required by law, fees already paid are non-refundable. We may change pricing prospectively with at least thirty (30) days’ notice.',
    ],
  },
  {
    heading: 'Suspension and Termination',
    paragraphs: [
      'We may suspend access for a security incident, unlawful use, nonpayment, or risk to other tenants. Either party may terminate for cause on written notice and a thirty (30) day opportunity to cure, and as otherwise set out in the applicable order or BAA.',
      'On termination, we will make your data available for export for thirty (30) days and then delete it in accordance with the BAA and applicable law; backups expire on their normal cycle and legal holds override deletion. Provisions that by their nature should survive termination will survive.',
    ],
  },
  {
    heading: 'Third-Party Services',
    paragraphs: [
      'The Service integrates with third-party services (including Google and Stripe). Your use of those integrations is also subject to the applicable third party’s terms.',
    ],
  },
  {
    heading: 'Disclaimers',
    paragraphs: [
      'EXCEPT AS EXPRESSLY STATED IN AN ORDER, BAA, OR DPA, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE OR THAT AI OUTPUTS WILL BE ACCURATE OR COMPLETE. This section does not limit obligations that cannot be disclaimed by law or promises expressly made in an order, BAA, or DPA.',
    ],
  },
  {
    heading: 'Limitation of Liability',
    paragraphs: [
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR DATA. EACH PARTY’S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THE SERVICE IS LIMITED TO THE FEES PAID OR PAYABLE BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM. These limitations do not apply to breaches of confidentiality, a party’s obligations regarding PHI, security-incident obligations, indemnification obligations, or liability arising from gross negligence or willful misconduct. Nothing here limits liability that cannot be limited by law.',
    ],
  },
  {
    heading: 'Indemnification',
    paragraphs: [
      'You agree to indemnify and hold harmless myABA from third-party claims arising out of your content, your use of the Service, or your violation of these Terms or applicable law. The indemnified party will provide prompt notice, reasonable cooperation, and sole control of the defense and settlement (no settlement imposing obligations on the other party without consent).',
    ],
  },
  {
    heading: 'General',
    paragraphs: [
      'These Terms are governed by the laws of the Commonwealth of Virginia, without regard to conflict-of-laws principles, with exclusive venue in the state and federal courts located in Virginia.',
      'These Terms, together with any order, BAA, and DPA, are the entire agreement and supersede prior understandings. If any provision is unenforceable, the remainder stays in effect (severability). Failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign to an affiliate or successor. Neither party is liable for events beyond its reasonable control (force majeure). Notices will be given as set out in the applicable order or to the contacts below. You consent to receive electronic communications. You will comply with applicable export-control laws.',
      'We may update these Terms from time to time. Material changes will be reflected by an updated effective date and, where appropriate, additional notice; continued use after changes take effect constitutes acceptance.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'Questions about these Terms: legal@myaba.ai.',
    ],
  },
];

const DPA: Section[] = [
  {
    heading: 'Scope and Roles',
    paragraphs: [
      'This Data Processing Addendum (“DPA”) forms part of the agreement between ACLX LLC, doing business as “myABA.ai” (“myABA”), and the customer organization (“Customer”) and governs myABA’s processing of Customer Personal Data that is not Protected Health Information (PHI).',
      'PHI is governed exclusively by the Business Associate Agreement (BAA) between the parties and is outside the scope of this DPA. For Customer Personal Data, Customer is the controller/business and myABA is the processor/service provider.',
    ],
  },
  {
    heading: 'Definitions',
    bullets: [
      '“Customer Personal Data” means personal information myABA processes on Customer’s behalf under the agreement, excluding PHI.',
      '“PHI” has the meaning given under HIPAA and is governed by the BAA.',
      '“Applicable Privacy Laws” means U.S. state privacy laws applicable to the parties, such as the California Consumer Privacy Act as amended (CCPA/CPRA) and the Virginia Consumer Data Protection Act (VCDPA).',
      'The terms controller, business, processor, service provider, data subject, and consumer have the meanings given under Applicable Privacy Laws.',
    ],
  },
  {
    heading: 'Details of Processing',
    bullets: [
      'Subject matter and purpose: providing the Service and generating the documentation Customer requests.',
      'Duration: the term of the agreement.',
      'Categories of data subjects: Customer’s authorized users and business contacts.',
      'Categories of Customer Personal Data: identity and contact details, account and role information, and usage/telemetry data. Clinical/PHI data is handled under the BAA, not this DPA.',
    ],
  },
  {
    heading: 'myABA’s Obligations',
    bullets: [
      'Process Customer Personal Data only to provide the Service and on Customer’s documented instructions (the agreement), and as required by law.',
      'Ensure personnel authorized to process the data are bound by confidentiality.',
      'Maintain appropriate technical and organizational security measures (see the Privacy Policy, Security).',
      'Reasonably assist Customer in responding to verified data-subject/consumer requests.',
      'Notify Customer without undue delay after becoming aware of a breach of security leading to unauthorized access to Customer Personal Data.',
      'Make available information reasonably necessary to demonstrate compliance and, on reasonable notice and subject to confidentiality, allow reasonable audits.',
    ],
  },
  {
    heading: 'Service-Provider / Processor Certification (CCPA/CPRA and similar laws)',
    paragraphs: [
      'myABA acts as a service provider/processor with respect to Customer Personal Data. myABA will not sell or share Customer Personal Data, will not retain, use, or disclose it for any purpose other than performing the Service (or as otherwise permitted by Applicable Privacy Laws), and will not combine it with data from other sources except as permitted by those laws. myABA certifies that it understands and will comply with these restrictions.',
    ],
  },
  {
    heading: 'Subprocessors',
    paragraphs: [
      'Customer authorizes myABA to engage the subprocessors identified in the Privacy Policy. myABA imposes data-protection obligations on its subprocessors consistent with this DPA and remains responsible for their performance. myABA maintains a current subprocessor list (available at compliance@myaba.ai) and will provide notice of material changes.',
    ],
  },
  {
    heading: 'International Transfers',
    paragraphs: [
      'The Service is provided from the United States to U.S.-based organizations, and Customer Personal Data is processed and stored in the United States. This DPA does not provide a mechanism for transfers of personal data from the European Economic Area or the United Kingdom, which are outside the Service’s scope.',
    ],
  },
  {
    heading: 'Return and Deletion',
    paragraphs: [
      'On termination, myABA will return or delete Customer Personal Data in accordance with the Terms and the BAA, subject to the retention periods described in the Privacy Policy and to any legal-hold or legal-retention obligations.',
    ],
  },
  {
    heading: 'Order of Precedence',
    paragraphs: [
      'The BAA controls all matters involving PHI. A signed order form or master services agreement controls pricing and other negotiated commercial terms. This DPA controls the processing of non-PHI Customer Personal Data. The Terms of Service govern all other matters.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'To execute this DPA or request the current subprocessor list, contact compliance@myaba.ai.',
    ],
  },
];

export default function LegalPage({ kind }: { kind: 'privacy' | 'terms' | 'dpa' }) {
  const title = kind === 'privacy' ? 'Privacy Policy'
              : kind === 'terms' ? 'Terms of Service'
              : 'Data Processing Addendum';
  const sections = kind === 'privacy' ? PRIVACY : kind === 'terms' ? TERMS : DPA;
  const contactEmail = kind === 'privacy' ? 'privacy@myaba.ai' : kind === 'terms' ? 'legal@myaba.ai' : 'compliance@myaba.ai';

  useEffect(() => {
    document.title = `${title} · myABA.ai`;
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', color: '#1E293B',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      <header style={{ borderBottom: '1px solid #E2E8F0', padding: '16px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ fontWeight: 700, fontSize: 18, color: '#1E3347', textDecoration: 'none' }}>myABA.ai</Link>
          <nav style={{ display: 'flex', gap: 18, fontSize: 14 }}>
            <Link to="/privacy" style={{ color: kind === 'privacy' ? '#1E88FF' : '#64748B', textDecoration: 'none' }}>Privacy</Link>
            <Link to="/terms" style={{ color: kind === 'terms' ? '#1E88FF' : '#64748B', textDecoration: 'none' }}>Terms</Link>
            <Link to="/dpa" style={{ color: kind === 'dpa' ? '#1E88FF' : '#64748B', textDecoration: 'none' }}>DPA</Link>
            <Link to="/documents" style={{ color: '#64748B', textDecoration: 'none' }}>Documents</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1E3347', margin: '0 0 6px' }}>{title}</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 32px' }}>Effective date: {EFFECTIVE_DATE}</p>

        {sections.map((s, i) => (
          <section key={i} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: '#1E3347', margin: '0 0 10px' }}>
              {i + 1}. {s.heading}
            </h2>
            {s.paragraphs?.map((p, j) => (
              <p key={j} style={{ fontSize: 15, lineHeight: 1.65, color: '#334155', margin: '0 0 12px' }}>{p}</p>
            ))}
            {s.bullets && (
              <ul style={{ margin: '0 0 12px', paddingLeft: 22 }}>
                {s.bullets.map((b, j) => (
                  <li key={j} style={{ fontSize: 15, lineHeight: 1.6, color: '#334155', marginBottom: 8 }}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 40, borderTop: '1px solid #E2E8F0', paddingTop: 20 }}>
          © {EFFECTIVE_DATE.split(' ').pop()} ACLX LLC dba myABA.ai. Questions: {contactEmail}. See also our{' '}
          <Link to="/privacy" style={{ color: '#1E88FF' }}>Privacy Policy</Link>,{' '}
          <Link to="/terms" style={{ color: '#1E88FF' }}>Terms</Link>, and{' '}
          <Link to="/dpa" style={{ color: '#1E88FF' }}>DPA</Link>.
        </p>
      </main>
    </div>
  );
}
