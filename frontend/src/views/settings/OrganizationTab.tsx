import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding, faCopy, faCheck, faShieldHeart, faFileSignature,
  faDownload, faShieldHalved, faKey, faRightToBracket, faClock, faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../../lib/api';
import type { Org, AgreementStatus } from '../../types';
import {
  SettingsCard, Badge, Toggle, SelectPill, SettingRow,
  PrimaryButton, SecondaryButton,
} from '../../components/settings/primitives';

const SENSITIVITY_OPTIONS = [
  { value: '',       label: 'ACLX default' },
  { value: 'HIGH',   label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW',    label: 'Low' },
];

const PLAN_LABEL: Record<string, string> = {
  solo: 'Solo', team: 'Team', enterprise: 'Enterprise', dev: 'Dev',
};

export default function OrganizationTab({
  orgId, isAdmin, onNavigateTab,
}: {
  orgId: string;
  isAdmin: boolean;
  onNavigateTab: (tab: string) => void;
}) {
  const [org, setOrg]               = useState<Org | null>(null);
  const [baa, setBaa]               = useState<AgreementStatus | null>(null);
  const [contract, setContract]     = useState<AgreementStatus | null>(null);
  const [sensitivity, setSensitivity] = useState('');
  const [aclxEnabled, setAclxEnabled]     = useState(true);
  const [reviewRequired, setReviewRequired] = useState(true);

  const [editing, setEditing]   = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [copied, setCopied]     = useState(false);
  const [signing, setSigning]   = useState<null | 'baa' | 'contract'>(null);

  useEffect(() => {
    if (!orgId) return;
    api.getOrg(orgId).then((o) => {
      setOrg(o);
      setNameDraft(o.name ?? '');
      setAclxEnabled(o.settings?.aclxEnabled ?? true);
      setReviewRequired(o.settings?.reviewRequired ?? true);
    }).catch(() => {});
    api.getBaaStatus(orgId).then((s) => setBaa(s as AgreementStatus)).catch(() => {});
    api.getServiceContractStatus(orgId).then((s) => setContract(s as AgreementStatus)).catch(() => {});
    api.getOrgAclxPolicy(orgId).then((p) => setSensitivity((p?.escalateAtSensitivity as string) ?? '')).catch(() => {});
  }, [orgId]);

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || !org) { setEditing(false); return; }
    await api.updateOrgName(orgId, name).catch(() => {});
    setOrg({ ...org, name });
    // Keep the sidebar org-name in sync without a refresh.
    window.dispatchEvent(new CustomEvent('org:updated', { detail: { name } }));
    setEditing(false);
  };

  const toggleAclx = async (next: boolean) => {
    setAclxEnabled(next);
    await api.updateOrgSettings(orgId, { aclxEnabled: next }).catch(() => {});
  };
  const toggleReview = async (next: boolean) => {
    setReviewRequired(next);
    await api.updateOrgSettings(orgId, { reviewRequired: next }).catch(() => {});
  };
  const changeSensitivity = async (v: string) => {
    setSensitivity(v);
    if (v) await api.setOrgPolicySensitivity(orgId, v).catch(() => {});
  };

  const copyId = () => {
    navigator.clipboard?.writeText(orgId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const planLabel = org ? (PLAN_LABEL[String(org.plan)] ?? String(org.plan)) : '—';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 max-w-6xl">
      {/* ── Left column ─────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Organization Details */}
        <SettingsCard
          icon={faBuilding}
          title="Organization Details"
          action={isAdmin && !editing
            ? <SecondaryButton icon={faKey} onClick={() => { setNameDraft(org?.name ?? ''); setEditing(true); }}>Edit Details</SecondaryButton>
            : editing
              ? <div className="flex gap-2">
                  <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
                  <PrimaryButton icon={faCheck} onClick={saveName}>Save</PrimaryButton>
                </div>
              : undefined}
        >
          <div className="px-5 sm:px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Organization Name</div>
              {editing
                ? <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                : <div className="text-sm font-semibold text-gray-900">{org?.name ?? '—'}</div>}
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Organization ID</div>
              <button onClick={copyId} className="inline-flex items-center gap-2 text-sm font-mono text-gray-600 hover:text-teal-700" title="Copy organization ID">
                {orgId || '—'}
                <FontAwesomeIcon icon={copied ? faCheck : faCopy} className={copied ? 'text-green-600' : 'text-gray-400'} style={{ fontSize: 12 }} />
              </button>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Plan</div>
              <Badge tone="blue">{planLabel}</Badge>
            </div>
          </div>
        </SettingsCard>

        {/* Compliance & AI Governance */}
        <SettingsCard icon={faShieldHeart} title="Compliance & AI Governance" subtitle="Configure compliance safeguards and AI governance controls.">
          <div className="px-5 sm:px-6 pb-2">
            <div className="rounded-xl border px-4 py-3 mb-2" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#166534' }}>
                <FontAwesomeIcon icon={faShieldHalved} /> AI Output Governance — ACLX {aclxEnabled ? 'Enabled' : 'Disabled'}
              </div>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#3f6e4e' }}>
                All AI responses are evaluated by the ACLX governance layer before delivery — enforcing identity-aware
                content controls, PHI safeguards, and <strong>Least Agency</strong>: constraining not just what the AI can
                access, but what it is permitted to output autonomously.
              </p>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            <SettingRow
              icon={faFileSignature}
              title="Enable ACLX"
              description="Labels and governs all AI-generated output for HIPAA compliance."
              control={<Toggle checked={aclxEnabled} onChange={toggleAclx} disabled={!isAdmin} label="Enable ACLX" />}
            />
            <SettingRow
              icon={faFileSignature}
              title="Data Loss Prevention (DLP)"
              description="Scans all user input before it reaches the AI. Blocks non-clinical identifiers."
              control={<Badge tone="green">Always on</Badge>}
            />
            <SettingRow
              icon={faFileSignature}
              title="AI Output Audit Log"
              description="Every ACLX decision is permanently logged for compliance review."
              control={<Badge tone="green">Always on</Badge>}
            />
            <SettingRow
              icon={faClock}
              title="Escalation Sensitivity"
              description="Minimum sensitivity level at which ACLX flags AI output for review."
              control={<SelectPill ariaLabel="Escalation sensitivity" tone="neutral" value={sensitivity} options={SENSITIVITY_OPTIONS} onChange={changeSensitivity} disabled={!isAdmin} />}
            />
            <SettingRow
              icon={faFileSignature}
              title="Human Review Required"
              description="When on, flagged responses are held until a reviewer approves them."
              control={<Toggle checked={reviewRequired} onChange={toggleReview} disabled={!isAdmin} label="Human review required" />}
            />
          </div>
          <button
            onClick={() => onNavigateTab('content_rules')}
            className="w-full text-left px-5 sm:px-6 py-3.5 text-sm font-semibold text-teal-700 hover:bg-gray-50 border-t border-gray-100 rounded-b-2xl"
          >
            Configure Full ACLX Settings →
          </button>
        </SettingsCard>
      </div>

      {/* ── Right column ────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Agreements */}
        <SettingsCard icon={faFileSignature} title="Agreements">
          <div className="px-5 sm:px-6 pb-5 space-y-5">
            <Agreement
              label="Business Associate Agreement (BAA)"
              hint="Required under 45 C.F.R. § 164.504(e) before PHI may be processed."
              status={baa}
              onSign={() => setSigning('baa')}
              onDownload={() => api.downloadBaa(orgId).catch(() => {})}
              canSign={isAdmin}
            />
            <div className="border-t border-gray-100" />
            <Agreement
              label="Service Contract"
              hint="Your organization's service agreement with myABA."
              status={contract}
              onSign={() => setSigning('contract')}
              onDownload={() => api.downloadServiceContract(orgId).catch(() => {})}
              canSign={isAdmin}
            />
          </div>
        </SettingsCard>

        {/* Security Overview */}
        <SettingsCard icon={faShieldHalved} title="Security Overview">
          <div className="divide-y divide-gray-100">
            <SettingRow
              title="Two-Factor Authentication"
              description="Enforced for all users"
              control={<Badge tone="green">Enforced</Badge>}
              onClick={() => onNavigateTab('security')}
            />
            <SettingRow
              title="Authentication Methods"
              description="Manage how users sign in"
              control={<FontAwesomeIcon icon={faChevronRight} className="text-gray-300" />}
              onClick={() => onNavigateTab('security')}
            />
            <SettingRow
              icon={faRightToBracket}
              title="Google Sign-In"
              control={<Badge tone="neutral">Configurable</Badge>}
              onClick={() => onNavigateTab('security')}
            />
            <SettingRow
              icon={faClock}
              title="Session Timeout"
              control={<span className="text-sm text-gray-500">{org?.settings?.sessionTimeoutMinutes ?? 15} minutes</span>}
              onClick={() => onNavigateTab('security')}
            />
          </div>
          <button
            onClick={() => onNavigateTab('security')}
            className="w-full text-left px-5 sm:px-6 py-3.5 text-sm font-semibold text-teal-700 hover:bg-gray-50 border-t border-gray-100 rounded-b-2xl"
          >
            View Security Settings →
          </button>
        </SettingsCard>
      </div>

      {signing && (
        <SignModal
          kind={signing}
          onClose={() => setSigning(null)}
          onSigned={(s) => { signing === 'baa' ? setBaa(s) : setContract(s); setSigning(null); }}
          orgId={orgId}
        />
      )}
    </div>
  );
}

// ── Agreement row ──────────────────────────────────────────────────────────────
function Agreement({
  label, hint, status, onSign, onDownload, canSign,
}: {
  label: string; hint: string;
  status: AgreementStatus | null;
  onSign: () => void; onDownload: () => void; canSign: boolean;
}) {
  const signed = status?.accepted;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{label}</div>
          {signed
            ? <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                Signed by {status?.signerName ?? '—'}{status?.signerTitle ? ` (${status.signerTitle})` : ''}
                {status?.acceptedAt ? ` · ${new Date(status.acceptedAt).toLocaleDateString()}` : ''}
                {status?.version ? ` · v${status.version}` : ''}
              </div>
            : <div className="text-xs text-gray-500 mt-1 leading-relaxed">{hint}</div>}
        </div>
        <Badge tone={signed ? 'green' : 'amber'}>{signed ? 'Signed' : 'Not Signed'}</Badge>
      </div>
      <div className="mt-3">
        {signed
          ? <SecondaryButton icon={faDownload} onClick={onDownload}>Download signed</SecondaryButton>
          : <PrimaryButton icon={faFileSignature} onClick={onSign} disabled={!canSign}>Sign {label.includes('BAA') ? 'BAA' : 'Service Contract'}</PrimaryButton>}
      </div>
    </div>
  );
}

// ── Sign modal ─────────────────────────────────────────────────────────────────
function SignModal({
  kind, orgId, onClose, onSigned,
}: {
  kind: 'baa' | 'contract'; orgId: string;
  onClose: () => void; onSigned: (s: AgreementStatus) => void;
}) {
  const [name, setName]   = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy]   = useState(false);
  const label = kind === 'baa' ? 'Business Associate Agreement' : 'Service Contract';

  const submit = async () => {
    if (!name.trim() || !title.trim()) return;
    setBusy(true);
    try {
      const fn = kind === 'baa' ? api.acceptBaa : api.acceptServiceContract;
      await fn(orgId, { signerName: name.trim(), signerTitle: title.trim() });
      onSigned({ accepted: true, signerName: name.trim(), signerTitle: title.trim(), acceptedAt: new Date().toISOString() });
    } catch { onClose(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(15,35,45,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Sign ${label}`} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900">Sign {label}</h3>
        <p className="text-sm text-gray-500 mt-1">Enter the signer's name and title to record acceptance.</p>
        <div className="mt-4 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Signer full name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Signer title (e.g. Owner, BCBA)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy || !name.trim() || !title.trim()}>{busy ? 'Signing…' : 'Sign & Accept'}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
