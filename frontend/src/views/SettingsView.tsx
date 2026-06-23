import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding, faShieldAlt, faCreditCard, faSpinner,
  faSlidersH, faToggleOn, faToggleOff, faMinus, faCheck, faLock,
  faMobileAlt, faPlus, faTimes, faPen, faFileContract, faPlug,
  faSearch, faLink, faUnlink, faCheckCircle, faExclamationCircle,
  faUpload, faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { BAA_TEXT } from '../lib/baaText';
import type { EhrClientRecord, EhrConnectionStatus, OfficePuzzleImportResult, Org, OrgAclxPolicy, UsageSummary } from '../types';

const SENSITIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH:   { bg: '#fee2e2', text: '#991b1b' },
  MEDIUM: { bg: '#fef9c3', text: '#854d0e' },
  LOW:    { bg: '#f0fdf4', text: '#166534' },
};

type Tab = 'org' | 'roles' | 'security' | 'integrations' | 'billing';

const TABS: { id: Tab; icon: typeof faBuilding; label: string }[] = [
  { id: 'org',          icon: faBuilding,   label: 'Organization'        },
  { id: 'roles',        icon: faSlidersH,   label: 'Roles & Permissions' },
  { id: 'security',     icon: faShieldAlt,  label: 'Security'            },
  { id: 'integrations', icon: faPlug,       label: 'Integrations'        },
  { id: 'billing',      icon: faCreditCard, label: 'Billing'             },
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
            {activeTab === 'roles'        && <RolesTab isAdmin={isAdmin} orgId={orgId} />}
            {activeTab === 'security'     && <SecurityTab orgId={orgId} isAdmin={isAdmin} />}
            {activeTab === 'integrations' && <IntegrationsTab orgId={orgId} isAdmin={isAdmin} />}
            {activeTab === 'billing'      && <BillingTab orgId={orgId} isAdmin={isAdmin} />}
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

        {/* ACLX governance capability note */}
        <div className="py-3">
          <div style={{
            display: 'inline-flex', alignItems: 'flex-start', gap: 8,
            background: 'linear-gradient(135deg, #EEF7EA, #E6F4FF)',
            border: '1px solid #B9DEB0', borderRadius: 10,
            padding: '8px 12px',
          }}>
            <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#2E6B20', fontSize: 12, marginTop: 2 }} />
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2E6B20', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                AI Output Governance — ACLX
              </span>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                All AI responses are evaluated by the ACLX governance layer before delivery —
                enforcing identity-aware content controls, PHI safeguards, and{' '}
                <strong style={{ color: '#1E3347' }}>Least Agency</strong>: constraining
                not just what the AI can access, but what it is permitted to output autonomously.
              </p>
            </div>
          </div>
        </div>

        {/* Enable ACLX — master switch */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Enable ACLX</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Labels and governs all AI-generated output for HIPAA compliance.
              Disabling removes all output guardrails — not recommended for production.
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

          {/* DLP — always on */}
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Data Loss Prevention (DLP)</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Scans all user input before it reaches the AI. Blocks non-clinical identifiers
                — Social Security numbers, payment card numbers, and driver's license numbers —
                that have no place in a clinical prompt. Clinical PHI passes through so
                responses remain coherent.
              </p>
            </div>
            <span
              className="shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: '#EEF7EA', color: '#2E7D22', border: '1px solid #bbf7d0' }}
            >
              Always on
            </span>
          </div>

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

// ── Integrations tab ──────────────────────────────────────────────────────────

const EHR_META: Record<string, { label: string; logoColor: string; fields: { key: string; label: string; placeholder: string; secret?: boolean }[] }> = {
  centralreach: {
    label: 'CentralReach',
    logoColor: '#0056D2',
    fields: [
      { key: 'subdomain',  label: 'Subdomain',  placeholder: 'myagency (from myagency.centralreach.com)' },
      { key: 'apiToken',   label: 'API Token',  placeholder: 'Paste token from CentralReach → Settings → API Access', secret: true },
    ],
  },
  rethink: {
    label: 'Rethink',
    logoColor: '#1B7F4F',
    fields: [
      { key: 'accountId', label: 'Account ID', placeholder: 'Your Rethink organization ID' },
      { key: 'apiKey',    label: 'API Key',    placeholder: 'Paste key from Rethink → Settings → API Access', secret: true },
    ],
  },
};

function IntegrationsTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [connections, setConnections] = useState<EhrConnectionStatus[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    api.getEhrConnections()
      .then(setConnections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const refresh = () =>
    api.getEhrConnections().then(setConnections).catch(() => {});

  if (loading) return <Spinner />;

  return (
    <div className="max-w-2xl">
      <h3 className="text-xl font-semibold text-gray-900 mb-1">Integrations</h3>
      <p className="text-sm text-gray-500 mb-6">
        Connect myABA.ai to your practice management system to automatically pull client records.
        Credentials are encrypted at rest and never visible after saving.
      </p>

      <div className="flex flex-col gap-5">
        {(['centralreach', 'rethink'] as const).map((type) => {
          const meta   = EHR_META[type];
          const status = connections.find((c) => c.ehrType === type);
          return (
            <EhrCard
              key={type}
              type={type}
              meta={meta}
              status={status ?? null}
              isAdmin={isAdmin}
              onChanged={refresh}
            />
          );
        })}

        {/* OfficePuzzle — file import (no live API) */}
        <OfficePuzzleImportCard isAdmin={isAdmin} />
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Need help setting up a connection?{' '}
        <a href="mailto:support@myaba.ai" className="text-teal-700 hover:underline">support@myaba.ai</a>
      </p>
    </div>
  );
}

function EhrCard({
  type, meta, status, isAdmin, onChanged,
}: {
  type: string;
  meta: typeof EHR_META[string];
  status: EhrConnectionStatus | null;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const connected = status?.connected === true;
  const [showForm, setShowForm]   = useState(false);
  const [fields, setFields]       = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [disconnecting, setDisc]  = useState(false);

  // Client search state
  const [query, setQuery]         = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults]     = useState<EhrClientRecord[]>([]);
  const [searchError, setSearchError] = useState('');

  const handleConnect = async () => {
    setError('');
    const missing = meta.fields.find((f) => !fields[f.key]?.trim());
    if (missing) { setError(`${missing.label} is required`); return; }
    setSaving(true);
    try {
      await api.connectEhr(type, fields);
      setShowForm(false);
      setFields({});
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Connection failed. Check your credentials and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${meta.label}? Linked client records will retain their synced data.`)) return;
    setDisc(true);
    try {
      await api.disconnectEhr(type);
      onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed to disconnect');
    } finally {
      setDisc(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const res = await api.searchEhrClients(type, query);
      setResults(res.results);
      if (res.results.length === 0) setSearchError('No clients found. Try a different name.');
    } catch (e: any) {
      setSearchError(e?.message ?? 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: meta.logoColor }}
          >
            {meta.label[0]}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
            <p className="text-xs text-gray-400">
              {connected
                ? `Connected${status?.connectedAt ? ` · ${new Date(status.connectedAt).toLocaleDateString()}` : ''}`
                : 'Not connected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <FontAwesomeIcon icon={faCheckCircle} className="text-green-500 text-sm" />
          ) : (
            <FontAwesomeIcon icon={faExclamationCircle} className="text-gray-300 text-sm" />
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          {isAdmin && (
            connected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-xs text-red-500 hover:text-red-700 ml-2 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faUnlink} className="mr-1" />
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={() => { setShowForm(!showForm); setError(''); }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-white ml-2"
                style={{ background: '#2a5f6f' }}
              >
                <FontAwesomeIcon icon={faLink} className="mr-1.5" />
                Connect
              </button>
            )
          )}
        </div>
      </div>

      {/* Connect form */}
      {showForm && !connected && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
          <p className="text-xs text-gray-500 mb-3">
            Generate an API key in {meta.label} under <strong>Settings → API Access</strong>,
            then paste it below. myABA.ai will verify the connection before saving.
          </p>
          <div className="flex flex-col gap-3">
            {meta.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={fields[f.key] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleConnect}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#2a5f6f' }}
            >
              {saving ? 'Connecting…' : 'Connect & Verify'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(''); setFields({}); }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Client search — available once connected */}
      {connected && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs font-medium text-gray-600 mb-2">Search clients in {meta.label}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by client name…"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-3 py-2 rounded-lg text-white text-sm disabled:opacity-50"
              style={{ background: '#2a5f6f' }}
            >
              <FontAwesomeIcon icon={faSearch} />
            </button>
          </div>
          {searchError && <p className="mt-2 text-xs text-red-500">{searchError}</p>}
          {results.length > 0 && (
            <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
              {results.map((r) => (
                <div key={r.ehrId} className="flex items-center justify-between px-3 py-2.5 border-b last:border-b-0 border-gray-100 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {r.firstName} {r.lastName}
                      {r.preferredName && r.preferredName !== r.firstName && (
                        <span className="text-gray-400 font-normal"> ({r.preferredName})</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {r.dateOfBirth && `DOB: ${r.dateOfBirth}`}
                      {r.diagnosisDescriptions?.length ? ` · ${r.diagnosisDescriptions[0]}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    ID: {r.ehrId}
                  </span>
                </div>
              ))}
            </div>
          )}
          {status?.lastSyncAt && (
            <p className="mt-2 text-xs text-gray-400">
              Last sync: {new Date(status.lastSyncAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── OfficePuzzle import card ─────────────────────────────────────────────────

function OfficePuzzleImportCard({ isAdmin }: { isAdmin: boolean }) {
  const fileInputRef                        = useRef<HTMLInputElement>(null);
  const [file, setFile]                     = useState<File | null>(null);
  const [importing, setImporting]           = useState(false);
  const [result, setResult]                 = useState<OfficePuzzleImportResult | null>(null);
  const [importError, setImportError]       = useState('');
  const [showNames, setShowNames]           = useState(false);

  const handleFileChange = (e: { target: { files: FileList | null; value: string } }) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setImportError('');
    setShowNames(false);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setImportError('');
    setResult(null);
    try {
      const res = await api.importOfficePuzzle(file);
      setResult(res);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: unknown) {
      setImportError((e as Error)?.message ?? 'Import failed. Please check the file and try again.');
    } finally {
      setImporting(false);
    }
  };

  const hasResult  = result !== null;
  const hasErrors  = (result?.errorCount ?? 0) > 0;
  const hasSuccess = (result?.imported ?? 0) > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold tracking-tight"
            style={{ background: '#FF6B2B' }}
          >
            OP
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">OfficePuzzle</p>
            <p className="text-xs text-gray-400">Import your client roster from an export file</p>
          </div>
        </div>
        <span
          className="text-xs font-medium px-2.5 py-0.5 rounded-full"
          style={{ background: '#eff6ff', color: '#1d4ed8' }}
        >
          File Import
        </span>
      </div>

      {/* Body */}
      <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">

        {/* Export instructions */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 mb-4">
          <p className="text-xs font-semibold text-blue-800 mb-1">How to export from OfficePuzzle</p>
          <ol className="text-xs text-blue-700 space-y-0.5 list-decimal list-inside">
            <li>Log into OfficePuzzle and go to <strong>Clients → Client List</strong></li>
            <li>Click <strong>Export</strong> in the top-right corner</li>
            <li>Choose <strong>Excel (.xlsx)</strong> or <strong>CSV</strong> format</li>
            <li>Save the file and upload it below</li>
          </ol>
        </div>

        {/* File picker */}
        {isAdmin ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <label className="flex-1 w-full">
              <div
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FontAwesomeIcon icon={faUpload} className="text-gray-400 text-sm" />
                <span className="text-sm text-gray-600 truncate max-w-[220px]">
                  {file ? file.name : 'Choose .xlsx, .xls, or .csv…'}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: '#2a5f6f' }}
            >
              {importing ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
                  Importing…
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faUpload} className="text-xs" />
                  Import Clients
                </>
              )}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">
            Only organization admins can import clients.
          </p>
        )}

        {/* Error */}
        {importError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
            <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* Results */}
        {hasResult && (
          <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">

            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-white">
              {hasSuccess && (
                <div className="flex items-center gap-1.5 text-sm">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-green-500 text-xs" />
                  <span className="font-semibold text-gray-800">{result!.imported}</span>
                  <span className="text-gray-500">client{result!.imported === 1 ? '' : 's'} imported</span>
                </div>
              )}
              {result!.skipped > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-semibold text-gray-500">{result!.skipped}</span>
                  <span className="text-gray-400">skipped</span>
                </div>
              )}
              {hasErrors && (
                <div className="flex items-center gap-1.5 text-sm">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 text-xs" />
                  <span className="font-semibold text-amber-700">{result!.errorCount}</span>
                  <span className="text-gray-500">error{result!.errorCount === 1 ? '' : 's'}</span>
                </div>
              )}
            </div>

            {/* Imported names (collapsible) */}
            {hasSuccess && result!.importedNames.length > 0 && (
              <div className="border-t border-gray-100">
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowNames((v) => !v)}
                >
                  <span>
                    {showNames ? 'Hide' : 'Show'} imported clients
                  </span>
                  <span className="text-gray-300">{showNames ? '▲' : '▼'}</span>
                </button>
                {showNames && (
                  <div className="px-4 pb-3 max-h-40 overflow-y-auto">
                    <div className="flex flex-wrap gap-1.5">
                      {result!.importedNames.map((name, i) => (
                        <span
                          key={i}
                          className="inline-block text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Per-row errors */}
            {hasErrors && (
              <div className="border-t border-gray-100 px-4 py-3 bg-amber-50">
                <p className="text-xs font-semibold text-amber-800 mb-1.5">Row errors</p>
                <ul className="space-y-0.5">
                  {result!.errors.map((err, i) => (
                    <li key={i} className="text-xs text-amber-700">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Accepted formats footnote */}
        <p className="mt-3 text-xs text-gray-400">
          Accepts <strong>.xlsx</strong>, <strong>.xls</strong>, and <strong>.csv</strong> files.
          The first row must be a header row. OfficePuzzle IDs are stored as an external reference
          on each imported client.
        </p>
      </div>
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────

function BillingTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [usage, setUsage]         = useState<UsageSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [capInput, setCapInput]   = useState('');
  const [capSaving, setCapSaving] = useState(false);
  const [capSaved, setCapSaved]   = useState(false);
  const [capError, setCapError]   = useState('');
  const savedTimer                = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getUsage()
      .then((u) => {
        setUsage(u);
        if (u.customLimit != null) setCapInput(String(u.customLimit));
      })
      .catch(() => {/* fail silently — clinical staff shouldn't be blocked */})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  // ── Derived display values ────────────────────────────────────────────────

  const planLabel =
    usage?.plan === 'enterprise' ? 'Enterprise'
    : usage?.plan === 'team'     ? 'Team'
    : usage?.plan === 'solo'     ? 'Solo'
    : (usage?.plan ?? '—');

  const planBadgeStyle: Record<string, string> = {
    enterprise: 'bg-violet-100 text-violet-700',
    team:       'bg-blue-100 text-blue-700',
    solo:       'bg-gray-100 text-gray-600',
    dev:        'bg-amber-100 text-amber-700',
  };
  const badgeClass = planBadgeStyle[usage?.plan ?? ''] ?? 'bg-gray-100 text-gray-600';

  const used           = usage?.requestCount ?? 0;
  const effectiveLimit = usage?.effectiveLimit ?? -1;
  const isUnlimited    = effectiveLimit < 0;
  const pct            = isUnlimited || effectiveLimit === 0
    ? 0
    : Math.min(100, (used / effectiveLimit) * 100);
  const isNearLimit = !isUnlimited && pct >= 80;
  const isAtLimit   = !isUnlimited && pct >= 100;

  const monthLabel = usage?.period
    ? new Date(usage.period + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })
    : '—';

  const barColor = isAtLimit ? '#dc2626' : isNearLimit ? '#f59e0b' : '#2a5f6f';

  // ── Spending cap handler ──────────────────────────────────────────────────

  const handleSaveCap = async () => {
    const val   = capInput.trim();
    const limit = val === '' ? null : Number(val);

    if (val !== '' && (Number.isNaN(limit!) || limit! < 1 || !Number.isInteger(limit!))) {
      setCapError('Enter a whole number ≥ 1, or leave blank to remove the cap.');
      return;
    }

    setCapSaving(true);
    setCapError('');
    try {
      await api.setUsageLimit(limit);
      setCapSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setCapSaved(false), 3500);
      // Refresh usage summary to reflect new cap
      const updated = await api.getUsage();
      setUsage(updated);
    } catch (e: any) {
      setCapError(e?.message ?? 'Failed to save spending cap. Please try again.');
    } finally {
      setCapSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h3 className="text-xl font-semibold text-gray-900 mb-1">Billing &amp; Usage</h3>
      <p className="text-sm text-gray-500 mb-6">
        Monitor your organization's AI usage and manage plan settings.
      </p>

      {/* ── Plan card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
              Current Plan
            </p>
            <p className="text-lg font-semibold text-gray-900">{planLabel}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badgeClass}`}>
            {planLabel}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {isUnlimited && !usage?.customLimit
            ? 'Unlimited AI requests per month included in your plan.'
            : `Up to ${(effectiveLimit).toLocaleString()} AI requests per month.`}
        </p>
        <p className="text-xs text-gray-400 mt-2">
          To change your plan, contact{' '}
          <a href="mailto:support@myaba.ai" className="text-teal-700 hover:underline">
            support@myaba.ai
          </a>
          .
        </p>
      </div>

      {/* ── Usage card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">
            AI Requests — {monthLabel}
          </p>
          {usage?.lastUpdated && (
            <p className="text-xs text-gray-400">
              Updated{' '}
              {new Date(usage.lastUpdated).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Count */}
        <div className="flex items-end gap-2 mb-2">
          <span className="text-3xl font-bold text-gray-900">
            {used.toLocaleString()}
          </span>
          {!isUnlimited ? (
            <span className="text-sm text-gray-400 mb-1">
              / {effectiveLimit.toLocaleString()} requests
            </span>
          ) : (
            <span className="text-sm text-gray-400 mb-1">requests</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
          {isUnlimited ? (
            /* Animated shimmer for unlimited plans */
            <div
              className="h-2 rounded-full"
              style={{ width: '25%', background: '#7c3aed', opacity: 0.4 }}
            />
          ) : (
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: barColor }}
            />
          )}
        </div>

        {/* Breakdown */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
          <span>
            Chat:{' '}
            <strong className="text-gray-700">
              {(usage?.chatCount ?? 0).toLocaleString()}
            </strong>
          </span>
          <span>
            Documents:{' '}
            <strong className="text-gray-700">
              {(usage?.documentCount ?? 0).toLocaleString()}
            </strong>
          </span>
          {!isUnlimited && (
            <span className="ml-auto">
              <strong
                className={
                  isAtLimit
                    ? 'text-red-600'
                    : isNearLimit
                    ? 'text-amber-600'
                    : 'text-gray-700'
                }
              >
                {isAtLimit
                  ? 'Limit reached'
                  : `${(usage?.remaining ?? 0).toLocaleString()} remaining`}
              </strong>
            </span>
          )}
        </div>

        {/* Near-limit warning */}
        {isNearLimit && !isAtLimit && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            Your organization is approaching its monthly request limit. Contact support
            to upgrade your plan.
          </p>
        )}
        {isAtLimit && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            Monthly request limit reached. AI features are temporarily unavailable until
            the next billing period. Contact{' '}
            <a href="mailto:support@myaba.ai" className="underline">
              support@myaba.ai
            </a>{' '}
            to upgrade.
          </p>
        )}
      </div>

      {/* ── Enterprise spending cap (admin only) ──────────────────────── */}
      {usage?.canSetCustomLimit && isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-800 mb-1">Monthly Spending Cap</p>
          <p className="text-sm text-gray-500 mb-4">
            Set an internal monthly request ceiling for your organization. This is useful
            for cost control — your enterprise plan is billed at a base fee plus per-request
            usage. Leave blank to keep usage unlimited.
          </p>

          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              step="100"
              value={capInput}
              onChange={(e) => {
                setCapInput(e.target.value);
                setCapError('');
                setCapSaved(false);
              }}
              placeholder="e.g. 1000"
              className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={handleSaveCap}
              disabled={capSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ background: capSaved ? '#16a34a' : '#2a5f6f' }}
            >
              {capSaving ? 'Saving…' : capSaved ? '✓ Saved' : 'Save Cap'}
            </button>
            {(usage.customLimit != null || capInput !== '') && !capSaving && (
              <button
                onClick={() => {
                  setCapInput('');
                  setCapError('');
                  setCapSaved(false);
                }}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear — revert to unlimited"
              >
                Clear
              </button>
            )}
          </div>

          {capError && (
            <p className="mt-2 text-xs text-red-500">{capError}</p>
          )}

          {usage.customLimit != null && !capSaved && (
            <p className="mt-2 text-xs text-gray-400">
              Current cap:{' '}
              <strong className="text-gray-600">
                {usage.customLimit.toLocaleString()} requests/month
              </strong>
            </p>
          )}

          {capSaved && (
            <p className="mt-2 text-xs text-green-600">
              {capInput.trim() === ''
                ? 'Spending cap removed — your plan is now unlimited.'
                : `Cap set to ${Number(capInput).toLocaleString()} requests/month.`}
            </p>
          )}
        </div>
      )}

      {/* Contact footer */}
      <p className="mt-6 text-xs text-gray-400">
        Questions about billing?{' '}
        <a href="mailto:support@myaba.ai" className="text-teal-700 hover:underline">
          support@myaba.ai
        </a>
      </p>
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
