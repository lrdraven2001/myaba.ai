import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding, faUsers, faShieldAlt, faCreditCard,
  faPlus, faCopy, faCheck, faTrash, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import type { FederationConfig, Org, UserRole } from '../types';

type Tab = 'org' | 'team' | 'federation' | 'billing';

const TABS: { id: Tab; icon: typeof faBuilding; label: string; enterprise?: boolean }[] = [
  { id: 'org',        icon: faBuilding,   label: 'Organization' },
  { id: 'team',       icon: faUsers,      label: 'Team' },
  { id: 'federation', icon: faShieldAlt,  label: 'Federation', enterprise: true },
  { id: 'billing',    icon: faCreditCard, label: 'Billing' },
];

const INVITE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'TREATING_BCBA',    label: 'Treating BCBA' },
  { value: 'SUPERVISING_BCBA', label: 'Supervising BCBA' },
  { value: 'RBT',              label: 'RBT' },
  { value: 'BCBA_STUDENT',     label: 'BCBA Student' },
  { value: 'SCHEDULING_ADMIN', label: 'Scheduling Admin' },
  { value: 'BILLING_ADMIN',    label: 'Billing Admin' },
  { value: 'ORG_ADMIN',        label: 'Org Admin' },
];

export default function SettingsView() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('org');

  const isAdmin = currentUser?.role === 'ORG_ADMIN' || currentUser?.role === 'ORG_SUPER_ADMIN';
  const isSuperAdmin = currentUser?.role === 'ORG_SUPER_ADMIN';
  const orgId = currentUser?.orgId ?? '';

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* Tab sidebar */}
      <div className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col pt-6 pb-4">
        <div className="px-5 mb-5">
          <h2 className="text-base font-semibold text-gray-800">Settings</h2>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {TABS.map((t) => {
            const disabled = t.enterprise && !isSuperAdmin;
            return (
              <button
                key={t.id}
                onClick={() => !disabled && setActiveTab(t.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                  activeTab === t.id
                    ? 'text-white'
                    : disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={activeTab === t.id ? { background: '#2a5f6f' } : {}}
                disabled={disabled}
                title={disabled ? 'Requires ORG_SUPER_ADMIN and Enterprise plan' : undefined}
              >
                <FontAwesomeIcon icon={t.icon} className="w-4" />
                {t.label}
                {t.enterprise && (
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                    ENT
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'org'        && <OrgTab orgId={orgId} isAdmin={isAdmin} />}
        {activeTab === 'team'       && <TeamTab orgId={orgId} isAdmin={isAdmin} />}
        {activeTab === 'federation' && <FederationTab orgId={orgId} />}
        {activeTab === 'billing'    && <BillingTab />}
      </div>
    </div>
  );
}

// ── Organization tab ──────────────────────────────────────────────────────────

function OrgTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [org, setOrg]           = useState<Org | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [timeout, setTimeout_]  = useState(15);
  const [mfa, setMfa]           = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    api.getOrg(orgId)
      .then((o) => {
        setOrg(o);
        setTimeout_(o.settings?.sessionTimeoutMinutes ?? 15);
        setMfa(o.settings?.mfaRequired ?? false);
      })
      .catch(() => {/* show cached if any */})
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateOrgSettings(orgId, { sessionTimeoutMinutes: timeout, mfaRequired: mfa });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="max-w-xl">
      <h3 className="text-xl font-semibold text-gray-900 mb-1">{org?.name ?? '—'}</h3>
      <p className="text-sm text-gray-500 mb-6">
        Plan: <span className="font-semibold capitalize">{org?.plan}</span>
        &nbsp;·&nbsp; Org ID: <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{orgId}</code>
      </p>

      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h4 className="font-semibold text-gray-800">Security Settings</h4>

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
              onChange={(e) => setTimeout_(Number(e.target.value))}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={mfa}
              onChange={(e) => setMfa(e.target.checked)}
              className="w-4 h-4 accent-teal-700"
            />
            <span className="text-sm text-gray-700">Require MFA for all users</span>
          </label>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: saved ? '#16a34a' : '#2a5f6f' }}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Team tab ──────────────────────────────────────────────────────────────────

function TeamTab({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [role, setRole]           = useState<UserRole>('TREATING_BCBA');
  const [inviteUrl, setInviteUrl] = useState('');
  const [generating, setGen]      = useState(false);
  const [copied, setCopied]       = useState(false);
  const [error, setError]         = useState('');

  const handleGenerate = async () => {
    setGen(true); setError(''); setInviteUrl(''); setCopied(false);
    try {
      const { inviteUrl: url } = await api.generateInvite(orgId, role);
      setInviteUrl(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate invite');
    } finally { setGen(false); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-xl">
      <h3 className="text-xl font-semibold text-gray-900 mb-1">Team Members</h3>
      <p className="text-sm text-gray-500 mb-6">
        Invite new staff by generating role-specific links. Each link is single-use and expires in 7 days.
      </p>

      {isAdmin ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h4 className="font-semibold text-gray-800">Generate Invite Link</h4>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Role
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              value={role}
              onChange={(e) => { setRole(e.target.value as UserRole); setInviteUrl(''); }}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2"
            style={{ background: '#2a5f6f' }}
          >
            {generating
              ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Generating…</>
              : <><FontAwesomeIcon icon={faPlus} /> Generate Link</>}
          </button>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {inviteUrl && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Invite URL</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 text-xs text-gray-700 bg-transparent border-none outline-none truncate"
                />
                <button
                  onClick={handleCopy}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5"
                  style={{ background: copied ? '#16a34a' : '#2a5f6f' }}
                >
                  <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Contact your organization admin to invite new team members.
        </div>
      )}
    </div>
  );
}

// ── Federation tab ────────────────────────────────────────────────────────────

function FederationTab({ orgId }: { orgId: string }) {
  const [configs, setConfigs]     = useState<FederationConfig[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  // Form state
  const [fedType, setFedType]             = useState<'oidc' | 'saml'>('oidc');
  const [displayName, setDisplayName]     = useState('');
  const [clientId_, setClientId]          = useState('');
  const [issuerUrl, setIssuerUrl]         = useState('');
  const [idpEntityId, setIdpEntityId]     = useState('');
  const [ssoUrl, setSsoUrl]               = useState('');
  const [rpEntityId, setRpEntityId]       = useState('');
  const [x509Cert, setX509Cert]           = useState('');
  const [isEnabled, setIsEnabled]         = useState(true);
  const [saving, setSaving]               = useState(false);
  const [formError, setFormError]         = useState('');

  useEffect(() => {
    api.getFederationConfigs(orgId)
      .then(setConfigs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleCreate = async () => {
    setSaving(true); setFormError('');
    try {
      await api.createFederationConfig(orgId, {
        type: fedType, displayName, isEnabled,
        ...(fedType === 'oidc' ? { clientId: clientId_, issuerUrl } : { idpEntityId, ssoUrl, rpEntityId, x509Certificate: x509Cert }),
      } as Parameters<typeof api.createFederationConfig>[1]);
      const updated = await api.getFederationConfigs(orgId);
      setConfigs(updated);
      setShowForm(false);
      resetForm();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create config');
    } finally { setSaving(false); }
  };

  const handleDelete = async (configId: string) => {
    setDeleting(configId);
    try {
      await api.deleteFederationConfig(orgId, configId);
      setConfigs((prev) => prev.filter((c) => c.id !== configId));
    } catch { /* ignore */ } finally { setDeleting(null); }
  };

  const resetForm = () => {
    setFedType('oidc'); setDisplayName(''); setClientId(''); setIssuerUrl('');
    setIdpEntityId(''); setSsoUrl(''); setRpEntityId(''); setX509Cert('');
    setIsEnabled(true); setFormError('');
  };

  if (loading) return <Spinner />;

  return (
    <div className="max-w-2xl">
      <h3 className="text-xl font-semibold text-gray-900 mb-1">Federation (SSO)</h3>
      <p className="text-sm text-gray-500 mb-6">
        Connect an enterprise OIDC or SAML 2.0 identity provider so staff can sign in with corporate credentials.
      </p>

      {/* Existing configs */}
      {configs.length > 0 && (
        <div className="mb-6 space-y-3">
          {configs.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-800">{c.displayName}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium uppercase"
                        style={{ background: c.type === 'oidc' ? '#e8f4f8' : '#fdf4e7', color: c.type === 'oidc' ? '#1e4d5c' : '#92400e' }}>
                    {c.type}
                  </span>
                  {!c.isEnabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Disabled</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">Provider ID: {c.firebaseProviderId}</p>
                {c.type === 'oidc' && c.issuerUrl && <p className="text-xs text-gray-400">Issuer: {c.issuerUrl}</p>}
                {c.type === 'saml' && c.ssoUrl && <p className="text-xs text-gray-400">SSO URL: {c.ssoUrl}</p>}
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={deleting === c.id}
                className="text-red-400 hover:text-red-600 ml-4"
                title="Delete config"
              >
                <FontAwesomeIcon icon={deleting === c.id ? faSpinner : faTrash}
                                 className={deleting === c.id ? 'animate-spin' : ''} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add config form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: '#2a5f6f' }}
        >
          <FontAwesomeIcon icon={faPlus} /> Add IdP Configuration
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h4 className="font-semibold text-gray-800">New Federation Config</h4>

          <div className="flex gap-2">
            {(['oidc', 'saml'] as const).map((t) => (
              <button key={t} onClick={() => setFedType(t)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        fedType === t ? 'text-white border-transparent' : 'border-gray-300 text-gray-600'
                      }`}
                      style={fedType === t ? { background: '#2a5f6f' } : {}}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <FieldInput label="Display Name" value={displayName} onChange={setDisplayName}
                      placeholder="e.g. Acme Corp SSO" />

          {fedType === 'oidc' ? (
            <>
              <FieldInput label="Client ID" value={clientId_} onChange={setClientId} placeholder="your-client-id" />
              <FieldInput label="Issuer URL" value={issuerUrl} onChange={setIssuerUrl}
                          placeholder="https://accounts.google.com" />
            </>
          ) : (
            <>
              <FieldInput label="IdP Entity ID" value={idpEntityId} onChange={setIdpEntityId}
                          placeholder="https://idp.example.com/entity" />
              <FieldInput label="SSO URL" value={ssoUrl} onChange={setSsoUrl}
                          placeholder="https://idp.example.com/sso/saml" />
              <FieldInput label="RP Entity ID" value={rpEntityId} onChange={setRpEntityId}
                          placeholder="https://app.myaba.ai" />
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  X.509 Certificate (PEM)
                </label>
                <textarea rows={4} value={x509Cert} onChange={(e) => setX509Cert(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
                          placeholder="-----BEGIN CERTIFICATE-----&#10;..." />
              </div>
            </>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)}
                   className="accent-teal-700" />
            <span className="text-sm text-gray-700">Enable immediately</span>
          </label>

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowForm(false); resetForm(); }}
                    className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={saving}
                    className="flex-1 py-2 rounded-lg text-white text-sm font-medium"
                    style={{ background: '#2a5f6f' }}>
              {saving ? 'Saving…' : 'Create Config'}
            </button>
          </div>
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

function FieldInput({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </label>
      <input
        type="text"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
    </div>
  );
}
