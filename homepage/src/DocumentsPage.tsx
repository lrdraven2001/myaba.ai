import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NavBar, Footer } from './App';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'guides' | 'compliance' | 'legal';

interface DocCard {
  id: string;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  cta: 'view' | 'request' | 'coming-soon' | 'email' | 'link';
  ctaLabel?: string;
  ctaHref?: string;
  content?: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
function IconBook() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
}
function IconShield() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function IconFile() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function IconChevron({ open }: { open: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>;
}
function IconCheck() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guide content — User Guide
// ─────────────────────────────────────────────────────────────────────────────
function UserGuideContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <Section title="1. Logging In">
        <p>Navigate to <strong>app.myaba.ai</strong> and sign in with your Google account or email/password. Multi-factor authentication (MFA) is required for all accounts — you will be prompted to set it up on first login if you haven't already. MFA cannot be disabled.</p>
        <p style={{ marginTop: 10 }}>Your session will time out after a period of inactivity. This is a HIPAA security requirement and cannot be changed by end users.</p>
      </Section>

      <Section title="2. Dashboard Overview">
        <p>After logging in you'll land on the main dashboard. The left sidebar contains:</p>
        <ul>
          <li><strong>Chat</strong> — Start or continue an AI session</li>
          <li><strong>Clients</strong> — View and manage your client roster</li>
          <li><strong>Documents</strong> — Generated documents and your history</li>
          <li><strong>Templates</strong> — Reusable prompt templates</li>
          <li><strong>Projects</strong> — Group work by project or program</li>
          <li><strong>Policies</strong> — Your organization's uploaded policy documents</li>
          <li><strong>Search</strong> — Cross-client knowledge base search</li>
          <li><strong>Settings</strong> — Account and organization settings</li>
        </ul>
        <p style={{ marginTop: 10 }}>The top-right corner shows your name, role, and a quick link to sign out.</p>
      </Section>

      <Section title="3. Working with Clients">
        <p><strong>Adding a client manually:</strong> Go to Clients → Add Client. Enter the client's name, date of birth, and any relevant identifiers. You can also set their primary diagnosis and assigned program.</p>
        <p style={{ marginTop: 10 }}><strong>Searching for a client:</strong> Use the search bar at the top of the Clients list or the global Search feature. Search finds clients by name, ID, or diagnosis.</p>
        <p style={{ marginTop: 10 }}><strong>Client profile:</strong> Click any client to see their full profile including service history, assigned staff, and generated documents.</p>
      </Section>

      <Section title="4. AI Chat Sessions">
        <p>Chat is the primary way to interact with myABA.ai's AI. Each session is associated with a specific client so the AI has the right context.</p>
        <ol>
          <li>Click <strong>Chat</strong> in the sidebar, then <strong>New Session</strong></li>
          <li>Select the client this session is for</li>
          <li>Type your question or describe what you need</li>
          <li>The AI will respond with clinically relevant content</li>
          <li>You can ask follow-up questions, request revisions, or generate a document from the conversation</li>
        </ol>
        <p style={{ marginTop: 10 }}><strong>What the AI knows:</strong> The AI has access to your organization's uploaded policies and the client's profile. It does not have access to other clients' data.</p>
        <p style={{ marginTop: 10 }}><strong>Sensitive data:</strong> Do not enter Social Security numbers, payment card numbers, or driver's license numbers in chat. The system will block these automatically — they have no clinical purpose in a documentation tool.</p>
      </Section>

      <Section title="5. Generating Documents">
        <p>Documents can be generated from a chat session or directly via the Generate button.</p>
        <ol>
          <li>Select a client and a document template (e.g. Session Note, Behavior Intervention Plan, Progress Report)</li>
          <li>Optionally add context — goals, session observations, or specific instructions</li>
          <li>Click <strong>Generate</strong></li>
          <li>The AI drafts the document and it goes through content governance review</li>
          <li>If approved automatically, the document appears in your Documents list</li>
          <li>If it requires human review, it will appear in the Review Queue</li>
        </ol>
      </Section>

      <Section title="6. The Review Queue">
        <p>Some AI outputs are held for human review before being released to clinical staff. This is governed by your organization's ACLX content policy.</p>
        <p style={{ marginTop: 10 }}>If a document you requested is in the queue, you'll see a notification. An administrator or designated reviewer must approve it before it's available. This is by design — it ensures a human has eyes on sensitive AI-generated clinical content.</p>
        <p style={{ marginTop: 10 }}>You cannot bypass the review queue. If you believe a document was incorrectly flagged, contact your administrator.</p>
      </Section>

      <Section title="7. Using Templates">
        <p>Templates are pre-defined prompts that streamline common documentation tasks. Your organization's administrator creates and manages templates.</p>
        <p style={{ marginTop: 10 }}>To use a template: Go to Templates, select one, choose a client, and click <strong>Use Template</strong>. The template's prompt pre-fills the generation form — you can edit it before generating.</p>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Guide content — Admin Guide
// ─────────────────────────────────────────────────────────────────────────────
function AdminGuideContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <Section title="1. Organization Setup">
        <p>On first login as an Organization Super Admin, you'll be guided through onboarding:</p>
        <ol>
          <li>Set your organization's display name</li>
          <li>Complete MFA setup (required before the organization can process PHI)</li>
          <li>Review and accept the HIPAA Business Associate Agreement</li>
          <li>Configure your AI governance policy (or use the default)</li>
        </ol>
        <p style={{ marginTop: 10 }}>You can update your organization profile at any time in <strong>Settings → Organization</strong>.</p>
      </Section>

      <Section title="2. Inviting Team Members">
        <p>Go to <strong>Settings → Team</strong> and click <strong>Invite Member</strong>. Enter the person's email address and select their role.</p>
        <p style={{ marginTop: 10 }}>The invitee will receive an email with a link. They must complete account creation and MFA setup before accessing any PHI.</p>
        <p style={{ marginTop: 10 }}><strong>Removing access:</strong> Click the member's name → <strong>Remove</strong>. Their access is revoked immediately. They will not be able to log in to your organization after removal.</p>
      </Section>

      <Section title="3. Role Reference">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F0F6FF' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#1E3347', fontWeight: 600 }}>Role</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#1E3347', fontWeight: 600 }}>Can Do</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Org Super Admin', 'Everything — manage members, settings, integrations, AI policy, billing'],
              ['Treating BCBA', 'Chat, generate documents, manage clients, use templates, review queue (own documents)'],
              ['BCBA Student', 'Chat, generate documents (under supervisor); supervisor approval required'],
              ['RBT', 'Chat, view assigned clients; cannot generate documents independently'],
              ['Billing Admin', 'View documents and client records; manage billing information'],
              ['Scheduler', 'View client schedules; limited documentation access'],
            ].map(([role, perms]) => (
              <tr key={role} style={{ borderBottom: '1px solid #E4EEF3' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1E3347', whiteSpace: 'nowrap' }}>{role}</td>
                <td style={{ padding: '8px 12px', color: '#5A7184' }}>{perms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="4. EHR Integrations">
        <p>Go to <strong>Settings → Integrations</strong> to connect your practice management system.</p>
        <p style={{ marginTop: 10 }}><strong>CentralReach:</strong> Enter your CentralReach subdomain and API credentials. Once connected, you can search and sync client records directly into myABA.ai without manual data entry.</p>
        <p style={{ marginTop: 10 }}><strong>Rethink:</strong> Enter your Rethink API key. Connection works the same way as CentralReach.</p>
        <p style={{ marginTop: 10 }}>Credentials are encrypted at rest (AES-256-GCM) and never stored in plain text. You can rotate credentials at any time by disconnecting and reconnecting.</p>
      </Section>

      <Section title="5. Importing from OfficePuzzle">
        <p>OfficePuzzle doesn't have a live API, so myABA.ai supports a file-based import:</p>
        <ol>
          <li>In OfficePuzzle, go to your client list and export it as Excel (.xlsx) or CSV</li>
          <li>In myABA.ai, go to <strong>Settings → Integrations → OfficePuzzle Import</strong></li>
          <li>Upload the exported file</li>
          <li>The system maps columns automatically — names, DOBs, diagnoses, and case IDs are detected from over 30 header variations</li>
          <li>Review the import summary (imported count, skipped rows, any errors)</li>
        </ol>
        <p style={{ marginTop: 10 }}>Imports are additive — existing client records are not overwritten. Duplicate detection uses OfficePuzzle case ID.</p>
      </Section>

      <Section title="6. AI Governance (ACLX Policy)">
        <p>Go to <strong>Settings → Organization → AI Governance</strong> to configure content policy for your organization.</p>
        <p style={{ marginTop: 10 }}><strong>Hard-block rules:</strong> Certain content categories (substance use records, psychotherapy notes, HIV status, genetic information) are hard-blocked by default and require explicit authorization on the subject record to unlock. These rules cannot be disabled — they reflect HIPAA's special protections for these categories.</p>
        <p style={{ marginTop: 10 }}><strong>Review thresholds:</strong> You can configure which types of AI output require human review before being released to clinical staff. Stricter thresholds mean more manual review; looser thresholds mean faster workflows. The default is a balanced middle-ground appropriate for most ABA practices.</p>
        <p style={{ marginTop: 10 }}><strong>DLP:</strong> Data Loss Prevention runs on all user input before it reaches the AI. It blocks Social Security numbers, payment card numbers, and driver's license numbers. This is always on and cannot be disabled.</p>
      </Section>

      <Section title="7. Review Queue Management">
        <p>The Review Queue holds AI-generated documents that triggered your organization's review policy. As an admin, you can:</p>
        <ul>
          <li><strong>Approve</strong> — Release the document to the requesting clinician</li>
          <li><strong>Reject</strong> — Return with comments; the clinician can revise and resubmit</li>
          <li><strong>Escalate</strong> — Flag for clinical leadership review</li>
        </ul>
        <p style={{ marginTop: 10 }}>Every review decision is logged in the audit trail with your name, decision, and timestamp. These logs are retained for 7 years.</p>
      </Section>

      <Section title="8. Usage Monitoring">
        <p>Go to <strong>Settings → Organization → Usage</strong> to see AI request counts for the current billing period, broken down by user and document type.</p>
        <p style={{ marginTop: 10 }}>Your plan's monthly limit is shown alongside current usage. Enterprise plans have no usage cap. Contact us if you need a temporary limit increase.</p>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Guide content — EHR Integration Guide
// ─────────────────────────────────────────────────────────────────────────────
function EhrGuideContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <Section title="CentralReach Integration">
        <p>myABA.ai connects directly to the CentralReach REST API to search and sync client records.</p>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Prerequisites</p>
        <ul>
          <li>A CentralReach account with API access enabled</li>
          <li>Your CentralReach subdomain (the part before <code>.centralreach.com</code>)</li>
          <li>API credentials — typically a client ID and client secret from CentralReach's developer settings</li>
        </ul>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Setup steps</p>
        <ol>
          <li>In myABA.ai, go to <strong>Settings → Integrations → CentralReach</strong></li>
          <li>Enter your CentralReach subdomain (e.g. <code>acme</code> if your URL is acme.centralreach.com)</li>
          <li>Enter your API client ID and client secret</li>
          <li>Click <strong>Connect</strong> — myABA.ai will verify the credentials immediately</li>
          <li>Once connected, a green status indicator confirms the link</li>
        </ol>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Using the integration</p>
        <p>When adding or searching clients, you'll see a <strong>Search CentralReach</strong> option. Results from CentralReach appear alongside your existing myABA.ai clients. Click a result to import the client record into myABA.ai.</p>
        <p style={{ marginTop: 10 }}>Data pulled from CentralReach: name, date of birth, gender, primary diagnosis, insurance/authorization IDs, and CentralReach client ID (stored for future sync).</p>
      </Section>

      <Section title="Rethink Integration">
        <p>The Rethink integration works identically to CentralReach from a user perspective.</p>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Prerequisites</p>
        <ul>
          <li>A Rethink account with API access</li>
          <li>Your Rethink API key (found in Rethink's account settings under Integrations)</li>
        </ul>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Setup steps</p>
        <ol>
          <li>Go to <strong>Settings → Integrations → Rethink</strong></li>
          <li>Enter your Rethink API key</li>
          <li>Click <strong>Connect</strong></li>
        </ol>
        <p style={{ marginTop: 10 }}>Rethink client records are mapped to the same internal format as CentralReach. Clients imported from Rethink are tagged with their source so you can filter by integration origin.</p>
      </Section>

      <Section title="OfficePuzzle File Import">
        <p>OfficePuzzle does not have a public API. myABA.ai supports a file-based import using an Excel or CSV export from OfficePuzzle.</p>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Exporting from OfficePuzzle</p>
        <ol>
          <li>In OfficePuzzle, navigate to your Client List</li>
          <li>Use the export function (typically under Reports or the toolbar) to export as <strong>Excel (.xlsx)</strong> or <strong>CSV</strong></li>
          <li>Save the file to your computer</li>
        </ol>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Importing into myABA.ai</p>
        <ol>
          <li>Go to <strong>Settings → Integrations → OfficePuzzle Import</strong></li>
          <li>Click <strong>Choose File</strong> and select your exported file</li>
          <li>Click <strong>Import</strong></li>
          <li>The system auto-detects column headers — it recognizes over 30 variations of common column names</li>
          <li>Review the import summary: how many clients were imported, skipped (duplicates), and any rows with errors</li>
        </ol>
        <p style={{ marginTop: 12, fontWeight: 600, color: '#1E3347' }}>Column mapping</p>
        <p>myABA.ai automatically detects these columns regardless of exact header name:</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 10 }}>
          <thead>
            <tr style={{ background: '#F0F6FF' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#1E3347', fontWeight: 600 }}>myABA.ai Field</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#1E3347', fontWeight: 600 }}>Accepted Headers (examples)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['First Name', 'first, firstname, first name, given name'],
              ['Last Name', 'last, lastname, last name, family name, surname'],
              ['Full Name', 'name, full name, client name, student name'],
              ['Date of Birth', 'dob, date of birth, birthdate, birth date'],
              ['Gender', 'gender, sex'],
              ['Diagnosis', 'diagnosis, dx, primary diagnosis, icd'],
              ['Case ID', 'case id, client id, patient id, member id'],
              ['Insurance ID', 'insurance id, member number, policy number'],
            ].map(([field, headers]) => (
              <tr key={field} style={{ borderBottom: '1px solid #E4EEF3' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1E3347' }}>{field}</td>
                <td style={{ padding: '8px 12px', color: '#5A7184', fontStyle: 'italic' }}>{headers}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 10, fontSize: 13, color: '#5A7184' }}>File size limit: 25 MB. Most OfficePuzzle exports are under 2 MB.</p>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Guide content — Quick Start
// ─────────────────────────────────────────────────────────────────────────────
function QuickStartContent() {
  const steps = [
    {
      n: '01',
      title: 'Accept your invitation',
      body: 'Click the link in your invitation email. Create your account with Google SSO or email/password, then set up multi-factor authentication. MFA is required before you can access any client data.',
    },
    {
      n: '02',
      title: 'Add your first client',
      body: 'Go to Clients → Add Client (or import from your EHR via Settings → Integrations). Enter the client\'s name and date of birth — that\'s the minimum required to start.',
    },
    {
      n: '03',
      title: 'Start a chat session',
      body: 'Click Chat → New Session, select your client, and type what you need. Try: "Draft a session note for a 45-minute ABA session. The client worked on tacting and mand training. Compliance was 78%."',
    },
    {
      n: '04',
      title: 'Generate a document',
      body: 'From the chat, click Generate Document and select a template. The AI will draft the full document using your conversation context. It goes through content review and appears in your Documents list when approved.',
    },
    {
      n: '05',
      title: 'You\'re ready',
      body: 'Explore Templates for pre-built prompts, Policies to upload your organization\'s reference documents, and Settings to connect your EHR. Your admin can customize AI governance settings for your organization.',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {steps.map(step => (
        <div key={step.n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: '#EFF6FF', color: '#1E88FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800,
          }}>{step.n}</div>
          <div>
            <div style={{ fontWeight: 700, color: '#1E3347', marginBottom: 4 }}>{step.title}</div>
            <div style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.6 }}>{step.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance doc content — ISP summary
// ─────────────────────────────────────────────────────────────────────────────
function IspContent() {
  const sections = [
    { title: 'Information Classification', body: 'PHI and restricted data, confidential business data, internal information, and public content are classified separately with distinct handling requirements.' },
    { title: 'Access Control', body: 'Least-privilege access for all accounts. MFA mandatory for all access to production systems and the myABA.ai application. Quarterly IAM access reviews. Employee access revoked within 24 hours of termination.' },
    { title: 'Cryptography', body: 'TLS 1.2 minimum (TLS 1.3 preferred) for data in transit; HSTS enforced. EHR credentials encrypted at rest with AES-256-GCM. Secrets managed via Google Secret Manager — never committed to source control.' },
    { title: 'Vulnerability Management', body: 'OWASP Dependency-Check runs on every build; build fails on CVSS ≥ 7.0. Critical vulnerabilities patched within 7 days of disclosure, High within 30 days. Annual penetration test by independent firm.' },
    { title: 'Logging & Monitoring', body: 'All AI calls, document generations, and review decisions logged with user ID, source IP, correlation ID, and timestamp. Logs retained 7 years. Cloud Monitoring alerts on anomalies.' },
    { title: 'Data Retention', body: 'Audit logs retained 7 years (automated nightly purge via DataRetentionService). Customer data deleted within 30 days of contract end. Retention exceptions require Security Lead and Legal approval.' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {sections.map(s => (
        <div key={s.title}>
          <div style={{ fontWeight: 700, color: '#1E3347', marginBottom: 4 }}>{s.title}</div>
          <div style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.6 }}>{s.body}</div>
        </div>
      ))}
      <div style={{ background: '#F0F6FF', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#1E88FF' }}>
        Full policy document available to enterprise customers and auditors under NDA. Contact <a href="mailto:compliance@myaba.ai" style={{ color: '#1E88FF' }}>compliance@myaba.ai</a>.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance doc content — Data Retention
// ─────────────────────────────────────────────────────────────────────────────
function RetentionContent() {
  const rows = [
    ['Audit logs', '7 years', 'Automated nightly purge'],
    ['AI-generated documents', 'Contract term + 1 year', 'Customer-initiated or contract-end'],
    ['Chat sessions', '90 days of inactivity', 'Automated (planned)'],
    ['EHR credentials', 'Integration term + 30 days', 'Firestore deletion + key rotation'],
    ['Application logs', '30 days', 'Cloud Logging default retention'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F0F6FF' }}>
            {['Data type', 'Retention period', 'Disposal method'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#1E3347', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([type, period, disposal]) => (
            <tr key={type} style={{ borderBottom: '1px solid #E4EEF3' }}>
              <td style={{ padding: '8px 12px', color: '#1E3347', fontWeight: 500 }}>{type}</td>
              <td style={{ padding: '8px 12px', color: '#5A7184' }}>{period}</td>
              <td style={{ padding: '8px 12px', color: '#5A7184' }}>{disposal}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ background: '#F0F6FF', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#1E88FF' }}>
        Full policy available to enterprise customers and auditors under NDA. Contact <a href="mailto:compliance@myaba.ai" style={{ color: '#1E88FF' }}>compliance@myaba.ai</a>.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance doc content — ACLX AI Output Governance
// ─────────────────────────────────────────────────────────────────────────────
function AclxGovernanceContent() {
  const capabilities = [
    ['Governance & Policy',      'Rego policy-as-code evaluated per-request by OPA. Every AI response evaluated at /evaluate before delivery. Sensitivity thresholds and escalation rules configurable per organization.'],
    ['Identity-Aware Controls',  'Every evaluation is scoped to the requesting user\'s role, purpose, and organization. Role-gated content rules differ between clinician, admin, and RBT access levels.'],
    ['Data Security & PHI',      'HIPAA 18-identifier taxonomy, ABA-specific PHI categories, minimum necessary enforcement, and hard-blocks for SUD (42 CFR Part 2), psychotherapy notes, HIV status, and genetic information.'],
    ['Threat Detection',         'Groundedness scoring compares AI output against authoritative source documents. Semantic detector flags prompt injection and behavioral anomalies. Sensitivity scoring detects policy drift.'],
    ['Least Agency Enforcement', 'ALLOW / REDACT / BLOCK / ESCALATE decision ladder. Controls not just what the AI can access, but what it is permitted to output autonomously. ESCALATE routes to human reviewer before delivery.'],
    ['Audit Trail',              'Every evaluation logged with content_id, identity snapshot, detector findings, sensitivity label, and decision. Retention configurable; 7-year default for HIPAA compliance.'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.6 }}>
        myABA.ai uses <strong>ACLX</strong> (AI Content Lifecycle eXchange) as its AI output governance layer.
        ACLX sits between the AI model and the end user, evaluating every response before delivery.
        It is developed by ACLX, Inc. — the parent company of myABA.ai.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {capabilities.map(([cap, desc], i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: i < capabilities.length - 1 ? '1px solid #EEF2F5' : 'none' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1E3347', marginBottom: 3 }}>{cap}</p>
            <p style={{ fontSize: 13, color: '#5A7184', lineHeight: 1.55 }}>{desc}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#8A9BAB', lineHeight: 1.5 }}>
        For technical inquiries: <a href="mailto:compliance@myaba.ai" style={{ color: '#1E88FF' }}>compliance@myaba.ai</a>
      </p>
    </div>
  );
}

// Compliance doc content — Vulnerability Disclosure
// ─────────────────────────────────────────────────────────────────────────────
function VulnDisclosureContent() {
  const slas = [
    ['Acknowledgement', '2 business days'],
    ['Initial assessment', '5 business days'],
    ['Remediation plan communicated', '10 business days'],
    ['Patch — Critical/High (CVSS ≥ 7.0)', '30 days'],
    ['Patch — Medium', '60 days'],
    ['Patch — Low', 'Next release cycle'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.6 }}>If you discover a security vulnerability in myABA.ai, please report it privately before public disclosure. Do <strong>not</strong> open a public issue.</p>
      <div style={{ background: '#F0F9EE', border: '1px solid #C5E8B7', borderRadius: 8, padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, color: '#2E7D22', marginBottom: 4 }}>Report to</div>
        <a href="mailto:security@myaba.ai" style={{ color: '#2E7D22', fontSize: 14 }}>security@myaba.ai</a>
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#1E3347', marginBottom: -8 }}>Response commitments</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {slas.map(([milestone, target]) => (
            <tr key={milestone} style={{ borderBottom: '1px solid #E4EEF3' }}>
              <td style={{ padding: '8px 12px', color: '#1E3347' }}>{milestone}</td>
              <td style={{ padding: '8px 12px', color: '#5A7184', fontWeight: 500 }}>{target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: '#5A7184', lineHeight: 1.6 }}>We coordinate public disclosure timing with the reporter and credit researchers who wish to be acknowledged.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E3347', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #E4EEF3' }}>{title}</h3>
      <div style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Document card
// ─────────────────────────────────────────────────────────────────────────────
function DocCard({ doc, open, onToggle }: { doc: DocCard; open: boolean; onToggle: () => void }) {
  const canExpand = doc.cta === 'view' && doc.content;

  const ctaStyles: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.15s', border: 'none',
  };

  const renderCta = () => {
    if (doc.cta === 'coming-soon') {
      return <span style={{ ...ctaStyles, background: '#F0F4F8', color: '#94A3B8', cursor: 'default' }}>Coming soon</span>;
    }
    if (doc.cta === 'request') {
      return <a href={doc.ctaHref} style={{ ...ctaStyles, background: '#F0F6FF', color: '#1E88FF', textDecoration: 'none' }}>{doc.ctaLabel || 'Request'}</a>;
    }
    if (doc.cta === 'email') {
      return <a href={doc.ctaHref} style={{ ...ctaStyles, background: '#F0F9EE', color: '#2E7D22', textDecoration: 'none' }}>{doc.ctaLabel || 'Contact us'}</a>;
    }
    if (doc.cta === 'link') {
      return <a href={doc.ctaHref} style={{ ...ctaStyles, background: '#F0F6FF', color: '#1E88FF', textDecoration: 'none' }}>{doc.ctaLabel || 'Read'}</a>;
    }
    // view
    return (
      <button onClick={onToggle} style={{ ...ctaStyles, background: open ? '#1E3347' : '#F0F6FF', color: open ? 'white' : '#1E88FF' }}>
        {open ? 'Close' : 'View'}
        <IconChevron open={open} />
      </button>
    );
  };

  return (
    <div style={{
      border: `1px solid ${open ? '#1E88FF40' : '#E4EEF3'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#1E3347' }}>{doc.title}</span>
            {doc.badge && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: doc.badgeColor ? `${doc.badgeColor}18` : '#EFF6FF',
                color: doc.badgeColor || '#1E88FF',
              }}>{doc.badge}</span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#5A7184', lineHeight: 1.55, margin: 0 }}>{doc.description}</p>
        </div>
        <div style={{ flexShrink: 0 }}>{renderCta()}</div>
      </div>

      {open && canExpand && (
        <div style={{ borderTop: '1px solid #E4EEF3', padding: '24px', background: '#FAFCFF' }}>
          {doc.content}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents Page
// ─────────────────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'guides';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggle = (id: string) => setOpenDoc(prev => prev === id ? null : id);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'guides',     label: 'Guides',               icon: <IconBook /> },
    { id: 'compliance', label: 'Compliance & Security', icon: <IconShield /> },
    { id: 'legal',      label: 'Legal',                icon: <IconFile /> },
  ];

  const GUIDES: DocCard[] = [
    {
      id: 'quick-start',
      title: 'Quick Start Guide',
      description: 'Get up and running in 5 steps — from accepting your invite to generating your first clinical document.',
      badge: '5 min read',
      badgeColor: '#3F9B2F',
      cta: 'view',
      content: <QuickStartContent />,
    },
    {
      id: 'user-guide',
      title: 'User Guide',
      description: 'Complete reference for clinical staff — chat sessions, document generation, review queue, templates, and client management.',
      badge: 'All users',
      badgeColor: '#1E88FF',
      cta: 'view',
      content: <UserGuideContent />,
    },
    {
      id: 'admin-guide',
      title: 'Administrator Guide',
      description: 'Organization setup, team management, EHR integrations, AI governance configuration, and review queue management.',
      badge: 'Admins',
      badgeColor: '#F5A623',
      cta: 'view',
      content: <AdminGuideContent />,
    },
    {
      id: 'ehr-guide',
      title: 'EHR Integration Guide',
      description: 'Step-by-step instructions for connecting CentralReach, Rethink, and importing client rosters from OfficePuzzle.',
      badge: 'Integrations',
      badgeColor: '#7C3AED',
      cta: 'view',
      content: <EhrGuideContent />,
    },
  ];

  const COMPLIANCE: DocCard[] = [
    {
      id: 'aclx-governance',
      title: 'AI Output Governance — ACLX',
      description: 'myABA.ai uses ACLX as its AI output governance layer. ACLX independently implements governance, identity-aware access control, data security, threat management, and Least Agency enforcement — constraining what AI is permitted to output autonomously, not just what it can access.',
      badge: 'AI Governance',
      badgeColor: '#2E6B20',
      cta: 'view',
      content: <AclxGovernanceContent />,
    },
    {
      id: 'isp',
      title: 'Information Security Policy',
      description: 'Covers data classification, access control, cryptography standards, vulnerability management, logging, and retention requirements.',
      badge: 'SOC 2 CC6',
      badgeColor: '#1E88FF',
      cta: 'view',
      content: <IspContent />,
    },
    {
      id: 'retention',
      title: 'Data Retention Policy',
      description: 'Retention periods for all data types — audit logs (7 years), documents, chat history, EHR credentials — and secure disposal methods.',
      badge: 'HIPAA §164.316',
      badgeColor: '#1E88FF',
      cta: 'view',
      content: <RetentionContent />,
    },
    {
      id: 'vuln-disclosure',
      title: 'Vulnerability Disclosure Policy',
      description: 'How to report a security vulnerability, our response commitments (48-hour acknowledgement, 30-day patch for Critical/High), and disclosure coordination.',
      badge: 'Public',
      badgeColor: '#3F9B2F',
      cta: 'view',
      content: <VulnDisclosureContent />,
    },
    {
      id: 'irp',
      title: 'Incident Response Plan',
      description: 'Six-phase HIPAA-aware response playbook: detection, containment, investigation, breach assessment, recovery, and post-mortem.',
      badge: 'Internal',
      badgeColor: '#94A3B8',
      cta: 'request',
      ctaLabel: 'Request under NDA',
      ctaHref: 'mailto:compliance@myaba.ai?subject=Incident%20Response%20Plan%20Request',
    },
    {
      id: 'vrr',
      title: 'Vendor Risk Register',
      description: 'Google Cloud / Firebase, Google Gemini via Vertex AI, CentralReach, Rethink, OfficePuzzle — BAA status, certifications, and risk tier for each.',
      badge: 'Internal',
      badgeColor: '#94A3B8',
      cta: 'request',
      ctaLabel: 'Request under NDA',
      ctaHref: 'mailto:compliance@myaba.ai?subject=Vendor%20Risk%20Register%20Request',
    },
    {
      id: 'hipaa-baa',
      title: 'HIPAA Business Associate Agreement',
      description: 'A signed BAA is required before your organization may process PHI on myABA.ai. The BAA is executed during the onboarding flow.',
      badge: 'Required',
      badgeColor: '#EF4444',
      cta: 'email',
      ctaLabel: 'Request BAA template',
      ctaHref: 'mailto:compliance@myaba.ai?subject=BAA%20Template%20Request',
    },
    {
      id: 'soc2',
      title: 'SOC 2 Type II Report',
      description: 'Independent third-party audit of security, availability, and confidentiality controls. Audit currently in progress — report will be available under NDA when complete.',
      badge: 'In progress',
      badgeColor: '#F5A623',
      cta: 'email',
      ctaLabel: 'Notify me when ready',
      ctaHref: 'mailto:compliance@myaba.ai?subject=SOC%202%20Report%20Notification%20Request',
    },
  ];

  const LEGAL: DocCard[] = [
    {
      id: 'privacy',
      title: 'Privacy Policy',
      description: 'How myABA.ai collects, uses, and protects personal information for users of the platform and visitors to myaba.ai.',
      cta: 'link',
      ctaHref: '/privacy',
      ctaLabel: 'Read',
    },
    {
      id: 'tos',
      title: 'Terms of Service',
      description: 'The agreement governing use of the myABA.ai platform, including acceptable use, service availability, and liability provisions.',
      cta: 'link',
      ctaHref: '/terms',
      ctaLabel: 'Read',
    },
    {
      id: 'dpa',
      title: 'Data Processing Addendum',
      description: 'Controller/processor terms for non-PHI personal data, including CCPA/CPRA service-provider certification. PHI is governed by the BAA.',
      cta: 'link',
      ctaHref: '/dpa',
      ctaLabel: 'Read',
    },
  ];

  const tabDocs: Record<Tab, DocCard[]> = {
    guides: GUIDES,
    compliance: COMPLIANCE,
    legal: LEGAL,
  };

  return (
    <>
      <NavBar />
      <main style={{ paddingTop: 64 }}>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(160deg, #F0F6FF 0%, #FAFCFF 100%)', padding: '64px 24px 56px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E88FF', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
              Documentation & Resources
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, color: '#1E3347', letterSpacing: '-0.02em', marginBottom: 16 }}>
              Everything you need to get started
            </h1>
            <p style={{ fontSize: 16, color: '#5A7184', lineHeight: 1.65, maxWidth: 520, margin: '0 auto' }}>
              User and administrator guides, compliance documentation, security policies, and legal agreements — all in one place.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #E4EEF3', background: 'white', position: 'sticky', top: 64, zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setOpenDoc(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '16px 20px', fontSize: 14, fontWeight: 600,
                  color: activeTab === tab.id ? '#1E88FF' : '#5A7184',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid #1E88FF' : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                  marginBottom: -1,
                }}
              >
                <span style={{ color: activeTab === tab.id ? '#1E88FF' : '#94A3B8' }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Documents list */}
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>
          {/* Tab description */}
          {activeTab === 'guides' && (
            <p style={{ fontSize: 14, color: '#5A7184', marginBottom: 24 }}>
              In-product guides for clinical staff and administrators. Click <strong>View</strong> on any guide to read it inline.
            </p>
          )}
          {activeTab === 'compliance' && (
            <p style={{ fontSize: 14, color: '#5A7184', marginBottom: 24 }}>
              Security and compliance documentation. Summaries are public; full documents are available to enterprise customers and auditors under NDA.
            </p>
          )}
          {activeTab === 'legal' && (
            <p style={{ fontSize: 14, color: '#5A7184', marginBottom: 24 }}>
              Legal agreements governing use of the myABA.ai platform.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tabDocs[activeTab].map(doc => (
              <DocCard
                key={doc.id}
                doc={doc}
                open={openDoc === doc.id}
                onToggle={() => toggle(doc.id)}
              />
            ))}
          </div>

          {/* Compliance footer note */}
          {activeTab === 'compliance' && (
            <div style={{ marginTop: 32, padding: '20px 24px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E4EEF3' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ color: '#3F9B2F', flexShrink: 0, marginTop: 2 }}><IconCheck /></div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1E3347', marginBottom: 4 }}>Enterprise compliance package</div>
                  <div style={{ fontSize: 13, color: '#5A7184', lineHeight: 1.6 }}>
                    Enterprise customers can request a compliance package including the full Information Security Policy, Incident Response Plan, Vendor Risk Register, penetration test summary, and SOC 2 report (when available). Contact <a href="mailto:compliance@myaba.ai" style={{ color: '#1E88FF' }}>compliance@myaba.ai</a>.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
