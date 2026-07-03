import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCog, faRobot, faShieldAlt, faCloud,
  faEye, faEyeSlash, faCheck, faExclamationTriangle,
  faFlask, faSave, faInfoCircle, faCheckCircle, faTimesCircle, faSyncAlt, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { PlatformConfig, HealthReport, ServiceHealth } from '../lib/api';

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

  // AI state — Gemini on Vertex AI (ADC, no API key). Models are set via
  // GEMINI_MODEL_FAST / GEMINI_MODEL_REASONING env vars; shown here read-only.
  const [modelFast, setModelFast]           = useState('gemini-3.1-flash-lite');
  const [modelReasoning, setModelReasoning] = useState('gemini-2.5-pro');
  const [testState, setTestState] = useState<'idle'|'testing'|'ok'|'fail'>('idle');

  // DLP state
  const [dlpEnabled, setDlpEnabled]     = useState(false);
  const [gcpProject, setGcpProject]     = useState('');
  const [gcpLocation, setGcpLocation]   = useState('global');
  const [dlpLikelihood, setDlpLikelihood] = useState('LIKELY');
  const [dlpInfoTypes, setDlpInfoTypes] = useState<string[]>(['PERSON_NAME','DATE_OF_BIRTH','MEDICAL_RECORD_NUMBER','US_HEALTHCARE_NPI']);
  const [showDlpKey, setShowDlpKey]     = useState(false);
  const [dlpKey, setDlpKey]             = useState('');
  const [dlpSave, setDlpSave]           = useState<SaveState>('idle');

  // ACLX + DLP are controlled by deployment env vars (aclx.enabled / dlp.enabled),
  // NOT by this UI. We show the REAL runtime state via a live health probe rather
  // than an editable toggle that wouldn't actually change anything.
  const [health, setHealth]         = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const loadHealth = async () => {
    setHealthLoading(true);
    try { setHealth(await api.getHealth()); } catch { setHealth(null); }
    finally { setHealthLoading(false); }
  };
  useEffect(() => { void loadHealth(); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const c = await api.getPlatformConfig();
        setCfg(c);
        if (c.geminiModelFast)      setModelFast(c.geminiModelFast);
        if (c.geminiModelReasoning) setModelReasoning(c.geminiModelReasoning);
        setDlpEnabled(c.dlpEnabled ?? false);
        setGcpProject(c.dlpGcpProjectId ?? '');
        setGcpLocation(c.dlpLocation ?? 'global');
        setDlpLikelihood(c.dlpLikelihood ?? 'LIKELY');
        if (c.dlpInfoTypes?.length) setDlpInfoTypes(c.dlpInfoTypes);
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
                  Gemini runs on Vertex AI under the service account (Application Default
                  Credentials — no API key), covered by the Google Cloud BAA. Models are
                  configured via <code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4 }}>GEMINI_MODEL_FAST</code> /{' '}
                  <code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4 }}>GEMINI_MODEL_REASONING</code>{' '}
                  env vars on the Cloud Run service; the values below are informational.
                </InfoBox>

                <Card title="Model Tiers">
                  <Field label="Fast tier (chat + light documents)">
                    <input value={modelFast} readOnly
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none', color: '#6B7280', background: '#F9FAFB' }} />
                  </Field>
                  <Field label="Reasoning tier (signable clinical documents)" style={{ marginTop: 12 }}>
                    <input value={modelReasoning} readOnly
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none', color: '#6B7280', background: '#F9FAFB' }} />
                  </Field>
                </Card>

                <Card title="API Connectivity">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <p style={{ fontSize: 13, color: '#6B7280', margin: 0, flex: 1 }}>
                      Verify the API backend is reachable from this console.
                    </p>
                    <ActionButton
                      onClick={testConnection}
                      disabled={testState === 'testing'}
                      state={testState === 'ok' ? 'success' : testState === 'fail' ? 'error' : 'default'}
                      icon={testState === 'ok' ? faCheck : testState === 'fail' ? faExclamationTriangle : faFlask}
                      label={testState === 'testing' ? 'Testing…' : testState === 'ok' ? 'Connected' : testState === 'fail' ? 'Failed' : 'Test'}
                    />
                  </div>
                </Card>
              </div>
            )}

            {/* ── DLP tab ──────────────────────────────────────────────── */}
            {tab === 'dlp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InfoBox icon={faInfoCircle} color="#1D4ED8" bg="#EFF6FF">
                  Two layers, don’t confuse them: the always-on <b>input guard</b> (blocks SSNs, payment
                  cards, and driver’s licenses before the model, controlled by the{' '}
                  <code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4 }}>DLP_ENABLED</code> deployment flag)
                  is shown by the live status below. The settings underneath configure <b>Google Cloud DLP</b> —
                  an <i>optional</i> managed scanner that is not active unless you turn it on and supply a GCP project.
                </InfoBox>

                <LiveStatus service={health?.dlp} loading={healthLoading} checkedAt={health?.checkedAt} onRefresh={loadHealth} />

                <Card title="Google Cloud DLP (optional)" headerRight={
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

            {/* ── ACLX tab — live status (env-controlled, not editable here) ── */}
            {tab === 'aclx' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InfoBox icon={faInfoCircle} color="#1D4ED8" bg="#EFF6FF">
                  ACLX is the HIPAA output-governance gateway. It’s enabled and pointed at its
                  gateway via deployment config (<code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4 }}>ACLX_ENABLED</code> /{' '}
                  <code style={{ background: '#DBEAFE', padding: '1px 4px', borderRadius: 4 }}>ACLX_GATEWAY_URL</code>) — a
                  deploy-reviewed control, not a web toggle. The live status below is a real probe of the running service.
                </InfoBox>
                <LiveStatus service={health?.aclx} loading={healthLoading} checkedAt={health?.checkedAt} onRefresh={loadHealth} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Live service status from the /platform/health probe (real reachability, not a stored flag). */
function LiveStatus({ service, loading, checkedAt, onRefresh }: {
  service?: ServiceHealth; loading: boolean; checkedAt?: string; onRefresh: () => void;
}) {
  const up = service?.up ?? false;
  return (
    <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${loading ? '#E5E7EB' : up ? '#D1FAE5' : '#FEE2E2'}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading
            ? <FontAwesomeIcon icon={faSpinner} spin style={{ color: '#9CA3AF', fontSize: 18 }} />
            : <FontAwesomeIcon icon={up ? faCheckCircle : faTimesCircle} style={{ color: up ? '#16A34A' : '#DC2626', fontSize: 18 }} />}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {service?.name ?? 'Service'} — {loading ? 'checking…' : up ? 'Enabled & reachable' : 'Not reachable'}
            </div>
            {!loading && service?.message && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{service.message}</div>}
          </div>
        </div>
        <button onClick={onRefresh} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, color: '#374151' }}>
          <FontAwesomeIcon icon={faSyncAlt} style={{ fontSize: 12 }} /> Recheck
        </button>
      </div>
      {!loading && (
        <div style={{ display: 'flex', gap: 20, padding: '10px 18px', borderTop: '1px solid #F3F4F6', fontSize: 12, color: '#9CA3AF' }}>
          {service && service.latencyMs > 0 && <span>Latency: {service.latencyMs}ms</span>}
          {checkedAt && <span>Checked: {new Date(checkedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      )}
    </div>
  );
}

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
