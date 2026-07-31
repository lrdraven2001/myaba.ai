import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding, faShieldAlt, faCreditCard, faSpinner,
  faSlidersH, faToggleOn, faToggleOff, faMinus, faCheck, faLock,
  faMobileAlt, faPlus, faTimes, faPen, faPlug,
  faSearch, faLink, faUnlink, faCheckCircle, faExclamationCircle,
  faUpload, faExclamationTriangle, faTag,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { api } from '../lib/api';
import OrganizationTab from './settings/OrganizationTab';
import RolesPermissionsTab from './settings/RolesPermissionsTab';
import ContentRulesTab from './settings/ContentRulesTab';
import SecurityIdentityTab from './settings/SecurityIdentityTab';
import BillingUsageTab from './settings/BillingUsageTab';
import { SectionHeading } from '../components/settings/primitives';
import type { EhrClientRecord, EhrConnectionStatus, OfficePuzzleImportResult } from '../types';

type Tab = 'org' | 'roles' | 'content_rules' | 'security' | 'integrations' | 'billing';

const TABS: { id: Tab; icon: typeof faBuilding; label: string }[] = [
  { id: 'org',           icon: faBuilding,   label: 'Organization'        },
  { id: 'roles',         icon: faSlidersH,   label: 'Roles & Permissions' },
  { id: 'content_rules', icon: faTag,        label: 'Content Rules'       },
  { id: 'security',      icon: faShieldAlt,  label: 'Security & Identity' },
  { id: 'integrations',  icon: faPlug,       label: 'Integrations'        },
  { id: 'billing',       icon: faCreditCard, label: 'Billing & Usage'     },
];

export default function SettingsView() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('org');

  const { can }   = usePermissions();
  const isAdmin   = can('ADMIN_MANAGE');
  const orgId     = currentUser?.orgId ?? '';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header + horizontal tab bar */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-8 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your organization, security, integrations, and platform preferences.
        </p>
        <nav className="flex gap-6 mt-5 overflow-x-auto" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={`relative pb-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-teal-700' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ background: '#2a5f6f' }} />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'org'           && <OrganizationTab orgId={orgId} isAdmin={isAdmin} onNavigateTab={(t) => setActiveTab(t as Tab)} />}
        {activeTab === 'roles'         && <RolesPermissionsTab orgId={orgId} isAdmin={isAdmin} />}
        {activeTab === 'content_rules' && <ContentRulesTab orgId={orgId} isAdmin={isAdmin} />}
        {activeTab === 'security'      && <SecurityIdentityTab orgId={orgId} isAdmin={isAdmin} />}
        {activeTab === 'integrations'  && <IntegrationsTab orgId={orgId} isAdmin={isAdmin} />}
        {activeTab === 'billing'       && <BillingUsageTab orgId={orgId} isAdmin={isAdmin} />}
      </div>
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
    <div className="max-w-4xl">
      <SectionHeading
        title="Integrations"
        description="Connect myABA.ai to your practice management system to automatically pull client records. Credentials are encrypted at rest and never visible after saving."
      />

      <div className="flex flex-col gap-5 mt-2">
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
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
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
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

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

// ── Shared helpers ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
    </div>
  );
}
