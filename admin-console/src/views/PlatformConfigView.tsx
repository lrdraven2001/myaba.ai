import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCog, faRobot, faShieldAlt, faCloud,
  faEye, faEyeSlash, faCheck, faExclamationTriangle,
  faFlask, faSave, faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { PlatformConfig } from '../lib/api';

type TabId = 'ai' | 'dlp' | 'aclx';

const DLP_INFO_TYPES = [
  { id: 'PERSON_NAME',               label: 'Person Name',           group: 'PII'      },
  { id: 'EMAIL_ADDRESS',             label: 'Email Address',         group: 'PII'      },
  { id: 'PHONE_NUMBER',              label: 'Phone Number',          group: 'PII'      },
  { id: 'DATE_OF_BIRTH',             label: 'Date of Birth',         group: 'PII'      },
  { id: 'US_SOCIAL_SECURITY_NUMBER', label: 'SSN',                   group: 'PII'      },
  { id: 'MEDICAL_RECORD_NUMBER',     label: 'Medical Record #',      group: 'HIPAA'    },
  { id: 'US_HEALTHCARE_NPI',         label: 'NPI Number',            group: 'HIPAA'    },
  { id: 'ICD9_CODE',                 label: 'ICD-9 Code',            group: 'HIPAA'    },
  { id: 'ICD10_CODE',                label: 'ICD-10 Code',           group: 'HIPAA'    },
  { id: 'LOCATION',                  label: 'Address / Location',    group: 'PII'      },
  { id: 'IP_ADDRESS',                label: 'IP Address',            group: 'Technical'},
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function PlatformConfigView() {
  const [tab, setTab]       = useState<TabId>('ai');
  const [cfg, setCfg]       = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // AI state
  const [model, setModel]         = useState('claude-sonnet-4-6');
  const [maxTokens, setMaxTokens] = useState('4000');
  const [apiKey, setApiKey]       = useState('');
  const [showKey, setShowKey]     = useState(false);
  const [testState, setTestState] = useState<'idle'|'testing'|'ok'|'fail'>('idle');
  const [aiSave, setAiSave]       = useState<SaveState>('idle');

  // DLP state
  const [dlpEnabled, setDlpEnabled]     = useState(false);
  const [gcpProject, setGcpProject]     = useState('');
  const [gcpLocation, setGcpLocation]   = useState('global');
  const [dlpLikelihood, setDlpLikelihood] = useState('LIKELY');
  const [dlpInfoTypes, setDlpInfoTypes] = useState<string[]>(['PERSON_NAME','DATE_OF_BIRTH','MEDICAL_RECORD_NUMBER','US_HEALTHCARE_NPI']);
  const [showDlpKey, setShowDlpKey]     = useState(false);
  const [dlpKey, setDlpKey]             = useState('');
  const [dlpSave, setDlpSave]           = useState<SaveState>('idle');

  // ACLX state
  const [aclxEnabled, setAclxEnabled]   = useState(false);
  const [aclxUrl, setAclxUrl]           = useState('http://localhost:8080');
  const [aclxSave, setAclxSave]         = useState<SaveState>('idle');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const c = await api.getPlatformConfig();
        setCfg(c);
        setModel(c.anthropicModel);
        setMaxTokens(String(c.anthropicMaxTokens));
        setDlpEnabled(c.dlpEnabled);
        setGcpProject(c.dlpGcpProjectId);
        setGcpLocation(c.dlpLocation);
        setDlpLikelihood(c.dlpLikelihood);
        setDlpInfoTypes(c.dlpInfoTypes);
        setAclxEnabled(c.aclxEnabled);
        setAclxUrl(c.aclxGatewayUrl);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  void cfg; // used for initial load only

  const testConnection = async () => {
    setTestState('testing');
    try { await api.ping(); setTestState('ok'); }
    catch { setTestState('fail'); }
    setTimeout(() => setTestState('idle'), 4000);
  };

  const saveAi = async () => {
    setAiSave('saving');
    try {
      await api.updatePlatformConfig({ anthropicModel: model, anthropicMaxTokens: parseInt(maxTokens, 10) });
      setAiSave('saved');
    } catch { setAiSave('error'); }
    setTimeout(() => setAiSave('idle'), 3000);
  };

  const saveDlp = async () => {
    setDlpSave('saving');
    try {
      await api.updatePlatformConfig({
        dlpEnabled, dlpGcpProjectId: gcpProject,
        dlpLocation: gcpLocation, dlpLikelihood, dlpInfoTypes,
      });
      setDlpSave('saved');
    } catch { setDlpSave('error'); }
    setTimeout(() => setDlpSave('idle'), 3000);
  };

  const saveAclx = async () => {
    setAclxSave('saving');
    try {
      await api.updatePlatformConfig({ aclxEnabled, aclxGatewayUrl: aclxUrl });
      setAclxSave('saved');
    } catch { setAclxSave('error'); }
    setTimeout(() => setAclxSave('idle'), 3000);
  };

  const toggleInfoType = (id: string) =>
    setDlpInfoTypes((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const TABS: { id: TabId; label: string; icon: typeof faCog }[] = [
    { id: 'ai',   label: 'AI Model',  icon: faRobot     },
    { id: 'dlp',  label: 'DLP',       icon: faCloud     },
    { id: 'aclx', label: 'ACLX',      icon: faShieldAlt },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 28px 0', background: 'white', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesomeIcon icon={faCog} style={{ color: '#1D4ED8', fontSize: 16 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Platform Config</h1>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>AI model, Google DLP, ACLX gateway settings</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: 13, fontWeight: 500, background: 'transparent', border: 'none', borderBottom: tab === t.id ? '2px solid #1D4ED8' : '2px solid transparent', color: tab === t.id ? '#1D4ED8' : '#6B7280', cursor: 'pointer' }}>
              <FontAwesomeIcon icon={t.icon} style={{ fontSize: 12 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading config…</div>
        ) : (
          <div style={{ maxWidth: 680 }}>

            {/* ── AI tab ──────────────────────────────────────────────── */}
            {tab === 'ai' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InfoBox icon={faInfoCircle} color="#1D4ED8" bg="#EFF6FF">
                  The Anthropic API key is never stored in the database.
                  Set it as <code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4 }}>ANTHROPIC_API_KEY</code> in
                  your Cloud Run service, or in <code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4 }}>application-local.yml</code> for local dev.
                  Use the field below only to verify connectivity.
                </InfoBox>

                <Card title="API Key Verification">
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-ant-api03-…"
                        style={{ width: '100%', padding: '9px 36px 9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none', color: '#111827' }} />
                      <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                        <FontAwesomeIcon icon={showKey ? faEyeSlash : faEye} style={{ fontSize: 13 }} />
                      </button>
                    </div>
                    <ActionButton
                      onClick={testConnection}
                      disabled={testState === 'testing'}
                      state={testState === 'ok' ? 'success' : testState === 'fail' ? 'error' : 'default'}
                      icon={testState === 'ok' ? faCheck : testState === 'fail' ? faExclamationTriangle : faFlask}
                      label={testState === 'testing' ? 'Testing…' : testState === 'ok' ? 'Connected' : testState === 'fail' ? 'Failed' : 'Test'}
                    />
                  </div>
                </Card>

                <Card title="Model Settings">
                  <Field label="Model">
                    <select value={model} onChange={(e) => setModel(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, color: '#111827', outline: 'none' }}>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6  (recommended)</option>
                      <option value="claude-opus-4-5">claude-opus-4-5  (highest quality)</option>
                      <option value="claude-haiku-4-5">claude-haiku-4-5  (fastest)</option>
                    </select>
                  </Field>
                  <Field label="Max Output Tokens">
                    <input type="number" min={256} max={16000} step={256} value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                    <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Default 4000. BIPs/FBAs may need 8000.</p>
                  </Field>
                  <SaveRow saveState={aiSave} onSave={saveAi} />
                </Card>
              </div>
            )}

            {/* ── DLP tab ──────────────────────────────────────────────── */}
            {tab === 'dlp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InfoBox icon={faInfoCircle} color="#1D4ED8" bg="#EFF6FF">
                  Google Sensitive Data Protection scans AI outputs for PHI before delivery.{' '}
                  <a href="https://cloud.google.com/sensitive-data-protection/docs/reference/rest" target="_blank" rel="noreferrer"
                    style={{ color: '#1D4ED8' }}>API reference</a>.
                  For Cloud Run, use Workload Identity (no key file). For local dev, set
                  <code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4, marginLeft: 4 }}>GOOGLE_APPLICATION_CREDENTIALS</code>.
                </InfoBox>

                <Card title="Google DLP" headerRight={
                  <Toggle enabled={dlpEnabled} onToggle={() => setDlpEnabled(!dlpEnabled)} label="Enable" />
                }>
                  <div style={{ opacity: dlpEnabled ? 1 : 0.45, pointerEvents: dlpEnabled ? 'auto' : 'none' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <Field label="GCP Project ID">
                        <input value={gcpProject} onChange={(e) => setGcpProject(e.target.value)}
                          placeholder="my-project-id"
                          style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                      </Field>
                      <Field label="Location">
                        <select value={gcpLocation} onChange={(e) => setGcpLocation(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                          <option value="global">global</option>
                          <option value="us">us (data residency)</option>
                          <option value="us-east1">us-east1</option>
                          <option value="us-central1">us-central1</option>
                        </select>
                      </Field>
                    </div>

                    <Field label="API Key (dev/test only — use service account in production)">
                      <div style={{ position: 'relative' }}>
                        <input type={showDlpKey ? 'text' : 'password'} value={dlpKey}
                          onChange={(e) => setDlpKey(e.target.value)} placeholder="AIza…"
                          style={{ width: '100%', padding: '9px 36px 9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none' }} />
                        <button onClick={() => setShowDlpKey(!showDlpKey)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                          <FontAwesomeIcon icon={showDlpKey ? faEyeSlash : faEye} style={{ fontSize: 13 }} />
                        </button>
                      </div>
                    </Field>

                    <Field label="Minimum Likelihood to Flag" style={{ marginTop: 12 }}>
                      <select value={dlpLikelihood} onChange={(e) => setDlpLikelihood(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                        <option value="VERY_UNLIKELY">Very Unlikely (flag everything)</option>
                        <option value="UNLIKELY">Unlikely</option>
                        <option value="POSSIBLE">Possible</option>
                        <option value="LIKELY">Likely (recommended)</option>
                        <option value="VERY_LIKELY">Very Likely</option>
                      </select>
                    </Field>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 10 }}>Info Types to Detect</div>
                      {['PII', 'HIPAA', 'Technical'].map((grp) => (
                        <div key={grp} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{grp}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {DLP_INFO_TYPES.filter((t) => t.group === grp).map((t) => {
                              const on = dlpInfoTypes.includes(t.id);
                              return (
                                <button key={t.id} onClick={() => toggleInfoType(t.id)}
                                  style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1px solid ${on ? '#1D4ED8' : '#E5E7EB'}`, background: on ? '#EFF6FF' : 'white', color: on ? '#1D4ED8' : '#6B7280', cursor: 'pointer' }}>
                                  {t.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <SaveRow saveState={dlpSave} onSave={saveDlp} />
                </Card>
              </div>
            )}

            {/* ── ACLX tab ─────────────────────────────────────────────── */}
            {tab === 'aclx' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InfoBox icon={faInfoCircle} color="#1D4ED8" bg="#EFF6FF">
                  ACLX is the HIPAA output governance gateway. In dev mode it is disabled
                  and all responses pass through. Enable this before going live with real PHI.
                </InfoBox>

                <Card title="ACLX Gateway" headerRight={
                  <Toggle enabled={aclxEnabled} onToggle={() => setAclxEnabled(!aclxEnabled)} label="Enable" />
                }>
                  <div style={{ opacity: aclxEnabled ? 1 : 0.45, pointerEvents: aclxEnabled ? 'auto' : 'none' }}>
                    <Field label="Gateway URL">
                      <input value={aclxUrl} onChange={(e) => setAclxUrl(e.target.value)}
                        placeholder="http://localhost:8080"
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none' }} />
                      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                        For Cloud Run: use the internal service URL of your ACLX sidecar container.
                      </p>
                    </Field>
                  </div>
                  <SaveRow saveState={aclxSave} onSave={saveAclx} />
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, children, headerRight }: { title: string; children: React.ReactNode; headerRight?: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{title}</div>
        {headerRight}
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function InfoBox({ icon, color, bg, children }: { icon: typeof faInfoCircle; color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: bg, borderRadius: 10, border: `1px solid ${color}30` }}>
      <FontAwesomeIcon icon={icon} style={{ color, fontSize: 14, marginTop: 2, flexShrink: 0 }} />
      <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <span style={{ fontSize: 12, color: '#6B7280' }}>{label}</span>
      <div onClick={onToggle} style={{ position: 'relative', width: 40, height: 22, cursor: 'pointer' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 11, background: enabled ? '#1D4ED8' : '#D1D5DB', transition: 'background 0.2s' }} />
        <div style={{ position: 'absolute', top: 3, left: enabled ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
    </label>
  );
}

function ActionButton({ onClick, disabled, state, icon, label }: {
  onClick: () => void; disabled: boolean;
  state: 'default' | 'success' | 'error';
  icon: typeof faCheck; label: string;
}) {
  const colors = { default: { bg: 'white', border: '#E5E7EB', text: '#374151' }, success: { bg: '#F0FDF4', border: '#16A34A', text: '#16A34A' }, error: { bg: '#FEF2F2', border: '#DC2626', text: '#DC2626' } };
  const c = colors[state];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13, color: c.text, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
      <FontAwesomeIcon icon={icon} style={{ fontSize: 12 }} />
      {label}
    </button>
  );
}

function SaveRow({ saveState, onSave }: { saveState: SaveState; onSave: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 8, gap: 12 }}>
      {saveState === 'saved'  && <span style={{ fontSize: 12, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faCheck} style={{ fontSize: 11 }} /> Saved</span>}
      {saveState === 'error'  && <span style={{ fontSize: 12, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faExclamationTriangle} style={{ fontSize: 11 }} /> Error</span>}
      <button onClick={onSave} disabled={saveState === 'saving'}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#1D4ED8', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'white', cursor: saveState === 'saving' ? 'default' : 'pointer' }}>
        <FontAwesomeIcon icon={faSave} style={{ fontSize: 12 }} />
        {saveState === 'saving' ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
