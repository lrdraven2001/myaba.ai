import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding, faShieldAlt, faCreditCard, faSpinner,
  faSlidersH, faToggleOn, faToggleOff, faMinus, faCheck, faLock,
  faMobileAlt, faPlus, faTimes, faPen, faFileContract,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { BAA_TEXT } from '../lib/baaText';
import type { Org, OrgAclxPolicy } from '../types';

const SENSITIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH:   { bg: '#fee2e2', text: '#991b1b' },
  MEDIUM: { bg: '#fef9c3', text: '#854d0e' },
  LOW:    { bg: '#f0fdf4', text: '#166534' },
};

type Tab = 'org' | 'roles' | 'security' | 'billing';

const TABS: { id: Tab; icon: typeof faBuilding; label: string }[] = [
  { id: 'org',      icon: faBuilding,   label: 'Organization'        },
  { id: 'roles',    icon: faSlidersH,   label: 'Roles & Permissions' },
  { id: 'security', icon: faShieldAlt,  label: 'Security'            },
  { id: 'billing',  icon: faCreditCard, label: 'Billing'             },
];

export default function SettingsView() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('org');

  const isAdmin   = currentUser?.role === 'ORG_SUPER_ADMIN';
  const orgId     = currentUser?.orgId ?? '';

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* Settings sidebar */}
      <div className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col pt-6 pb-4">
        <div className="px-5 mb-5">
          <h2 className="text-base font-semibold text-gray-800">Settings</h2>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                activeTab === t.id ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={activeTab === t.id ? { background: '#2a5f6f' } : {}}
            >
              <FontAwesomeIcon icon={t.icon} className="w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content — OrgTab owns its own scroll + pinned footer; other tabs use the shared scroller */}
      {activeTab === 'org'
        ? <OrgTab orgId={orgId} isAdmin={isAdmin} />
        : (
          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === 'roles'    && <RolesTab isAdmin={isAdmin} orgId={orgId} />}
            {activeTab === 'security' && <SecurityTab orgId={orgId} isAdmin={isAdmin} />}
            {activeTab === 'billing'  && <BillingTab />}
          </div>
        )
      }
    </div>
  );
}

// ── Organization tab ──────────────────────────────────────────────────────────

function OrgTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [org, setOrg]         = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('');

  // Insurance companies
  const [insurers, setInsurers]     = useState<string[]>([]);
  const [newInsurer, setNewInsurer] = useState('');

  // Compliance & AI Governance
  const [aclxEnabled, setAclxEnabled]       = useState(true);
  const [reviewRequired, setReviewRequired] = useState(true);
  const [sensitivity, setSensitivity]       = useState('');

  // ACLX policy (loaded)
  const [aclxPolicy, setAclxPolicy] = useState<OrgAclxPolicy | null>(null);

  // BAA status
  type BaaStatus = {
    accepted: boolean;
    acceptedAt?: string;
    acceptedBy?: string;
    signerName?: string;
    signerTitle?: string;
    version?: string;
  };
  const [baaStatus,    setBaaStatus]    = useState<BaaStatus | null>(null);
  // BAA self-service sign form
  const [baaExpanded,  setBaaExpanded]  = useState(false);
  const [baaName,      setBaaName]      = useState('');
  const [baaTitle,     setBaaTitle]     = useState('');
  const [baaChecked,   setBaaChecked]   = useState(false);
  const [baaSaving,    setBaaSaving]    = useState(false);
  const [baaError,     setBaaError]     = useState('');

  // "Last saved" snapshots — used by dirty check and Cancel
  const [origName, setOrigName]                   = useState('');
  const [origInsurers, setOrigInsurers]           = useState<string[]>([]);
  const [origSensitivity, setOrigSensitivity]     = useState('');
  const [origAclxEnabled, setOrigAclxEnabled]     = useState(true);
  const [origReviewRequired, setOrigReviewRequired] = useState(true);


  // Single save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  // Load
  useEffect(() => {
    Promise.all([
      api.getOrg(orgId),
      api.getOrgAclxPolicy(orgId).catch(() => null),
      api.getInsuranceCompanies(orgId).catch(() => ({ companies: [] as string[] })),
      api.getBaaStatus(orgId).catch(() => null),
    ]).then(([o, policy, ins, baa]) => {
      const name      = o.name ?? '';
      const sens      = policy?.escalateAtSensitivity ?? '';
      const companies = ins.companies ?? [];
      const s         = o.settings ?? {};

      // Read governance toggles from org settings — default true (safe)
      const revReq = s.reviewRequired !== false;
      const aclxEn = s.aclxEnabled    !== false;

      setOrg(o);
      setOrgName(name);
      if (policy) { setAclxPolicy(policy); }
      setSensitivity(sens);
      setInsurers(companies);
      setReviewRequired(revReq);
      setAclxEnabled(aclxEn);
      if (baa) setBaaStatus(baa);

      // Snapshots for dirty check + cancel
      setOrigName(name);
      setOrigSensitivity(sens);
      setOrigInsurers(companies);
      setOrigReviewRequired(revReq);
      setOrigAclxEnabled(aclxEn);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleAddInsurer = () => {
    const name = newInsurer.trim();
    if (!name || insurers.includes(name)) return;
    setInsurers((prev) => [...prev, name].sort((a, b) => a.localeCompare(b)));
    setNewInsurer('');
  };

  const handleRemoveInsurer = (name: string) => {
    setInsurers((prev) => prev.filter((i) => i !== name));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        orgName.trim() ? api.updateOrgName(orgId, orgName).catch(() => {}) : Promise.resolve(),
        api.setInsuranceCompanies(orgId, insurers).catch(() => {}),
        sensitivity
          ? api.setOrgPolicySensitivity(orgId, sensitivity).catch(() => {})
          : Promise.resolve(),
        api.updateOrgSettings(orgId, {
          reviewRequired,
          aclxEnabled,
        }).catch(() => {}),
      ]);
      // Advance all snapshots to current values
      setOrigName(orgName);
      setOrigInsurers([...insurers]);
      setOrigSensitivity(sensitivity);
      setOrigAclxEnabled(aclxEnabled);
      setOrigReviewRequired(reviewRequired);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const handleCancel = () => {
    setOrgName(origName);
    setInsurers([...origInsurers]);
    setSensitivity(origSensitivity);
    setAclxEnabled(origAclxEnabled);
    setReviewRequired(origReviewRequired);
    setNewInsurer('');
  };

  const handleAcceptBaa = async () => {
    if (!baaName.trim() || !baaTitle.trim() || !baaChecked) return;
    setBaaSaving(true);
    setBaaError('');
    try {
      const result = await api.acceptBaa(orgId, {
        signerName:  baaName.trim(),
        signerTitle: baaTitle.trim(),
      });
      setBaaStatus(result);
      setBaaExpanded(false);
      setBaaName('');
      setBaaTitle('');
      setBaaChecked(false);
    } catch (e: unknown) {
      setBaaError(e instanceof Error ? e.message : 'Failed to record BAA acceptance');
    } finally {
      setBaaSaving(false);
    }
  };


  // True whenever any field differs from the last-saved snapshot
  const dirty =
    orgName !== origName ||
    sensitivity !== origSensitivity ||
    JSON.stringify(insurers) !== JSON.stringify(origInsurers) ||
    aclxEnabled    !== origAclxEnabled    ||
    reviewRequired !== origReviewRequired;

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

    {/* ── Scrollable form area ── */}
    <div className="flex-1 overflow-y-auto p-8">
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-1">Organization</h3>
        <p className="text-sm text-gray-500">
          Plan: <span className="font-semibold capitalize">{org?.plan ?? '—'}</span>
        </p>
      </div>

      {/* Org identity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h4 className="font-semibold text-gray-800">Organization Details</h4>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Organization Name
          </label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-gray-50 disabled:text-gray-400"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            disabled={!isAdmin}
            placeholder="Your organization name"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Organization ID
          </label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 font-mono"
            value={orgId || '—'}
            readOnly
          />
        </div>

      </div>

      {/* ── Business Associate Agreement ── */}
      <div className={`bg-white rounded-xl border p-6 ${baaStatus?.accepted ? 'border-gray-200' : 'border-amber-300'}`}>

        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: baaStatus?.accepted ? '#e8f4f8' : '#fef3c7' }}
            >
              <FontAwesomeIcon
                icon={faFileContract}
                style={{ color: baaStatus?.accepted ? '#2a5f6f' : '#d97706', fontSize: 16 }}
              />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 text-sm">Business Associate Agreement</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Required under 45 C.F.R. § 164.504(e) before PHI may be processed.
              </p>
            </div>
          </div>
          {baaStatus?.accepted ? (
            <span
              className="shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: '#EEF7EA', color: '#2E7D22', border: '1px solid #bbf7d0' }}
            >
              Signed
            </span>
          ) : (
            <span
              className="shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
            >
              Required
            </span>
          )}
        </div>

        {/* Signed — show record */}
        {baaStatus?.accepted && (
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-gray-400 font-medium uppercase tracking-wide">Signed by</span>
              <p className="text-gray-700 font-semibold mt-0.5">{baaStatus.signerName}</p>
              <p className="text-gray-500">{baaStatus.signerTitle}</p>
            </div>
            <div>
              <span className="text-gray-400 font-medium uppercase tracking-wide">Accepted</span>
              <p className="text-gray-700 font-semibold mt-0.5">
                {baaStatus.acceptedAt
                  ? new Date(baaStatus.acceptedAt).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })
                  : '—'}
              </p>
              <p className="text-gray-500">BAA version {baaStatus.version ?? '1.0'}</p>
            </div>
          </div>
        )}

        {/* Not yet signed — CTA or inline form */}
        {!baaStatus?.accepted && (
          <>
            {!baaExpanded ? (
              /* Collapsed state */
              <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Your organization has not signed the Business Associate Agreement.
                  A BAA is required before processing any Protected Health Information.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setBaaExpanded(true)}
                    className="shrink-0 px-4 py-2 rounded-lg text-white text-xs font-semibold transition-opacity"
                    style={{ background: '#2a5f6f' }}
                  >
                    Sign BAA
                  </button>
                )}
              </div>
            ) : (
              /* Expanded sign form */
              <div className="mt-4 space-y-4">

                {/* BAA text */}
                <div
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3 overflow-y-auto text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-mono"
                  style={{ maxHeight: 200 }}
                >
                  {BAA_TEXT}
                </div>

                {/* Signer fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      placeholder="e.g. Jane Smith"
                      value={baaName}
                      onChange={(e) => setBaaName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Title / Position
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      placeholder="e.g. Executive Director"
                      value={baaTitle}
                      onChange={(e) => setBaaTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Authority checkbox */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0 accent-teal-700"
                    checked={baaChecked}
                    onChange={(e) => setBaaChecked(e.target.checked)}
                  />
                  <span className="text-xs text-gray-600 leading-relaxed">
                    I have read the Business Associate Agreement above and have authority to bind
                    my organization to these terms. I accept this BAA on behalf of my organization.
                  </span>
                </label>

                {baaError && <p className="text-xs text-red-500">{baaError}</p>}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleAcceptBaa}
                    disabled={!baaName.trim() || !baaTitle.trim() || !baaChecked || baaSaving}
                    className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition-opacity"
                    style={{
                      background: (baaName.trim() && baaTitle.trim() && baaChecked) ? '#2a5f6f' : '#9ca3af',
                      cursor: (!baaName.trim() || !baaTitle.trim() || !baaChecked || baaSaving) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {baaSaving ? 'Recording…' : 'Accept & Sign BAA'}
                  </button>
                  <button
                    onClick={() => { setBaaExpanded(false); setBaaName(''); setBaaTitle(''); setBaaChecked(false); setBaaError(''); }}
                    className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>

              </div>
            )}
          </>
        )}
      </div>

      {/* Compliance & AI Governance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-0 divide-y divide-gray-100">
        <div className="flex items-center gap-2 pb-4">
          <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#2a5f6f', fontSize: 13 }} />
          <h4 className="font-semibold text-gray-800">Compliance & AI Governance</h4>
        </div>

        {/* Enable ACLX — master switch */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Enable ACLX</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Labels and governs all AI-generated output for HIPAA compliance.
              Disabling removes all output guardrails.
            </p>
          </div>
          <button
            onClick={() => setAclxEnabled((v) => !v)}
            className="shrink-0 transition-colors"
            style={{ color: aclxEnabled ? '#3F9B2F' : '#d1d5db' }}
          >
            <FontAwesomeIcon icon={aclxEnabled ? faToggleOn : faToggleOff} style={{ fontSize: 28 }} />
          </button>
        </div>

        {/* Sub-settings — dimmed when ACLX is off */}
        <div style={{ opacity: aclxEnabled ? 1 : 0.4, pointerEvents: aclxEnabled ? 'auto' : 'none' }}
          className="divide-y divide-gray-100">

          {/* Audit log — always on */}
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">AI Output Audit Log</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Every ACLX decision is permanently logged for compliance review. Required for HIPAA.
              </p>
            </div>
            <span
              className="shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: '#EEF7EA', color: '#2E7D22', border: '1px solid #bbf7d0' }}
            >
              Always on
            </span>
          </div>

          {/* Escalation Sensitivity */}
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Escalation Sensitivity</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Minimum sensitivity level at which ACLX flags AI output for review.
              </p>
            </div>
            <select
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-gray-50 disabled:text-gray-400"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
              disabled={!isAdmin}
            >
              <option value="">ACLX default</option>
              <option value="HIGH">High — flag more frequently</option>
              <option value="MEDIUM">Medium — balanced (recommended)</option>
              <option value="LOW">Low — critical issues only</option>
            </select>
          </div>

          {/* Human Review Required */}
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Human Review Required</p>
              <p className="text-xs text-gray-400 mt-0.5">
                When on, flagged responses are held until a reviewer approves them.
                When off, flagged content is delivered immediately and logged for audit.
              </p>
            </div>
            <button
              onClick={() => setReviewRequired((v) => !v)}
              className="shrink-0 transition-colors"
              style={{ color: reviewRequired ? '#3F9B2F' : '#d1d5db' }}
            >
              <FontAwesomeIcon icon={reviewRequired ? faToggleOn : faToggleOff} style={{ fontSize: 26 }} />
            </button>
          </div>

        </div>
      </div>

      {/* Insurance Companies */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="font-semibold text-gray-800">Insurance Companies</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Defines the dropdown options available when creating or editing a client.
            </p>
          </div>
        </div>

        {/* Tag list */}
        <div className="flex flex-wrap gap-2 mb-4 min-h-[36px]">
          {insurers.length === 0 && (
            <p className="text-sm text-gray-400 italic">No insurance companies configured yet.</p>
          )}
          {insurers.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
              style={{ background: '#f0f9fb', borderColor: '#b2dce8', color: '#1e4d5c' }}
            >
              {name}
              {isAdmin && (
                <button
                  onClick={() => handleRemoveInsurer(name)}
                  className="hover:text-red-500 transition-colors ml-0.5"
                  title={`Remove ${name}`}
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xs" />
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Add input — admin only */}
        {isAdmin && (
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="Add insurance company…"
              value={newInsurer}
              onChange={(e) => setNewInsurer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddInsurer(); }}
            />
            <button
              onClick={handleAddInsurer}
              disabled={!newInsurer.trim()}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-opacity"
              style={{ background: '#2a5f6f' }}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-1.5" />
              Add
            </button>
          </div>
        )}

      </div>

    </div>
    </div>

    {/* ── Pinned action bar — always visible ── */}
    {isAdmin && (
      <div
        className="shrink-0 flex items-center gap-3 px-8 py-4 bg-white border-t border-gray-200"
        style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' }}
      >
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors"
          style={{
            background: saved ? '#16a34a' : dirty ? '#55C943' : '#d1d5db',
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
        <button
          onClick={handleCancel}
          disabled={!dirty || saving}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold border transition-colors"
          style={{
            borderColor: dirty ? '#d1d5db' : '#e5e7eb',
            color: dirty ? '#374151' : '#9ca3af',
            background: 'white',
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    )}

    </div>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────

function SecurityTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [smsBackup, setSmsBackup]     = useState(false);
  const [googleSignIn, setGoogleSignIn] = useState(false);
  const [googleDomain, setGoogleDomain] = useState('');
  const [timeout, setTimeout_]        = useState(15);
  const [saved, setSaved]             = useState(false);

  useEffect(() => {
    api.getOrg(orgId)
      .then((o) => {
        setTimeout_(o.settings?.sessionTimeoutMinutes ?? 15);
      })
      .catch(() => {});
  }, [orgId]);

  const handleSave = async () => {
    try {
      await api.updateOrgSettings(orgId, { sessionTimeoutMinutes: timeout, mfaRequired: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-1">Security</h3>
        <p className="text-sm text-gray-500">
          Authentication, access controls, and identity provider configuration.
        </p>
      </div>

      {/* ── Two-Factor Authentication ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faLock} style={{ color: '#3F9B2F', fontSize: 14 }} />
          <h4 className="font-semibold text-gray-800">Two-Factor Authentication</h4>
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: '#EEF7EA', color: '#2E7D22' }}
          >
            Required
          </span>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-xs text-green-800 leading-relaxed">
          Two-factor authentication is <strong>mandatory</strong> for all users under HIPAA
          compliance requirements and cannot be disabled. All users must enroll before
          accessing the platform.
        </div>

        {/* Enforced — not a toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-800">Enforce 2FA for all users</p>
            <p className="text-xs text-gray-400 mt-0.5">Mandatory — required for HIPAA compliance.</p>
          </div>
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: '#EEF7EA', color: '#2E7D22' }}
          >
            Enforced
          </span>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Authentication Methods
          </p>
          <div className="space-y-3">
            {/* Authenticator app — always required */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#EEF7EA' }}
                >
                  <FontAwesomeIcon icon={faMobileAlt} style={{ color: '#3F9B2F', fontSize: 13 }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Authenticator App</p>
                  <p className="text-xs text-gray-400">Google Authenticator, Authy, Microsoft Authenticator</p>
                </div>
              </div>
              <span
                className="px-3 py-1 rounded-full text-xs font-semibold shrink-0"
                style={{ background: '#EEF7EA', color: '#2E7D22' }}
              >
                Required
              </span>
            </div>

            {/* SMS backup — optional */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#f3f4f6' }}
                >
                  <FontAwesomeIcon icon={faMobileAlt} style={{ color: '#6b7280', fontSize: 13 }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">SMS as backup method</p>
                  <p className="text-xs text-gray-400">Allow users to receive 2FA codes via SMS</p>
                </div>
              </div>
              <button
                onClick={() => isAdmin && setSmsBackup((v) => !v)}
                disabled={!isAdmin}
                style={{ color: smsBackup ? '#3F9B2F' : '#d1d5db' }}
              >
                <FontAwesomeIcon icon={smsBackup ? faToggleOn : faToggleOff} style={{ fontSize: 22 }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Google Sign-In ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          {/* Google "G" badge */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #4285F4 0%, #34A853 50%, #EA4335 100%)' }}
          >
            G
          </div>
          <h4 className="font-semibold text-gray-800">Google Sign-In</h4>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Allow users to authenticate with their Google Workspace account.
          Google's own 2-step verification satisfies the 2FA requirement when enabled
          on their Google account.
        </p>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-800">Enable Google Sign-In</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Users can sign in via Google. Google 2-step verification is accepted.
            </p>
          </div>
          <button
            onClick={() => isAdmin && setGoogleSignIn((v) => !v)}
            disabled={!isAdmin}
            style={{ color: googleSignIn ? '#3F9B2F' : '#d1d5db' }}
          >
            <FontAwesomeIcon icon={googleSignIn ? faToggleOn : faToggleOff} style={{ fontSize: 26 }} />
          </button>
        </div>

        {googleSignIn && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Restrict to Google Domain
              <span className="normal-case font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-gray-50"
              placeholder="e.g. myagency.com — leave blank to allow any Google account"
              value={googleDomain}
              onChange={(e) => setGoogleDomain(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        )}
      </div>

      {/* ── Session Settings ── */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h4 className="font-semibold text-gray-800">Session Settings</h4>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Session Timeout (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={480}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              value={timeout}
              onChange={(e) => { setTimeout_(Number(e.target.value)); setSaved(false); }}
            />
          </div>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: saved ? '#16a34a' : '#2a5f6f' }}
          >
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Roles & Permissions tab ───────────────────────────────────────────────────

const ROLES_CONFIG = [
  { key: 'ORG_SUPER_ADMIN',  label: 'Super Admin',         locked: true,  baseline: false },
  { key: 'ORG_ADMIN',        label: 'Full Administrator',  locked: false, baseline: true  },
  { key: 'SUPERVISING_BCBA', label: 'Clinical Supervisor', locked: false, baseline: true  },
  { key: 'RBT',              label: 'Behavior Technician', locked: false, baseline: true  },
];

const PERM_GROUPS = [
  { key: 'clients',   label: 'Clients',   color: '#3F9B2F' },
  { key: 'projects',  label: 'Projects',  color: '#F5A623' },
  { key: 'resources', label: 'Resources', color: '#1E88FF' },
  { key: 'team',      label: 'Team',      color: '#9c27b0' },
];

const PERM_ACTIONS = ['add', 'edit', 'delete'] as const;

type PermMatrix = Record<string, Record<string, Record<string, boolean>>>;

const DEFAULT_PERMS: PermMatrix = {
  ORG_SUPER_ADMIN:  { clients:{add:true,  edit:true,  delete:true },  projects:{add:true,  edit:true,  delete:true },  resources:{add:true,  edit:true,  delete:true },  team:{add:true,  edit:true,  delete:true }  },
  ORG_ADMIN:        { clients:{add:true,  edit:true,  delete:true },  projects:{add:true,  edit:true,  delete:true },  resources:{add:true,  edit:true,  delete:true },  team:{add:true,  edit:true,  delete:false}  },
  SUPERVISING_BCBA: { clients:{add:true,  edit:true,  delete:false},  projects:{add:true,  edit:true,  delete:false},  resources:{add:false, edit:true,  delete:false},  team:{add:false, edit:false, delete:false}  },
  RBT:              { clients:{add:false, edit:true,  delete:false},  projects:{add:false, edit:false, delete:false},  resources:{add:false, edit:false, delete:false},  team:{add:false, edit:false, delete:false}  },
};

type CustomRole = { key: string; label: string };

function blankPerms(): Record<string, Record<string, boolean>> {
  return Object.fromEntries(
    PERM_GROUPS.map((g) => [g.key, Object.fromEntries(PERM_ACTIONS.map((a) => [a, false]))]),
  );
}

function RolesTab({ isAdmin, orgId }: { isAdmin: boolean; orgId: string }) {
  const [perms, setPerms] = useState<PermMatrix>(() =>
    JSON.parse(JSON.stringify(DEFAULT_PERMS)),
  );
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [saved, setSaved]             = useState(false);

  // Roles currently assigned to at least one org member — fetched on mount
  const [memberRoles, setMemberRoles] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!orgId) return;
    api.getOrgMembers(orgId)
      .then((members) => setMemberRoles(new Set(members.map((m) => m.role))))
      .catch(() => { /* silently ignore — we won't block deletions on API failure */ });
  }, [orgId]);

  // Editable display names — keyed by role key
  const [roleLabels, setRoleLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(ROLES_CONFIG.map((r) => [r.key, r.label])),
  );
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editValue, setEditValue]     = useState('');

  // Add-role form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [addError, setAddError]       = useState('');
  // Role that couldn't be deleted because it's in use
  const [deleteBlockedKey, setDeleteBlockedKey] = useState<string | null>(null);

  const allRoles = [
    ...ROLES_CONFIG.map((r) => ({ ...r, custom: false })),
    ...customRoles.map((r) => ({ ...r, locked: false, baseline: false, custom: true })),
  ];

  const toggle = (roleKey: string, group: string, action: string) => {
    if (!isAdmin) return;
    if (allRoles.find((r) => r.key === roleKey)?.locked) return;
    setSaved(false);
    setPerms((prev) => ({
      ...prev,
      [roleKey]: {
        ...prev[roleKey],
        [group]: { ...prev[roleKey][group], [action]: !prev[roleKey][group][action] },
      },
    }));
  };

  const startEdit = (key: string) => {
    setEditingRole(key);
    setEditValue(roleLabels[key] ?? '');
  };

  const commitEdit = () => {
    if (editingRole) {
      const trimmed = editValue.trim();
      if (trimmed) {
        setRoleLabels((prev) => ({ ...prev, [editingRole]: trimmed }));
        setSaved(false);
      }
    }
    setEditingRole(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingRole(null);
    setEditValue('');
  };

  const handleAddRole = () => {
    const label = newRoleName.trim();
    if (!label) { setAddError('Role name is required.'); return; }
    const key = 'CUSTOM_' + label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (allRoles.some((r) => r.key === key)) {
      setAddError('A role with that name already exists.');
      return;
    }
    setCustomRoles((prev) => [...prev, { key, label }]);
    setPerms((prev) => ({ ...prev, [key]: blankPerms() }));
    setRoleLabels((prev) => ({ ...prev, [key]: label }));
    setNewRoleName('');
    setAddError('');
    setShowAddForm(false);
    setSaved(false);
  };

  const handleDeleteRole = (key: string) => {
    if (memberRoles.has(key)) {
      setDeleteBlockedKey(key);
      return;
    }
    setDeleteBlockedKey(null);
    setCustomRoles((prev) => prev.filter((r) => r.key !== key));
    setPerms((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRoleLabels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaved(false);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-1">Roles & Permissions</h3>
          <p className="text-sm text-gray-500">
            Rename roles and configure their permissions. Click a role name to edit it.
            Super Admin is a fixed system role.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowAddForm(true); setNewRoleName(''); setAddError(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium shrink-0 ml-4"
            style={{ background: '#2a5f6f' }}
          >
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
            Add Role
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th
                  className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  style={{ minWidth: 200, background: '#fafafa' }}
                >
                  Role
                </th>
                {PERM_GROUPS.map((g) => (
                  <th
                    key={g.key}
                    colSpan={3}
                    className="py-3 text-center text-xs font-bold"
                    style={{ color: g.color, background: '#fafafa', borderLeft: '1px solid #e5e7eb', minWidth: 144 }}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <th className="px-5 py-2" style={{ background: '#f9fafb' }} />
                {PERM_GROUPS.flatMap((g) =>
                  PERM_ACTIONS.map((action) => (
                    <th
                      key={`${g.key}-${action}`}
                      className="py-2 text-center"
                      style={{ borderLeft: action === 'add' ? '1px solid #e5e7eb' : undefined, width: 48 }}
                    >
                      <span className="text-xs text-gray-400 capitalize">{action}</span>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {allRoles.map((role, ri) => (
                <tr
                  key={role.key}
                  style={{
                    borderBottom: ri < allRoles.length - 1 ? '1px solid #f3f4f6' : undefined,
                    background: role.locked ? '#fafafa' : role.custom ? '#fafff8' : undefined,
                  }}
                >
                  {/* ── Role name cell with inline edit ── */}
                  <td className="px-5 py-3" style={{ minWidth: 200 }}>
                    {editingRole === role.key ? (
                      <input
                        autoFocus
                        className="border border-teal-400 rounded px-2 py-1 text-sm font-medium text-gray-800
                                   focus:outline-none focus:ring-2 focus:ring-teal-500 w-full max-w-[180px]"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')  commitEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span className="text-sm font-medium text-gray-800">
                          {roleLabels[role.key] ?? role.label}
                        </span>
                        {role.locked && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">
                            System
                          </span>
                        )}
                        {!role.locked && role.baseline && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-400">
                            Baseline
                          </span>
                        )}
                        {role.custom && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ background: '#e0f2fe', color: '#0369a1' }}
                          >
                            Custom
                          </span>
                        )}
                        {!role.locked && isAdmin && (
                          <button
                            onClick={() => startEdit(role.key)}
                            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center
                                       rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600 transition-all"
                            title="Rename role"
                          >
                            <FontAwesomeIcon icon={faPen} style={{ fontSize: 9 }} />
                          </button>
                        )}
                        {role.custom && isAdmin && (
                          <button
                            onClick={() => handleDeleteRole(role.key)}
                            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center
                                       rounded hover:bg-red-100 text-gray-300 hover:text-red-500 transition-all"
                            title={memberRoles.has(role.key) ? 'Cannot delete — role is assigned to one or more members' : 'Remove role'}
                          >
                            <FontAwesomeIcon icon={faTimes} style={{ fontSize: 10 }} />
                          </button>
                        )}
                      </div>
                    )}
                    {deleteBlockedKey === role.key && (
                      <p className="text-xs text-red-500 mt-1">
                        This role is assigned to one or more team members and cannot be deleted.
                      </p>
                    )}
                  </td>

                  {PERM_GROUPS.flatMap((g) =>
                    PERM_ACTIONS.map((action) => {
                      const allowed = perms[role.key]?.[g.key]?.[action] ?? false;
                      const locked  = role.locked || !isAdmin;
                      return (
                        <td
                          key={`${g.key}-${action}`}
                          className="py-3 text-center"
                          style={{ borderLeft: action === 'add' ? '1px solid #f3f4f6' : undefined }}
                        >
                          <button
                            onClick={() => toggle(role.key, g.key, action)}
                            disabled={locked}
                            className="w-7 h-7 rounded-full flex items-center justify-center mx-auto transition-all"
                            style={
                              allowed
                                ? { background: '#EEF7EA', cursor: locked ? 'default' : 'pointer' }
                                : { background: '#f9fafb', cursor: locked ? 'default' : 'pointer' }
                            }
                            onMouseEnter={(e) => { if (!locked) (e.currentTarget as HTMLButtonElement).style.opacity = '0.75'; }}
                            onMouseLeave={(e) => { if (!locked) (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                          >
                            <FontAwesomeIcon
                              icon={allowed ? faCheck : faMinus}
                              style={{ fontSize: 10, color: role.locked ? '#9ca3af' : allowed ? '#3F9B2F' : '#d1d5db' }}
                            />
                          </button>
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add role inline form */}
      {showAddForm && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">New Role</h4>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <input
                type="text"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                placeholder="e.g. Lead RBT, Intake Coordinator…"
                value={newRoleName}
                onChange={(e) => { setNewRoleName(e.target.value); setAddError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddRole(); if (e.key === 'Escape') setShowAddForm(false); }}
              />
              {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
              <p className="text-xs text-gray-400 mt-1">
                All permissions start off — toggle them in the matrix after adding.
              </p>
            </div>
            <button
              onClick={handleAddRole}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium shrink-0"
              style={{ background: '#2a5f6f' }}
            >
              Add
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddError(''); }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => setSaved(true)}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: saved ? '#16a34a' : '#2a5f6f' }}
          >
            {saved ? '✓ Permissions Saved' : 'Save Permissions'}
          </button>
          {saved && <span className="text-xs text-gray-400">Changes will apply on next session.</span>}
        </div>
      )}
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────

function BillingTab() {
  return (
    <div className="max-w-xl">
      <h3 className="text-xl font-semibold text-gray-900 mb-1">Billing</h3>
      <p className="text-sm text-gray-500 mb-6">Manage your subscription and payment details.</p>
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
        Billing management coming soon. Contact support@myaba.ai to change your plan.
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
    </div>
  );
}
