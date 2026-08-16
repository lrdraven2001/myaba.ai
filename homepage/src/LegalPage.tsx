import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy + Terms of Service pages for myaba.ai.
//
// NOTE: These are working drafts to establish real, publicly reachable /privacy
// and /terms URLs (needed for the Google OAuth consent screen and for customers).
// They are marked DRAFT and should be reviewed by counsel before being relied on
// as binding. Update EFFECTIVE_DATE when the reviewed versions are published.
// ─────────────────────────────────────────────────────────────────────────────

const EFFECTIVE_DATE = 'August 16, 2026';

interface Section {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

const PRIVACY: Section[] = [
  {
    heading: 'Overview',
    paragraphs: [
      'myABA.ai ("myABA", "we", "us") provides AI-assisted clinical documentation tools for Applied Behavior Analysis (ABA) providers. This Privacy Policy explains what information we collect from visitors to myaba.ai and users of the platform, how we use it, and the choices you have.',
      'This policy is supplemental to any Business Associate Agreement (BAA) between myABA and your organization. Where this policy conflicts with an executed BAA regarding Protected Health Information (PHI), the BAA controls.',
    ],
  },
  {
    heading: 'Information We Collect',
    bullets: [
      'Account and identity information — when you sign in with Google, we receive your name, email address, and basic profile, along with the organization and role assigned to you within myABA.',
      'Content you provide — client records, session data, notes, and documents you enter or upload. This content may include PHI. You control what you enter.',
      'Google Drive files — only files or folders you explicitly select through the Google Picker. We use the least-privilege drive.file scope, which grants access solely to items you choose; we cannot see the rest of your Drive.',
      'Usage and device data — log data such as IP address, browser type, pages and features used, and timestamps, used to operate and secure the service.',
      'Billing information — processed by our payment provider (Stripe). We do not store full payment card numbers on our servers.',
    ],
  },
  {
    heading: 'How We Use Information',
    bullets: [
      'To provide, operate, secure, and improve the platform.',
      'To generate AI-assisted documentation from the content you submit.',
      'To provide support, send service communications, and process billing.',
      'To meet legal, regulatory, and security obligations.',
    ],
    paragraphs: [
      'We do not sell your personal information. We do not use your content or PHI to train third-party or foundation AI models.',
    ],
  },
  {
    heading: 'Google API Services — Limited Use',
    paragraphs: [
      'myABA’s use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.',
      'Specifically: we access only the Google Drive files you select via the Google Picker; we use that access solely to provide the feature you requested; we do not use this data for advertising; we do not sell it; and we do not use it to train generalized/foundation AI models.',
    ],
  },
  {
    heading: 'AI Processing and Subprocessors',
    paragraphs: [
      'We use trusted third-party providers to deliver the service. Content is processed transiently to produce results and is not used by these providers to train their models, consistent with their enterprise terms:',
    ],
    bullets: [
      'Google Cloud Platform — hosting, authentication (Firebase), database (Firestore), compute (Cloud Run), and file storage (Cloud Storage), in the United States (us-central1).',
      'Google Vertex AI (Gemini) — generation of AI-assisted documentation.',
      'Google Cloud Translation — document and text translation.',
      'Stripe — subscription billing and payment processing.',
      'Email delivery provider — transactional email (invitations, notifications).',
    ],
  },
  {
    heading: 'Protected Health Information (PHI) and HIPAA',
    paragraphs: [
      'For customers who are HIPAA Covered Entities or Business Associates, myABA acts as a Business Associate and handles PHI under a BAA. Access to PHI is role-based and least-privilege, outputs pass through our compliance-governance layer, and access is recorded in audit logs. Organizations are responsible for obtaining any client or guardian consents and authorizations required before entering PHI.',
    ],
  },
  {
    heading: 'Data Retention',
    paragraphs: [
      'We retain your content for the life of your account or for the retention window your organization configures, after which eligible records are purged. Audit and compliance logs are retained on a HIPAA-aligned schedule. You may request deletion of your account information as described below; PHI deletion is handled in accordance with the BAA and applicable law.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'We protect information using encryption in transit (TLS) and at rest (AES-256), role-based access controls, per-organization data isolation, and continuous monitoring. No method of transmission or storage is perfectly secure, but we maintain administrative, technical, and physical safeguards appropriate to the sensitivity of the data.',
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
      'You may access, correct, or request deletion of your account information by contacting us.',
      'Requests concerning PHI are routed through the covered entity (your organization) that controls that data.',
      'You may revoke myABA’s access to your Google Drive at any time from your Google Account’s security settings.',
    ],
  },
  {
    heading: 'Cookies',
    paragraphs: [
      'We use essential cookies to keep you signed in and to secure your session. We do not use advertising cookies.',
    ],
  },
  {
    heading: 'Children’s Privacy',
    paragraphs: [
      'The platform is intended for use by clinicians and authorized staff, not by children. Where client records concern minors, that information is handled as PHI by the treating organization under the BAA.',
    ],
  },
  {
    heading: 'International Users',
    paragraphs: [
      'The platform is operated in the United States, and information is processed and stored in the United States. If you access the service from outside the United States, you consent to that processing.',
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
      'These Terms of Service ("Terms") govern your access to and use of the myABA.ai platform and myaba.ai (the "Service"). By accessing or using the Service, you agree to these Terms. If you use the Service on behalf of an organization, you represent that you are authorized to bind that organization.',
    ],
  },
  {
    heading: 'Eligibility and Accounts',
    paragraphs: [
      'The Service is currently offered by invitation to select partner organizations. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Accounts are for authorized clinical and administrative staff of the subscribing organization only.',
    ],
  },
  {
    heading: 'The Service',
    paragraphs: [
      'myABA provides AI-assisted tools to help ABA providers draft and manage clinical documentation. The Service supports your professional work; it does not replace it.',
    ],
  },
  {
    heading: 'Not Medical Advice; Clinician Responsibility',
    paragraphs: [
      'myABA does not practice medicine or behavior analysis and does not provide clinical judgment. AI-generated content is a draft aid that may contain errors or omissions. A qualified clinician must review, edit, and approve all documentation before it is finalized, submitted, or relied upon. You are solely responsible for the accuracy and clinical appropriateness of your documentation.',
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
    ],
  },
  {
    heading: 'AI-Generated Content and Ownership',
    paragraphs: [
      'You retain ownership of the content you submit and of the documentation you generate. The Service and its underlying software, models configuration, and design remain the property of myABA. AI outputs are provided "as is" and must be verified by you before use.',
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
      'Where subscription fees apply, they are billed through our payment provider (Stripe) on the plan you select. Fees are exclusive of taxes. We may change pricing prospectively with notice.',
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
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT AI OUTPUTS WILL BE ACCURATE OR COMPLETE.',
    ],
  },
  {
    heading: 'Limitation of Liability',
    paragraphs: [
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, myABA WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR DATA, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE.',
    ],
  },
  {
    heading: 'Indemnification',
    paragraphs: [
      'You agree to indemnify and hold harmless myABA from claims arising out of your content, your use of the Service, or your violation of these Terms or applicable law.',
    ],
  },
  {
    heading: 'Term and Termination',
    paragraphs: [
      'Either party may terminate as set out in the applicable order or BAA. On termination, we will make your data available for export for a reasonable period and then delete it in accordance with the BAA and applicable law. Provisions that by their nature should survive termination will survive.',
    ],
  },
  {
    heading: 'Governing Law',
    paragraphs: [
      'These Terms are governed by the laws of the State of [STATE], without regard to conflict-of-laws principles. [Governing law and venue to be finalized with counsel.]',
    ],
  },
  {
    heading: 'Changes to These Terms',
    paragraphs: [
      'We may update these Terms from time to time. Material changes will be reflected by an updated effective date and, where appropriate, additional notice. Continued use after changes take effect constitutes acceptance.',
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
      {/* Header bar */}
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
        {/* Draft banner */}
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 28 }}>
          <strong>Draft — pending legal review.</strong> This document is provided to establish the policy
          and is being finalized with counsel. It is not yet a binding agreement.
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
