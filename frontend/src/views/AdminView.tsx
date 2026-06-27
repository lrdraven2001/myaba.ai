import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRobot,
  faShieldAlt,
  faKey,
  faCheck,
  faExclamationTriangle,
  faEye,
  faEyeSlash,
  faFlask,
  faCloud,
  faSave,
  faChartBar,
  faSpinner,
  faShieldVirus,
  faBan,
  faClock,
  faRedoAlt,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = 'ai' | 'dlp' | 'compliance';

interface SaveStatus {
  state: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
}

// ── DLP Info Types (Google Sensitive Data Protection) ─────────────────────────

const DLP_INFO_TYPES = [
  { id: 'PERSON_NAME',           label: 'Person Name',           group: 'PII' },
  { id: 'EMAIL_ADDRESS',         label: 'Email Address',         group: 'PII' },
  { id: 'PHONE_NUMBER',          label: 'Phone Number',          group: 'PII' },
  { id: 'DATE_OF_BIRTH',         label: 'Date of Birth',         group: 'PII' },
  { id: 'US_SOCIAL_SECURITY_NUMBER', label: 'SSN',              group: 'PII' },
  { id: 'MEDICAL_RECORD_NUMBER', label: 'Medical Record Number', group: 'HIPAA' },
  { id: 'US_HEALTHCARE_NPI',     label: 'NPI Number',            group: 'HIPAA' },
  { id: 'ICD9_CODE',             label: 'ICD-9 Diagnosis Code',  group: 'HIPAA' },
  { id: 'ICD10_CODE',            label: 'ICD-10 Diagnosis Code', group: 'HIPAA' },
  { id: 'US_DRIVERS_LICENSE_NUMBER', label: "Driver's License",  group: 'PII' },
  { id: 'LOCATION',              label: 'Address / Location',    group: 'PII' },
  { id: 'IP_ADDRESS',            label: 'IP Address',            group: 'Technical' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminView() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<TabId>('ai');

  // ── AI config state ──────────────────────────────────────────────────────

  const [anthropicKey, setAnthropicKey]   = useState('');
  const [showKey, setShowKey]             = useState(false);
  const [model, setModel]                 = useState('claude-sonnet-4-6');
  const [maxTokens, setMaxTokens]         = useState('4000');
  const [testStatus, setTestStatus]       = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [aiSave, setAiSave]               = useState<SaveStatus>({ state: 'idle' });

  // ── DLP config state ─────────────────────────────────────────────────────

  const [dlpEnabled, setDlpEnabled]       = useState(false);
  const [gcpProjectId, setGcpProjectId]   = useState('');
  const [gcpLocation, setGcpLocation]     = useState('global');
  const [dlpApiKey, setDlpApiKey]         = useState('');
  const [showDlpKey, setShowDlpKey]       = useState(false);
  const [dlpLikelihood, setDlpLikelihood] = useState('LIKELY');
  const [selectedInfoTypes, setSelectedInfoTypes] = useState<string[]>([
    'PERSON_NAME', 'DATE_OF_BIRTH', 'MEDICAL_RECORD_NUMBER', 'US_HEALTHCARE_NPI',
  ]);
  const [dlpSave, setDlpSave]             = useState<SaveStatus>({ state: 'idle' });

  const orgId = currentUser?.orgId ?? '';

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleInfoType = (id: string) =>
    setSelectedInfoTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const testApiKey = async () => {
    setTestStatus('testing');
    try {
      // Lightweight check — send a minimal chat message to verify the key works
      await api.chat('Reply with only the word OK.', [], undefined, undefined, undefined);
      setTestStatus('ok');
    } catch {
      setTestStatus('fail');
    }
    setTimeout(() => setTestStatus('idle'), 4000);
  };

  const saveAiConfig = async () => {
    setAiSave({ state: 'saving' });
    try {
      await api.updateOrgSettings(orgId, {
        platformConfig: {
          anthropicModel: model,
          anthropicMaxTokens: parseInt(maxTokens, 10),
          // Note: API key is NOT sent here — set it in application-local.yml (dev)
          // or as a Cloud Run environment variable / Secret Manager (production).
        },
      });
      setAiSave({ state: 'saved' });
    } catch (e: unknown) {
      setAiSave({ state: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    }
    setTimeout(() => setAiSave({ state: 'idle' }), 3000);
  };

  const saveDlpConfig = async () => {
    setDlpSave({ state: 'saving' });
    try {
      await api.updateOrgSettings(orgId, {
        dlpConfig: {
          enabled:       dlpEnabled,
          gcpProjectId,
          gcpLocation,
          likelihood:    dlpLikelihood,
          infoTypes:     selectedInfoTypes,
          // Note: DLP API key is NOT sent here — use a GCP service account key file
          // or Workload Identity Federation for production deployments.
        },
      });
      setDlpSave({ state: 'saved' });
    } catch (e: unknown) {
      setDlpSave({ state: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    }
    setTimeout(() => setDlpSave({ state: 'idle' }), 3000);
  };

  // ── Compliance state ──────────────────────────────────────────────────────

  type ComplianceSummary = Awaited<ReturnType<typeof api.getComplianceSummary>>;
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummary | null>(null);
  const [complianceDays, setComplianceDays]       = useState(30);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError]     = useState<string | null>(null);

  const loadCompliance = async (days: number) => {
    setComplianceLoading(true);
    setComplianceError(null);
    try {
      const data = await api.getComplianceSummary(days);
      setComplianceSummary(data);
    } catch (e: unknown) {
      setComplianceError(e instanceof Error ? e.message : 'Failed to load compliance data');
    } finally {
      setComplianceLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'compliance' && complianceSummary === null) {
      loadCompliance(complianceDays);
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: typeof faRobot }[] = [
    { id: 'ai',         label: 'AI Configuration',    icon: faRobot },
    { id: 'dlp',        label: 'Sensitive Data (DLP)', icon: faShieldAlt },
    { id: 'compliance', label: 'Compliance',           icon: faChartBar },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 40, height: 40, background: '#EEF4FF' }}
          >
            <FontAwesomeIcon icon={faKey} style={{ fontSize: 18, color: '#1E88FF' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Platform Admin</h1>
            <p className="text-sm text-gray-500">Integration keys, AI model settings, and DLP configuration</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-8">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2"
              style={{
                borderBottomColor: tab === t.id ? '#1E88FF' : 'transparent',
                color: tab === t.id ? '#1E88FF' : '#6B7280',
              }}
            >
              <FontAwesomeIcon icon={t.icon} style={{ fontSize: 13 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-6 max-w-3xl space-y-6">

        {/* ── AI Configuration tab ─────────────────────────────────────────── */}
        {tab === 'ai' && (
          <>
            {/* API Key card */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="px-6 py-4 flex items-center gap-3">
                <FontAwesomeIcon icon={faRobot} style={{ color: '#1E88FF', fontSize: 16 }} />
                <h2 className="font-semibold text-gray-900">Anthropic API Key</h2>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div className="rounded-lg p-4 text-sm" style={{ background: '#FFF8E1', borderLeft: '4px solid #F5A623' }}>
                  <p className="font-medium text-amber-800 mb-1">Where to set the key</p>
                  <p className="text-amber-700 leading-relaxed">
                    <strong>Local dev:</strong> set <code className="bg-amber-100 px-1 rounded">anthropic.api-key</code> in{' '}
                    <code className="bg-amber-100 px-1 rounded">backend-java/src/main/resources/application-local.yml</code>
                    {' '}(gitignored).
                    <br />
                    <strong>Production:</strong> inject as a{' '}
                    <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> environment variable in Cloud Run,
                    or store in <strong>Google Secret Manager</strong> and bind it via{' '}
                    <code className="bg-amber-100 px-1 rounded">--set-secrets</code>.
                    The key field below is for verifying connectivity only — it is never persisted to the database.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    API Key (verify only — not saved to DB)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={anthropicKey}
                        onChange={(e) => setAnthropicKey(e.target.value)}
                        placeholder="sk-ant-api03-..."
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                        style={{ paddingRight: 36 }}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <FontAwesomeIcon icon={showKey ? faEyeSlash : faEye} style={{ fontSize: 14 }} />
                      </button>
                    </div>
                    <button
                      onClick={testApiKey}
                      disabled={!anthropicKey.trim() || testStatus === 'testing'}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                      style={{
                        borderColor: testStatus === 'ok' ? '#3F9B2F' : testStatus === 'fail' ? '#DC2626' : '#E5E7EB',
                        color:       testStatus === 'ok' ? '#3F9B2F' : testStatus === 'fail' ? '#DC2626' : '#374151',
                        background:  testStatus === 'ok' ? '#F0FDF4' : testStatus === 'fail' ? '#FEF2F2' : 'white',
                      }}
                    >
                      <FontAwesomeIcon
                        icon={testStatus === 'ok' ? faCheck : testStatus === 'fail' ? faExclamationTriangle : faFlask}
                        style={{ fontSize: 13 }}
                      />
                      {testStatus === 'testing' ? 'Testing…' : testStatus === 'ok' ? 'Connected' : testStatus === 'fail' ? 'Failed' : 'Test Connection'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Model settings card */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="px-6 py-4">
                <h2 className="font-semibold text-gray-900">Model Settings</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Stored in org settings and override <code className="text-xs bg-gray-100 px-1 rounded">application.yml</code> defaults at runtime.
                </p>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="claude-sonnet-4-6">claude-sonnet-4-6  (recommended — fast + accurate)</option>
                    <option value="claude-opus-4-5">claude-opus-4-5  (highest quality, slower)</option>
                    <option value="claude-haiku-4-5">claude-haiku-4-5  (fastest, lightweight tasks)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Output Tokens</label>
                  <input
                    type="number"
                    min={256}
                    max={16000}
                    step={256}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Default: 4000. Clinical documents may need up to 8000 for full BIPs/FBAs.
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 flex items-center justify-between">
                <SaveStatusBadge status={aiSave} />
                <button
                  onClick={saveAiConfig}
                  disabled={aiSave.state === 'saving'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: '#1E88FF' }}
                >
                  <FontAwesomeIcon icon={faSave} style={{ fontSize: 13 }} />
                  {aiSave.state === 'saving' ? 'Saving…' : 'Save Model Settings'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── DLP tab ──────────────────────────────────────────────────────── */}
        {tab === 'dlp' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faCloud} style={{ color: '#4285F4', fontSize: 16 }} />
                  <div>
                    <h2 className="font-semibold text-gray-900">Google Sensitive Data Protection (DLP)</h2>
                    <p className="text-sm text-gray-500">
                      Scans AI outputs and clinical documents for PHI before delivery.{' '}
                      <a
                        href="https://cloud.google.com/sensitive-data-protection/docs/reference/rest"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        API reference
                      </a>
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-sm font-medium text-gray-700">Enable DLP</span>
                  <div
                    onClick={() => setDlpEnabled(!dlpEnabled)}
                    className="relative cursor-pointer"
                    style={{ width: 42, height: 24 }}
                  >
                    <div
                      className="absolute inset-0 rounded-full transition-colors"
                      style={{ background: dlpEnabled ? '#3F9B2F' : '#D1D5DB' }}
                    />
                    <div
                      className="absolute top-1 rounded-full bg-white transition-transform shadow"
                      style={{ width: 16, height: 16, left: dlpEnabled ? 22 : 4, transitionProperty: 'left' }}
                    />
                  </div>
                </label>
              </div>

              <div
                className="divide-y divide-gray-100"
                style={{ opacity: dlpEnabled ? 1 : 0.45, pointerEvents: dlpEnabled ? 'auto' : 'none' }}
              >
                {/* GCP project */}
                <div className="px-6 py-4 space-y-4">
                  <div className="rounded-lg p-4 text-sm" style={{ background: '#E8F4F8', borderLeft: '4px solid #1E88FF' }}>
                    <p className="font-medium text-blue-800 mb-1">Authentication</p>
                    <p className="text-blue-700 leading-relaxed">
                      <strong>Local dev:</strong> set <code className="bg-blue-100 px-1 rounded">GOOGLE_APPLICATION_CREDENTIALS</code> to
                      your service account JSON key path.
                      <br />
                      <strong>Cloud Run:</strong> attach a service account with the{' '}
                      <code className="bg-blue-100 px-1 rounded">roles/dlp.user</code> role — no key file needed
                      (Workload Identity). The API key field below is for dev/testing only.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">GCP Project ID</label>
                      <input
                        type="text"
                        value={gcpProjectId}
                        onChange={(e) => setGcpProjectId(e.target.value)}
                        placeholder="my-gcp-project-123"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
                      <select
                        value={gcpLocation}
                        onChange={(e) => setGcpLocation(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="global">global (default)</option>
                        <option value="us">us (data residency: US)</option>
                        <option value="us-east1">us-east1</option>
                        <option value="us-central1">us-central1</option>
                        <option value="europe-west1">europe-west1</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      API Key (dev/testing only — use service account in production)
                    </label>
                    <div className="relative">
                      <input
                        type={showDlpKey ? 'text' : 'password'}
                        value={dlpApiKey}
                        onChange={(e) => setDlpApiKey(e.target.value)}
                        placeholder="AIza..."
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                        style={{ paddingRight: 36 }}
                      />
                      <button
                        onClick={() => setShowDlpKey(!showDlpKey)}
                        className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <FontAwesomeIcon icon={showDlpKey ? faEyeSlash : faEye} style={{ fontSize: 14 }} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Likelihood threshold */}
                <div className="px-6 py-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Minimum Likelihood to Flag
                  </label>
                  <select
                    value={dlpLikelihood}
                    onChange={(e) => setDlpLikelihood(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="VERY_UNLIKELY">Very Unlikely (flag everything)</option>
                    <option value="UNLIKELY">Unlikely</option>
                    <option value="POSSIBLE">Possible</option>
                    <option value="LIKELY">Likely (recommended)</option>
                    <option value="VERY_LIKELY">Very Likely (least sensitive)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Maps to the DLP API <code className="bg-gray-100 px-1 rounded">minLikelihood</code> parameter.
                  </p>
                </div>

                {/* Info types */}
                <div className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Info Types to Detect</p>
                  {['PII', 'HIPAA', 'Technical'].map((group) => (
                    <div key={group} className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{group}</p>
                      <div className="flex flex-wrap gap-2">
                        {DLP_INFO_TYPES.filter((t) => t.group === group).map((t) => {
                          const active = selectedInfoTypes.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              onClick={() => toggleInfoType(t.id)}
                              className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                              style={{
                                background:   active ? '#EEF4FF' : 'white',
                                borderColor:  active ? '#1E88FF' : '#E5E7EB',
                                color:        active ? '#1E88FF' : '#6B7280',
                              }}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 py-4 flex items-center justify-between">
                <SaveStatusBadge status={dlpSave} />
                <button
                  onClick={saveDlpConfig}
                  disabled={dlpSave.state === 'saving'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: '#1E88FF' }}
                >
                  <FontAwesomeIcon icon={faSave} style={{ fontSize: 13 }} />
                  {dlpSave.state === 'saving' ? 'Saving…' : 'Save DLP Settings'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Compliance tab ────────────────────────────────────────────────── */}
        {tab === 'compliance' && (
          <>
            {/* Period selector */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Period:</span>
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => { setComplianceDays(d); loadCompliance(d); }}
                    className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                    style={{
                      background:  complianceDays === d ? '#EEF4FF' : 'white',
                      borderColor: complianceDays === d ? '#1E88FF' : '#E5E7EB',
                      color:       complianceDays === d ? '#1E88FF' : '#6B7280',
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <button
                onClick={() => loadCompliance(complianceDays)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <FontAwesomeIcon icon={faRedoAlt} style={{ fontSize: 12 }} />
                Refresh
              </button>
            </div>

            {complianceLoading && (
              <div className="flex items-center justify-center py-16">
                <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: 24, color: '#1E88FF' }} />
              </div>
            )}

            {complianceError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4 text-sm text-red-700">
                {complianceError}
              </div>
            )}

            {complianceSummary && !complianceLoading && (
              <>
                {/* Decision distribution */}
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                  <div className="px-6 py-4 flex items-center gap-3">
                    <FontAwesomeIcon icon={faChartBar} style={{ color: '#1E88FF', fontSize: 16 }} />
                    <div>
                      <h2 className="font-semibold text-gray-900">AI Output Decisions</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {complianceSummary.totalEvents} evaluations in last {complianceSummary.periodDays} days
                        {complianceSummary.latestPolicyVersion && (
                          <> · Policy <span className="font-mono">{complianceSummary.latestPolicyVersion}</span></>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="px-6 py-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {(['ALLOW', 'REDACT', 'BLOCK', 'ESCALATE'] as const).map((d) => {
                      const count = complianceSummary.decisionCounts[d] ?? 0;
                      const pct   = complianceSummary.totalEvents > 0
                        ? Math.round((count / complianceSummary.totalEvents) * 100) : 0;
                      const colors: Record<string, { bg: string; text: string; icon: typeof faCheck }> = {
                        ALLOW:    { bg: '#F0FDF4', text: '#166534', icon: faCheck },
                        REDACT:   { bg: '#FFF8E1', text: '#B45309', icon: faShieldAlt },
                        BLOCK:    { bg: '#FEF2F2', text: '#991B1B', icon: faBan },
                        ESCALATE: { bg: '#FEF9C3', text: '#854D0E', icon: faClock },
                      };
                      const c = colors[d];
                      return (
                        <div key={d} className="rounded-xl p-4" style={{ background: c.bg }}>
                          <div className="flex items-center gap-2 mb-2">
                            <FontAwesomeIcon icon={c.icon} style={{ fontSize: 12, color: c.text }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.text }}>{d}</span>
                          </div>
                          <div className="text-2xl font-bold" style={{ color: c.text }}>{count}</div>
                          <div className="text-xs mt-0.5" style={{ color: c.text, opacity: 0.7 }}>{pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Key metrics row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Synthesis Events</p>
                    <p className="text-2xl font-bold text-gray-900">{complianceSummary.synthesisEvents}</p>
                    <p className="text-xs text-gray-400 mt-1">Cross-client PHI risk detections</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Tokens Redacted</p>
                    <p className="text-2xl font-bold text-gray-900">{complianceSummary.totalRedactions}</p>
                    <p className="text-xs text-gray-400 mt-1">PHI removed before delivery</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Event Types</p>
                    {Object.entries(complianceSummary.eventTypeCounts).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm mt-1">
                        <span className="text-gray-600 text-xs">{k.replace('_', ' ').toLowerCase()}</span>
                        <span className="font-semibold text-gray-900">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top detectors */}
                {Object.keys(complianceSummary.topDetectors).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                    <div className="px-6 py-4 flex items-center gap-3">
                      <FontAwesomeIcon icon={faShieldVirus} style={{ color: '#7C3AED', fontSize: 16 }} />
                      <h2 className="font-semibold text-gray-900">Detector Activity</h2>
                    </div>
                    <div className="px-6 py-4 space-y-3">
                      {Object.entries(complianceSummary.topDetectors).map(([detector, count]) => {
                        const maxVal = Math.max(...Object.values(complianceSummary.topDetectors));
                        const pct    = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0;
                        return (
                          <div key={detector}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-mono text-gray-700 text-xs">{detector}</span>
                              <span className="font-semibold text-gray-900">{count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: '#7C3AED' }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent escalations */}
                {complianceSummary.recentEscalations.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                    <div className="px-6 py-4 flex items-center gap-3">
                      <FontAwesomeIcon icon={faClock} style={{ color: '#B45309', fontSize: 16 }} />
                      <h2 className="font-semibold text-gray-900">Recent Escalations</h2>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {complianceSummary.recentEscalations.map((e, i) => (
                        <div key={i} className="px-6 py-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {e.eventType?.replace('_', ' ').toLowerCase()}
                              {e.synthesis && (
                                <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                  synthesis
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 font-mono">{e.contentId}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {e.sensitivity && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{
                                  background: e.sensitivity === 'HIGH' ? '#fee2e2' : '#FEF9C3',
                                  color:      e.sensitivity === 'HIGH' ? '#991B1B' : '#854D0E',
                                }}>
                                {e.sensitivity}
                              </span>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {e.timestamp ? new Date(e.timestamp).toLocaleDateString() : '--'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400 text-center pb-4">
                  Powered by ACLX · Data from myABA audit log · Sensitive content excluded
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Save status badge ─────────────────────────────────────────────────────────

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status.state === 'idle') return null;
  const styles: Record<string, { bg: string; text: string }> = {
    saving: { bg: '#EEF4FF', text: '#1E88FF' },
    saved:  { bg: '#F0FDF4', text: '#3F9B2F' },
    error:  { bg: '#FEF2F2', text: '#DC2626' },
  };
  const s = styles[status.state] ?? styles.saving;
  const label =
    status.state === 'saving' ? 'Saving…' :
    status.state === 'saved'  ? 'Saved' :
    status.message ?? 'Error';
  return (
    <span
      className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full"
      style={{ background: s.bg, color: s.text }}
    >
      {status.state === 'saved' && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 11 }} />}
      {status.state === 'error' && <FontAwesomeIcon icon={faExclamationTriangle} style={{ fontSize: 11 }} />}
      {label}
    </span>
  );
}
