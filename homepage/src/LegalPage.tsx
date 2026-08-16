import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy + Terms of Service for myaba.ai.
//
// These pages have been revised against a legal-consultation punch list. Objective
// drafting defects are fixed and disclosures are aligned to the actual implementation.
// Items in [BRACKETS] are business/legal DECISIONS that must be supplied before these
// are finalized (legal entity, governing-law state, liability cap, subprocessor legal
// names, retention periods, geographic availability, confirmed BAA scope). Do NOT
// remove the review banner until those are resolved and counsel signs off.
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
      'myaba.ai is operated by [LEGAL ENTITY NAME], a [ENTITY TYPE, e.g. Delaware limited liability company] doing business as “myABA.ai” (“myABA,” “we,” “us”). Our principal address is [PRINCIPAL ADDRESS]. Legal notices may be sent to [NOTICE CONTACT / EMAIL].',
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
      'We do not use Customer Content or PHI to train, fine-tune, or improve any artificial intelligence or machine-learning model, whether operated by us or a third party. [CONFIRM this reflects the intended position.] Limited human review or automated monitoring may occur solely to operate, support, and secure the service and as permitted by the BAA; it is not used to train models.',
      'We do not sell personal information, and we do not use it for advertising.',
    ],
  },
  {
    heading: 'Subprocessors and AI/Translation Processing',
    paragraphs: [
      'We use the following providers to deliver the service. For PHI, we use only Google services covered by, and configured within the scope of, our Google Cloud BAA. [CONFIRM the specific Gemini model/API, Vertex features, Cloud Translation configuration, Firestore, Cloud Storage, and Cloud Run are all within the executed BAA’s covered scope.]',
    ],
    bullets: [
      'Google LLC (Google Cloud) — hosting, authentication (Firebase), database (Firestore), compute (Cloud Run), and file storage (Cloud Storage). Processing location: United States (us-central1).',
      'Google LLC (Vertex AI, Gemini [MODEL/VERSION]) — generation of AI-assisted documentation.',
      'Google LLC (Cloud Translation) — document and text translation.',
      'Stripe, Inc. — subscription billing and payment processing.',
      '[EMAIL PROVIDER LEGAL NAME] — transactional email (invitations, notifications).',
    ],
  },
  {
    heading: 'Provider Processing and Retention of Content',
    paragraphs: [
      'When your content is sent to our AI or translation providers, it is processed to produce the requested result and is not used by those providers to train their models. Provider-side handling of prompts, outputs, logs, and caches is limited as described in those providers’ enterprise terms.',
      'This transient AI/translation processing is separate from the content myABA itself stores (see Data Retention). We maintain a current list of subprocessors and will provide notice of material changes. [Subprocessor list location / change-notification process to be published.]',
    ],
  },
  {
    heading: 'Data Retention',
    paragraphs: [
      'Content you add is retained while your account is active or for the retention window your organization configures. On expiry, records that are eligible for deletion are purged. Default and configurable retention periods, the post-termination export window, audit-log retention, and backup expiration are set as follows: [RETENTION PERIODS TO BE SPECIFIED]. Legal holds override deletion.',
      'Clinical-record retention is generally governed by state law and by your organization’s obligations; specific requirements are addressed in the applicable order and BAA. Audit and compliance logs are retained separately to meet security and regulatory obligations.',
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
      'Depending on your jurisdiction, you may have additional rights (for example, under applicable U.S. state privacy laws). [Applicable jurisdictions and the specific rights/exercise process to be confirmed with counsel.]',
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
    heading: 'Geographic Availability and International Users',
    paragraphs: [
      'The platform is operated in the United States, and information is processed and stored in the United States. [The service is currently offered only to U.S.-based organizations. — CONFIRM. If the service is offered in the EEA/UK, add the required controller/processor disclosures, legal bases, a valid international-transfer mechanism, data-subject rights, and any representative details, and reference a DPA.]',
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
      'These Terms of Service (“Terms”) govern your access to and use of the myABA.ai platform and myaba.ai (the “Service”), operated by [LEGAL ENTITY NAME] (“myABA,” “we,” “us”). By accessing or using the Service, you agree to these Terms. If you use the Service on behalf of an organization, you represent that you are authorized to bind that organization.',
      'These Terms form a clickwrap agreement accepted when you access the Service. Where an executed order form, master services agreement, BAA, or data processing agreement exists, those govern their respective subject matter. We record the accepted version, the accepting user, the timestamp, and the organization. [Confirm acceptance-recording implementation.]',
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
      'Where subscription fees apply, they are billed through our payment provider (Stripe) on the plan you select. The following billing terms apply: renewal, cancellation, refunds, billing frequency, failed-payment handling, taxes, trials, and price-change notice — [BILLING TERMS TO BE SPECIFIED]. Fees are exclusive of taxes unless stated otherwise.',
    ],
  },
  {
    heading: 'Suspension and Termination',
    paragraphs: [
      'We may suspend access for a security incident, unlawful use, nonpayment, or risk to other tenants. Either party may terminate for cause on written notice and a [CURE PERIOD] opportunity to cure, and as otherwise set out in the applicable order or BAA.',
      'On termination, we will make your data available for export for a [EXPORT WINDOW] period and then delete it in accordance with the BAA and applicable law; backups expire on their normal cycle and legal holds override deletion. Provisions that by their nature should survive termination will survive.',
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
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR DATA. EACH PARTY’S TOTAL AGGREGATE LIABILITY IS CAPPED AT [LIABILITY CAP — e.g., fees paid in the prior 12 months]. The following are excluded from these limitations: [CARVE-OUTS — e.g., breach of confidentiality, PHI obligations, security incidents, indemnification, gross negligence, and willful misconduct]. [Cap and carve-outs to be finalized by counsel.] Nothing here limits liability that cannot be limited by law.',
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
      'These Terms are governed by the laws of the State of [GOVERNING-LAW STATE], without regard to conflict-of-laws principles, with exclusive venue in [VENUE]. [Determine whether to include arbitration and class-action-waiver provisions.]',
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

export default function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const sections = isPrivacy ? PRIVACY : TERMS;

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
            <Link to="/privacy" style={{ color: isPrivacy ? '#1E88FF' : '#64748B', textDecoration: 'none' }}>Privacy</Link>
            <Link to="/terms" style={{ color: !isPrivacy ? '#1E88FF' : '#64748B', textDecoration: 'none' }}>Terms</Link>
            <Link to="/documents" style={{ color: '#64748B', textDecoration: 'none' }}>Documents</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Review banner — keep until the bracketed decisions are resolved and counsel signs off. */}
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 28 }}>
          <strong>Under final legal review.</strong> This document reflects our current practices and is
          being finalized; some items are still being confirmed. Questions: {isPrivacy ? 'privacy@myaba.ai' : 'legal@myaba.ai'}.
        </div>

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
          © {EFFECTIVE_DATE.split(' ').pop()} myABA.ai. See also our{' '}
          <Link to={isPrivacy ? '/terms' : '/privacy'} style={{ color: '#1E88FF' }}>
            {isPrivacy ? 'Terms of Service' : 'Privacy Policy'}
          </Link>.
        </p>
      </main>
    </div>
  );
}
