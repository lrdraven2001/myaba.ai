import { useState, useEffect, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faChevronRight, faArrowLeft,
  faSortAlphaDown, faSortAlphaUp, faFilter, faCommentDots,
  faFileAlt, faFolderOpen, faLink, faSpinner, faTimes,
  faRobot, faComments, faExternalLinkAlt,
  faUserNurse, faUsers, faCheck, faShieldAlt, faTrashAlt,
  faBoxArchive, faBoxOpen, faFileExport, faUpload, faDownload,
} from '@fortawesome/free-solid-svg-icons';
import { faGoogle, faMicrosoft } from '@fortawesome/free-brands-svg-icons';
import type { Client, PolicyDocument, Chat, DriveConnection, UserRole } from '../types';
import { canManageClients, isClinicalRole } from '../types';
import ClientAuthorizationsPanel from '../components/ClientAuthorizationsPanel';
import GenerateDocumentModal from '../components/GenerateDocumentModal';
import DriveConnectWizard from '../components/drive/DriveConnectWizard';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { usePagination, Pagination } from '../components/Pagination';
import CreatedByPill, { type MemberLike } from '../components/CreatedByPill';

/** Best-effort display name for a client. */
function clientDisplayName(c: { preferredName?: string; firstName?: string; lastName?: string; legalName?: string }): string {
  return c.preferredName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.legalName || 'this client';
}

/** SHA-256 hex of a file's bytes — matches the backend's stored contentHash so we
 *  can detect an identical file (even renamed) before re-uploading. Empty on failure. */
async function sha256Hex(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientTab   = 'info' | 'documents' | 'chats' | 'treatment_team' | 'ehr' | 'authorizations' | 'resources';
type SortField   = 'lastName' | 'firstName' | 'dateOfBirth' | 'diagnosis';
type SortDir     = 'asc' | 'desc';

const TABS: { key: ClientTab; label: string }[] = [
  { key: 'info',           label: 'Client Information'   },
  { key: 'documents',      label: 'Documents'            },
  { key: 'chats',          label: 'Chats'                },
  { key: 'treatment_team', label: 'Treatment Team'       },
  { key: 'ehr',            label: 'EHR Connect'          },
  { key: 'authorizations', label: 'Authorizations'       },
  { key: 'resources',      label: 'Connected Resources'  },
];

const EMPTY_CLIENT = {
  firstName: '', lastName: '', preferredName: '', dateOfBirth: '',
  gender: '', diagnosis: '', primaryInsurance: '',
  ehrProvider: '', ehrCaseId: '',
};


function toInitials(client: { firstName?: string; lastName?: string; legalName?: string }) {
  const f = client.firstName?.[0]?.toUpperCase() ?? '';
  const l = client.lastName?.[0]?.toUpperCase() ?? '';
  if (f || l) return (f + l) || '?';
  // fallback for legacy records without firstName/lastName
  return (client.legalName ?? '').split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?';
}

function fullName(client: { firstName?: string; lastName?: string; legalName?: string }) {
  if (client.firstName || client.lastName) {
    return [client.firstName, client.lastName].filter(Boolean).join(' ');
  }
  return client.legalName ?? '';
}

function displayName(client: { firstName?: string; lastName?: string; legalName?: string; preferredName?: string }) {
  return client.preferredName || fullName(client);
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function ClientsView({ onStartChat, onOpenChat }: { onStartChat?: (clientId: string) => void; onOpenChat?: (chatId: string) => void }) {
  const { currentUser } = useAuth();
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [insurers, setInsurers]       = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab]     = useState<ClientTab>('info');
  const [form, setForm]               = useState(EMPTY_CLIENT);
  const [editGuardians, setEditGuardians] = useState<{ name: string; relationship: string }[]>([]);
  const [savingClient, setSavingClient]   = useState(false);
  const [clientSaved, setClientSaved]     = useState(false);

  // List controls
  const [search, setSearch]           = useState('');
  const [clientTab, setClientTab]     = useState<'active' | 'archived'>('active');
  const [sortField, setSortField]     = useState<SortField>('lastName');
  const [sortDir, setSortDir]         = useState<SortDir>('asc');
  const [filterDx, setFilterDx]       = useState('');
  const [showSortMenu, setShowSortMenu]     = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showNewClient, setShowNewClient]   = useState(false);
  const [orgMembers, setOrgMembers]         = useState<MemberLike[]>([]);

  // Load clients + insurance companies
  useEffect(() => {
    setLoading(true);
    api.getClients()
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
    if (currentUser?.orgId) {
      api.getInsuranceCompanies(currentUser.orgId)
        .then((r) => setInsurers(r.companies ?? []))
        .catch(() => {});
      // Org members — used to render actual team-member names on client rows.
      api.getOrgMembers(currentUser.orgId).then(setOrgMembers).catch(() => {});
    }
  }, [currentUser?.orgId]);


  // Unique diagnoses for filter dropdown
  const diagnosisOptions = useMemo(
    () => Array.from(new Set(clients.map((c) => c.diagnosis).filter(Boolean))).sort(),
    [clients],
  );

  // Filtered + sorted list
  const displayClients = useMemo(() => {
    let list = clients.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (c.firstName ?? '').toLowerCase().includes(q) ||
        (c.lastName  ?? '').toLowerCase().includes(q) ||
        (c.preferredName ?? '').toLowerCase().includes(q) ||
        (c.legalName ?? '').toLowerCase().includes(q) ||
        c.diagnosis?.toLowerCase().includes(q) ||
        c.primaryInsurance?.toLowerCase().includes(q);
      const matchDx = !filterDx || c.diagnosis === filterDx;
      const matchTab = Boolean(c.archived) === (clientTab === 'archived');
      return matchSearch && matchDx && matchTab;
    });
    list = [...list].sort((a, b) => {
      const av = (a[sortField] ?? '').toLowerCase();
      const bv = (b[sortField] ?? '').toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [clients, search, filterDx, sortField, sortDir, clientTab]);

  const archivedCount = useMemo(() => clients.filter((c) => c.archived).length, [clients]);
  const pg = usePagination(displayClients, 12);

  const handleFormChange = (field: keyof typeof EMPTY_CLIENT, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleArchiveClient = async (client: Client, archived: boolean) => {
    // Optimistic — revert on failure.
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, archived } : c)));
    try { await api.archiveClient(client.id, archived); }
    catch { setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, archived: !archived } : c))); }
  };

  const [exportingId, setExportingId] = useState<string | null>(null);
  const handleExportClient = async (client: Client) => {
    setExportingId(client.id);
    try { await api.exportClient(client.id, fullName(client)); }
    catch (e) { console.error('Client export failed', e); }
    finally { setExportingId(null); }
  };

  const handleSelectClient = (c: Client) => {
    setSelectedClient(c);
    setForm({
      firstName: c.firstName ?? '', lastName: c.lastName ?? '',
      preferredName: c.preferredName ?? '',
      dateOfBirth: c.dateOfBirth, gender: c.gender,
      diagnosis: c.diagnosis, primaryInsurance: c.primaryInsurance,
      ehrProvider: c.ehrProvider ?? '', ehrCaseId: c.ehrCaseId ?? '',
    });
    setEditGuardians(c.guardians ?? []);
    setClientSaved(false);
    setActiveTab('info');
  };

  const setEditGuardian = (i: number, field: 'name' | 'relationship', value: string) =>
    setEditGuardians((gs) => gs.map((g, idx) => idx === i ? { ...g, [field]: value } : g));

  const handleSaveClient = async () => {
    if (!selectedClient || savingClient) return;
    setSavingClient(true);
    const guardians = editGuardians
      .map((g) => ({ name: g.name.trim(), relationship: g.relationship.trim() }))
      .filter((g) => g.name);
    try {
      await api.updateClient(selectedClient.id, { ...form, guardians });
      const updated: Client = {
        ...selectedClient, ...form, guardians,
        legalName: `${form.firstName} ${form.lastName}`.trim(),
      };
      setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      setSelectedClient(updated);
      setClientSaved(true); setTimeout(() => setClientSaved(false), 2500);
    } catch (e) {
      console.error('Failed to save client', e);
    } finally {
      setSavingClient(false);
    }
  };

  const handleBack = () => { setSelectedClient(null); setActiveTab('info'); };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setShowSortMenu(false);
  };

  const activeClientId = selectedClient?.id ?? '';
  const activeClientDx = selectedClient?.diagnosis ?? '';

  const labelClass = 'block font-semibold text-gray-700 mb-1.5 text-sm';
  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 text-sm';

  // ── Detail view ─────────────────────────────────────────────────────────────

  if (selectedClient) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Detail header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
          {/* Breadcrumb */}
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors shrink-0"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
            Clients
          </button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: '#3F9B2F' }}
            >
              {toInitials(selectedClient)}
            </div>
            <span className="font-semibold text-gray-900 text-sm truncate">
              {fullName(selectedClient)}
            </span>
            {selectedClient.diagnosis && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ background: '#EEF4FF', color: '#1E88FF' }}>
                {selectedClient.diagnosis}
              </span>
            )}
          </div>

          {/* Actions — upper right */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {onStartChat && (
              <button
                onClick={() => onStartChat(selectedClient.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: '#3F9B2F', color: '#3F9B2F', background: 'white' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF7EA')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                <FontAwesomeIcon icon={faCommentDots} className="text-xs" />
                Start Chat
              </button>
            )}
            <button
              onClick={handleSaveClient}
              disabled={savingClient}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: clientSaved ? '#2E7D22' : '#3F9B2F' }}
              onMouseEnter={(e) => { if (!clientSaved) (e.currentTarget.style.background = '#2E7D22'); }}
              onMouseLeave={(e) => { if (!clientSaved) (e.currentTarget.style.background = '#3F9B2F'); }}
            >
              {clientSaved ? '✓ Saved' : savingClient ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 px-6 flex gap-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 py-3 text-sm font-medium transition-colors border-b-2"
              style={{
                borderBottomColor: activeTab === key ? '#3F9B2F' : 'transparent',
                color: activeTab === key ? '#3F9B2F' : '#6b7280',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div>

            {activeTab === 'info' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 max-w-3xl">
                    <Field label="First Name" value={form.firstName} onChange={(v) => handleFormChange('firstName', v)} inputClass={inputClass} labelClass={labelClass} />
                    <Field label="Last Name" value={form.lastName} onChange={(v) => handleFormChange('lastName', v)} inputClass={inputClass} labelClass={labelClass} />
                    <Field label="Preferred Name / Goes By" value={form.preferredName} onChange={(v) => handleFormChange('preferredName', v)} inputClass={inputClass} labelClass={labelClass} />
                    <Field label="Date of Birth" value={form.dateOfBirth} onChange={(v) => handleFormChange('dateOfBirth', v)} type="date" inputClass={inputClass} labelClass={labelClass} />
                    <div>
                      <label className={labelClass}>Gender</label>
                      <select className={inputClass} value={form.gender} onChange={(e) => handleFormChange('gender', e.target.value)}>
                        <option value="">Select Gender</option>
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Primary Insurance</label>
                      <InsuranceSelect
                        value={form.primaryInsurance}
                        onChange={(v) => handleFormChange('primaryInsurance', v)}
                        insurers={insurers}
                        inputClass={inputClass}
                      />
                    </div>
                    <Field label="Diagnosis" value={form.diagnosis} onChange={(v) => handleFormChange('diagnosis', v)} inputClass={inputClass} labelClass={labelClass} />
                </div>

                {/* Guardians / caregivers — name + relationship label (e.g. Mother). */}
                <div className="max-w-3xl mt-6">
                  <label className={labelClass}>Guardians / Caregivers</label>
                  <div className="space-y-2">
                    {editGuardians.map((g, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input className={inputClass} value={g.name} onChange={(e) => setEditGuardian(i, 'name', e.target.value)} placeholder="Name" />
                        <input className={`${inputClass} max-w-[45%]`} value={g.relationship} onChange={(e) => setEditGuardian(i, 'relationship', e.target.value)} placeholder="Relationship (e.g. Mother)" />
                        <button type="button" onClick={() => setEditGuardians((gs) => gs.filter((_, idx) => idx !== i))}
                                aria-label="Remove guardian" className="text-gray-400 hover:text-red-500 shrink-0 w-8 h-8">
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setEditGuardians((gs) => [...gs, { name: '', relationship: '' }])}
                            className="text-sm font-semibold text-green-700 hover:underline">
                      + Add guardian
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Saved with the client when you click <strong>Save Changes</strong>.</p>
                </div>
              </>
            )}

            {activeTab === 'documents' && (
              <ClientDocumentsTab
                clientId={selectedClient.id}
                clientName={selectedClient.preferredName || selectedClient.firstName || 'Client'}
              />
            )}
            {activeTab === 'chats' && (
              <ClientChatsTab
                clientId={selectedClient.id}
                onStartChat={onStartChat ? () => onStartChat!(selectedClient.id) : undefined}
                onOpenChat={onOpenChat}
              />
            )}
            {activeTab === 'treatment_team' && (
              <TreatmentTeamTab
                client={selectedClient}
                orgId={currentUser?.orgId ?? ''}
                onUpdate={(updated) => {
                  setSelectedClient(updated);
                  setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c));
                }}
              />
            )}
            {activeTab === 'ehr' && (
              <div className="max-w-xl">
                <h2 className="text-base font-semibold text-gray-800 mb-1">EHR Connection</h2>
                <p className="text-sm text-gray-500 mb-5">
                  Link this client to their record in your practice management system. Connect a provider
                  in <strong>Settings → Integrations</strong> to sync automatically, or enter the reference manually below.
                </p>
                <div className="space-y-4 bg-white rounded-xl border border-gray-200 p-5">
                  <Field label="EHR Provider" value={form.ehrProvider ?? ''} onChange={(v) => handleFormChange('ehrProvider', v)} inputClass={inputClass} labelClass={labelClass} />
                  <Field label="Case ID #" value={form.ehrCaseId ?? ''} onChange={(v) => handleFormChange('ehrCaseId', v)} inputClass={inputClass} labelClass={labelClass} />
                  <p className="text-xs text-gray-400">Saved with the client when you click <strong>Save Changes</strong>.</p>
                </div>
              </div>
            )}
            {activeTab === 'resources' && (
              <ConnectedResourcesTab clientId={selectedClient.id} clientName={clientDisplayName(selectedClient)} />
            )}

            {activeTab === 'authorizations' && (
              <div>
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-gray-800 mb-1">Authorization Records</h2>
                  <p className="text-sm text-gray-500">
                    Written consent and authorization records for this client.
                    Required before AI features can process client data.
                  </p>
                </div>
                <ClientAuthorizationsPanel clientId={activeClientId} clientDiagnosis={activeClientDx} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-wrap">

        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 border border-gray-300 bg-white" style={{ minWidth: 240 }}>
          <FontAwesomeIcon icon={faSearch} className="text-gray-400 text-xs shrink-0" />
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400 w-full"
          />
        </div>

        {/* Filter by diagnosis */}
        <div className="relative">
          <button
            onClick={() => { setShowFilterMenu((v) => !v); setShowSortMenu(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
            style={filterDx
              ? { borderColor: '#3F9B2F', color: '#3F9B2F', background: '#EEF7EA' }
              : { borderColor: '#d1d5db', color: '#6b7280', background: 'white' }}
          >
            <FontAwesomeIcon icon={faFilter} className="text-xs" />
            {filterDx || 'Filter'}
          </button>
          {showFilterMenu && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
              <button
                onClick={() => { setFilterDx(''); setShowFilterMenu(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 font-medium text-gray-500"
              >
                All diagnoses
              </button>
              {diagnosisOptions.map((dx) => (
                <button
                  key={dx}
                  onClick={() => { setFilterDx(dx); setShowFilterMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
                  style={filterDx === dx ? { color: '#3F9B2F', fontWeight: 600 } : {}}
                >
                  {dx}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort */}
        <div className="relative">
          <button
            onClick={() => { setShowSortMenu((v) => !v); setShowFilterMenu(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FontAwesomeIcon icon={sortDir === 'asc' ? faSortAlphaDown : faSortAlphaUp} className="text-xs" />
            Sort
          </button>
          {showSortMenu && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
              {([
                { field: 'lastName'    as SortField, label: 'Last Name (A–Z / Z–A)' },
                { field: 'firstName'   as SortField, label: 'First Name (A–Z / Z–A)'},
                { field: 'dateOfBirth' as SortField, label: 'Date of Birth'          },
                { field: 'diagnosis'   as SortField, label: 'Diagnosis'              },
              ]).map(({ field, label }) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                  style={sortField === field ? { color: '#3F9B2F', fontWeight: 600 } : { color: '#374151' }}
                >
                  {label}
                  {sortField === field && (
                    <FontAwesomeIcon icon={sortDir === 'asc' ? faSortAlphaDown : faSortAlphaUp} className="text-xs" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Count */}
        <span className="text-sm text-gray-400">
          {displayClients.length} client{displayClients.length !== 1 ? 's' : ''}
        </span>

        {/* New client — hide when list is empty (empty state card has its own button) */}
        {clients.length > 0 && (
          <button
            onClick={() => setShowNewClient(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors"
            style={{ background: '#3F9B2F' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#2E7D22')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#3F9B2F')}
          >
            <FontAwesomeIcon icon={faPlus} className="text-xs" />
            New Client
          </button>
        )}
      </div>

      {/* Active / Archived tabs */}
      <div className="flex gap-6 px-6 border-b border-gray-200 bg-white">
        {([
          { id: 'active'   as const, label: 'Active',   count: clients.length - archivedCount },
          { id: 'archived' as const, label: 'Archived', count: archivedCount },
        ]).map((t) => {
          const on = clientTab === t.id;
          return (
            <button key={t.id} onClick={() => { setClientTab(t.id); pg.reset(); }}
              className={`relative py-2.5 text-sm font-medium transition-colors ${on ? 'text-teal-700' : 'text-gray-500 hover:text-gray-800'}`}>
              {t.label} <span className="text-xs text-gray-400">{t.count}</span>
              {on && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ background: '#2a5f6f' }} />}
            </button>
          );
        })}
      </div>

      {/* Client list */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4" onClick={() => { setShowSortMenu(false); setShowFilterMenu(false); }}>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading clients…</div>
        ) : displayClients.length === 0 ? (
          search || filterDx ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
              <p className="font-medium">No clients match your search.</p>
            </div>
          ) : (
            /* Empty state — no clients yet */
            <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
              <div
                className="flex flex-col items-center text-center px-10 py-12 rounded-2xl"
                style={{
                  border: '2px dashed #DCE7EE',
                  background: 'white',
                  maxWidth: 340,
                }}
              >
                {/* Icon circle */}
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                  style={{ background: '#EEF7EA' }}
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="13" cy="11" r="5" stroke="#3F9B2F" strokeWidth="2" fill="none" />
                    <path d="M3 27c0-5 4.5-9 10-9" stroke="#3F9B2F" strokeWidth="2" strokeLinecap="round" fill="none" />
                    <circle cx="25" cy="23" r="5" stroke="#3F9B2F" strokeWidth="2" fill="none" />
                    <line x1="25" y1="20" x2="25" y2="26" stroke="#3F9B2F" strokeWidth="2" strokeLinecap="round" />
                    <line x1="22" y1="23" x2="28" y2="23" stroke="#3F9B2F" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800 mb-2">Add a New Client</h3>
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                  Create a new client profile and start a secure conversation right away.
                </p>
                <button
                  onClick={() => setShowNewClient(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
                  style={{ background: '#3F9B2F' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2E7D22')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#3F9B2F')}
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                  New Client
                </button>
              </div>
            </div>
          )
        ) : (
          <div>
            <div className="space-y-2">
              {pg.pageItems.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  members={orgMembers}
                  onSelect={handleSelectClient}
                  onStartChat={onStartChat ? () => onStartChat(client.id) : undefined}
                  onArchive={(archived) => handleArchiveClient(client, archived)}
                  onExport={() => handleExportClient(client)}
                  exporting={exportingId === client.id}
                />
              ))}
            </div>
            <Pagination state={pg} label="clients" />
          </div>
        )}
      </div>

      {/* Close menus on outside click */}
      {(showSortMenu || showFilterMenu) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => { setShowSortMenu(false); setShowFilterMenu(false); }}
        />
      )}

      {/* New Client modal */}
      {showNewClient && (
        <NewClientModal
          insurers={insurers}
          onClose={() => setShowNewClient(false)}
          onCreated={(c) => {
            setClients((prev) => [c, ...prev]);
            setShowNewClient(false);
            handleSelectClient(c);
          }}
        />
      )}
    </div>
  );
}

// ── Client row ────────────────────────────────────────────────────────────────

function ClientRow({
  client, members, onSelect, onStartChat, onArchive, onExport, exporting,
}: {
  client: Client;
  members?: MemberLike[];
  onSelect: (c: Client) => void;
  onStartChat?: () => void;
  onArchive?: (archived: boolean) => void;
  onExport?: () => void;
  exporting?: boolean;
}) {
  // Distinct assigned team members, treating BCBA first, resolved to names.
  const teamIds = Array.from(new Set(
    [client.treatingBcbaId, client.supervisingBcbaId, ...(client.supervisorIds ?? []), ...(client.rbtIds ?? [])]
      .filter((id): id is string => Boolean(id)),
  ));
  const memberName = (uid: string) => {
    const m = members?.find((x) => x.id === uid);
    const full = m?.name || m?.displayName || m?.email || '';
    if (!full) return null; // unknown/deactivated uid — skip rather than show a raw id
    if (full.includes('@')) return full.split('@')[0];
    const parts = full.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  };
  const teamNames = teamIds.map(memberName).filter((n): n is string => Boolean(n));
  const shownNames = teamNames.slice(0, 3);
  const moreCount = teamNames.length - shownNames.length;
  return (
    <div
      className="w-full bg-white rounded-xl px-5 py-4 flex items-center gap-4 transition-all group"
      style={{ border: '2px solid #DCE7EE', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3F9B2F'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(63,155,47,0.12)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#DCE7EE'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)'; }}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 cursor-pointer"
        style={{ background: '#3F9B2F' }}
        onClick={() => onSelect(client)}
      >
        {toInitials(client)}
      </div>

      {/* Info — clickable to open detail */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(client)}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">
            {fullName(client)}
          </span>
          {client.preferredName && client.preferredName !== client.firstName && (
            <span className="text-xs text-gray-400">goes by {client.preferredName}</span>
          )}
          {client.diagnosis && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#EEF4FF', color: '#1E88FF' }}>
              {client.diagnosis}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 flex-wrap">
          {client.dateOfBirth && <span>DOB: {client.dateOfBirth}</span>}
          {client.dateOfBirth && client.primaryInsurance && <span>•</span>}
          {client.primaryInsurance && <span>{client.primaryInsurance}</span>}
        </div>
        {/* Treatment-team (named) + last-updated pills */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {shownNames.length === 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">
              <FontAwesomeIcon icon={faUsers} style={{ fontSize: 9 }} />
              Unassigned
            </span>
          ) : (
            <>
              {shownNames.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: '#EEF7EA', color: '#2E7D22' }}>
                  <FontAwesomeIcon icon={faUsers} style={{ fontSize: 9 }} />
                  {n}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
                  +{moreCount} more
                </span>
              )}
            </>
          )}
          {client.updatedAt && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
              Updated {new Date(client.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {/* Start Chat button */}
      {onStartChat && (
        <button
          onClick={onStartChat}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors shrink-0"
          style={{ borderColor: '#3F9B2F', color: '#3F9B2F', background: 'white' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF7EA')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
        >
          <FontAwesomeIcon icon={faCommentDots} className="text-xs" />
          Start Chat
        </button>
      )}

      {/* Export full record */}
      {onExport && (
        <button
          onClick={(e) => { e.stopPropagation(); onExport(); }}
          disabled={exporting}
          title="Export full record (JSON)"
          aria-label="Export client record"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={exporting ? faSpinner : faFileExport} className={`text-xs ${exporting ? 'animate-spin' : ''}`} />
        </button>
      )}

      {/* Archive / unarchive */}
      {onArchive && (
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(!client.archived); }}
          title={client.archived ? 'Unarchive client' : 'Archive client'}
          aria-label={client.archived ? 'Unarchive client' : 'Archive client'}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
        >
          <FontAwesomeIcon icon={client.archived ? faBoxOpen : faBoxArchive} className="text-xs" />
        </button>
      )}

      {/* Arrow */}
      <FontAwesomeIcon
        icon={faChevronRight}
        className="text-gray-300 group-hover:text-green-400 transition-colors text-xs shrink-0 cursor-pointer"
        onClick={() => onSelect(client)}
      />
    </div>
  );
}

// ── Insurance select ──────────────────────────────────────────────────────────
// Shows a <select> when the org has a list configured, with an "Other…" escape
// hatch that reveals a free-text input. Falls back to plain text input when no
// list is configured.

function InsuranceSelect({
  value, onChange, insurers, inputClass,
}: {
  value: string;
  onChange: (v: string) => void;
  insurers: string[];
  inputClass: string;
}) {
  const isOther = value !== '' && !insurers.includes(value);
  const [showOther, setShowOther] = useState(isOther);

  if (insurers.length === 0) {
    // No list configured — plain text input
    return (
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Medicaid"
      />
    );
  }

  return (
    <div className="space-y-2">
      <select
        className={inputClass}
        value={showOther ? '__other__' : (value || '')}
        onChange={(e) => {
          if (e.target.value === '__other__') {
            setShowOther(true);
            onChange('');
          } else {
            setShowOther(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Select insurance…</option>
        {insurers.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {showOther && (
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter insurance company name"
          autoFocus
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', inputClass, labelClass }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; inputClass: string; labelClass: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input type={type} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function EmptyTab({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-base font-medium">{message}</p>
      <p className="text-sm mt-1">{sub}</p>
    </div>
  );
}

// ── New Client modal ──────────────────────────────────────────────────────────

function NewClientModal({
  insurers,
  onClose,
  onCreated,
}: {
  insurers: string[];
  onClose: () => void;
  onCreated: (c: Client) => void;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', preferredName: '', dateOfBirth: '',
    gender: '', diagnosis: '', primaryInsurance: '',
    ehrProvider: '', ehrCaseId: '',
  });
  const [guardians, setGuardians] = useState<{ name: string; relationship: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));
  const setGuardian = (i: number, field: 'name' | 'relationship', value: string) =>
    setGuardians((gs) => gs.map((g, idx) => idx === i ? { ...g, [field]: value } : g));

  const handleSave = async () => {
    if (!form.firstName.trim()) { setError('First name is required.'); return; }
    if (!form.lastName.trim())  { setError('Last name is required.');  return; }
    setSaving(true); setError('');
    // Keep only guardians with a name; trim fields.
    const cleanGuardians = guardians
      .map((g) => ({ name: g.name.trim(), relationship: g.relationship.trim() }))
      .filter((g) => g.name);
    try {
      const res = await api.createClient({ ...form, guardians: cleanGuardians });
      const newClient: Client = {
        id:               res.clientId,
        orgId:            '',
        firstName:        form.firstName,
        lastName:         form.lastName,
        preferredName:    form.preferredName || undefined,
        legalName:        `${form.firstName} ${form.lastName}`.trim(),
        dateOfBirth:      form.dateOfBirth,
        gender:           form.gender,
        diagnosis:        form.diagnosis,
        primaryInsurance: form.primaryInsurance,
        ehrProvider:      form.ehrProvider,
        ehrCaseId:        form.ehrCaseId,
        guardians:        cleanGuardians,
        createdAt:        new Date().toISOString(),
      };
      onCreated(newClient);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create client.');
    } finally {
      setSaving(false);
    }
  };

  const lc = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
  const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New Client</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>First Name <span className="text-red-400">*</span></label>
              <input className={ic} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="First name" />
            </div>
            <div>
              <label className={lc}>Last Name <span className="text-red-400">*</span></label>
              <input className={ic} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Last name" />
            </div>
          </div>

          <div>
            <label className={lc}>Preferred Name / Goes By <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
            <input className={ic} value={form.preferredName} onChange={(e) => set('preferredName', e.target.value)} placeholder="e.g. Alex, Sam — shown in chats" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Date of Birth</label>
              <input type="date" className={ic} value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
            </div>
            <div>
              <label className={lc}>Gender</label>
              <select className={ic} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Select…</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
          </div>

          <div>
            <label className={lc}>Diagnosis</label>
            <input className={ic} value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} placeholder="e.g. ASD Level 2" />
          </div>

          <div>
            <label className={lc}>Primary Insurance</label>
            <InsuranceSelect
              value={form.primaryInsurance}
              onChange={(v) => set('primaryInsurance', v)}
              insurers={insurers}
              inputClass={ic}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>EHR Provider</label>
              <input className={ic} value={form.ehrProvider} onChange={(e) => set('ehrProvider', e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className={lc}>EHR Case ID</label>
              <input className={ic} value={form.ehrCaseId} onChange={(e) => set('ehrCaseId', e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {/* Guardians / caregivers — name + a relationship label (e.g. Mother). When the org
              enables guardian relationship labels, AI output refers to them by this label. */}
          <div>
            <label className={lc}>Guardians / Caregivers <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
            <div className="space-y-2">
              {guardians.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={ic} value={g.name} onChange={(e) => setGuardian(i, 'name', e.target.value)} placeholder="Name" />
                  <input className={`${ic} max-w-[45%]`} value={g.relationship} onChange={(e) => setGuardian(i, 'relationship', e.target.value)} placeholder="Relationship (e.g. Mother)" />
                  <button type="button" onClick={() => setGuardians((gs) => gs.filter((_, idx) => idx !== i))}
                          aria-label="Remove guardian" className="text-gray-400 hover:text-red-500 shrink-0 w-8 h-8">
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setGuardians((gs) => [...gs, { name: '', relationship: '' }])}
                      className="text-sm font-semibold text-green-700 hover:underline">
                + Add guardian
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors"
            style={{ background: saving ? '#7ED957' : '#3F9B2F' }}
            onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#2E7D22'; }}
            onMouseLeave={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#3F9B2F'; }}
          >
            {saving ? 'Creating…' : 'Create Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Documents tab ─────────────────────────────────────────────────────────────

function ClientDocumentsTab({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const { currentUser } = useAuth();
  const [docs, setDocs]       = useState<Array<Record<string, string>>>([]);
  const [members, setMembers] = useState<MemberLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const pg = usePagination(docs, 8);

  useEffect(() => {
    if (currentUser?.orgId) api.getOrgMembers(currentUser.orgId).then(setMembers).catch(() => {});
  }, [currentUser?.orgId]);

  const loadDocs = () => {
    setLoading(true);
    api.getClientDocuments(clientId)
      .then((r) => setDocs(r.documents as Array<Record<string, string>>))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadDocs(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // While any uploaded doc is still extracting (async, server-side), quietly
  // re-poll so its "Processing" badge flips to ready without the user refreshing.
  useEffect(() => {
    if (!docs.some((d) => d.extractionStatus === 'PROCESSING')) return;
    const t = setInterval(() => {
      api.getClientDocuments(clientId)
        .then((r) => setDocs(r.documents as Array<Record<string, string>>))
        .catch(() => {});
    }, 2500);
    return () => clearInterval(t);
  }, [docs, clientId]);

  // Direct file upload — text is extracted server-side (scanned PDFs are OCR'd)
  // and stored with the client. Multiple files upload sequentially, max 10 at a time.
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file(s)
    if (files.length === 0) return;
    if (files.length > 10) {
      setUploadError('You can upload up to 10 files at a time.');
      return;
    }
    setUploadError('');
    setUploading(true);
    const failures: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Advise on a duplicate: same filename OR identical file content (hash).
      const hash = await sha256Hex(file);
      const dupe = docs.find((d) =>
        (d.sourceFilename && d.sourceFilename.toLowerCase() === file.name.toLowerCase()) ||
        (hash && d.contentHash === hash));
      if (dupe && !window.confirm(
        `"${file.name}" appears to already be uploaded for this client. Upload it again anyway?`)) {
        continue;
      }
      setUploadProgress(files.length > 1 ? `${i + 1} of ${files.length}` : '');
      try {
        await api.uploadClientDocument(clientId, file);
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
      }
    }
    loadDocs();
    if (failures.length > 0) setUploadError(failures.join(' — '));
    setUploading(false);
    setUploadProgress('');
  };

  return (
    <div>
      {/* Header + plain-language explanation of what this does */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">Documents</h2>
          <p className="text-sm text-gray-500 max-w-xl">
            Generate a complete clinical document for this client — a Behavior Intervention Plan, Functional
            Behavior Assessment, session note, progress report, and more. The AI drafts it from this client's
            data, runs it through compliance checks, and saves it here. A signed authorization must be on file
            (see the <strong>Authorizations</strong> tab).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            title="Upload Word, PDF, Excel, or text documents to this client's record — up to 10 at a time. Scanned PDFs are read automatically."
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60"
            style={{ borderColor: '#1E88FF', color: '#1E88FF', background: 'white' }}
          >
            <FontAwesomeIcon icon={uploading ? faSpinner : faUpload} className={`text-xs ${uploading ? 'animate-spin' : ''}`} />
            {uploading ? (uploadProgress ? `Uploading ${uploadProgress}…` : 'Uploading…') : 'Upload'}
          </button>
          <input ref={uploadRef} type="file" multiple accept=".txt,.md,.docx,.pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.gif" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#1E88FF' }}
          >
            <FontAwesomeIcon icon={faRobot} className="text-xs" />
            Generate Document
          </button>
        </div>
      </div>
      {uploadError && <p className="text-sm text-red-500 -mt-3 mb-4">{uploadError}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faFileAlt} className="text-4xl mb-3 text-gray-300" />
          <p className="text-base font-medium">No documents yet</p>
          <p className="text-sm mt-1">Click <strong>Generate Document</strong> to create the first one for this client.</p>
        </div>
      ) : (
        <div>
          <div className="space-y-2">
            {pg.pageItems.map((d, i) => (
              <div key={d.id ?? i} className="bg-white rounded-xl px-5 py-3 flex items-center gap-4"
                style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#EEF4FF' }}>
                  <FontAwesomeIcon icon={faFileAlt} style={{ color: '#1E88FF', fontSize: 13 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{d.title ?? d.documentType ?? 'AI Document'}</p>
                    <CreatedByPill createdBy={d.createdBy ?? d.addedBy ?? d.authorUid ?? d.userId} members={members} />
                    {d.extractionStatus === 'PROCESSING' && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin" style={{ fontSize: 9 }} /> Processing
                      </span>
                    )}
                    {d.extractionStatus === 'FAILED' && (
                      <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#FEE2E2', color: '#991B1B' }}
                        title={d.extractionError ?? 'Could not read this file.'}>Couldn’t read</span>
                    )}
                  </div>
                  {d.createdAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {d.source === 'upload' ? 'Uploaded' : 'Generated'} {new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                {/* Download original — only when a stored original exists in GCS. */}
                {d.gcsObject && (
                  <button
                    type="button"
                    onClick={() => api.openClientDocumentOriginal(clientId, d.id).catch(() => {})}
                    className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Download original file"
                  >
                    <FontAwesomeIcon icon={faDownload} className="text-sm" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <Pagination state={pg} label="documents" />
        </div>
      )}

      {showGenerate && (
        <GenerateDocumentModal
          clientId={clientId}
          clientName={clientName ?? 'Client'}
          onClose={() => setShowGenerate(false)}
          onDocumentGenerated={loadDocs}
        />
      )}
    </div>
  );
}

// ── Chats tab ─────────────────────────────────────────────────────────────────

function ClientChatsTab({ clientId, onStartChat, onOpenChat }: { clientId: string; onStartChat?: () => void; onOpenChat?: (chatId: string) => void }) {
  const { currentUser } = useAuth();
  const [chats, setChats]     = useState<Chat[]>([]);
  const [members, setMembers] = useState<MemberLike[]>([]);
  const [loading, setLoading] = useState(true);
  const pg = usePagination(chats, 8);

  useEffect(() => {
    setLoading(true);
    api.getChats()
      .then((all) => setChats(all.filter((c) => c.clientId === clientId)))
      .catch(() => setChats([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    if (currentUser?.orgId) api.getOrgMembers(currentUser.orgId).then(setMembers).catch(() => {});
  }, [currentUser?.orgId]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">Chats</h2>
          <p className="text-sm text-gray-500 max-w-xl">
            Conversations scoped to this client. Use chat to ask questions and think things through;
            use the <strong>Documents</strong> tab when you want a finished clinical document.
          </p>
        </div>
        {onStartChat && (
          <button onClick={onStartChat}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border shrink-0"
            style={{ borderColor: '#3F9B2F', color: '#3F9B2F', background: 'white' }}>
            <FontAwesomeIcon icon={faCommentDots} className="text-xs" />
            Start Chat
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
        </div>
      ) : chats.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faComments} className="text-4xl mb-3 text-gray-300" />
          <p className="text-base font-medium">No chats yet</p>
          <p className="text-sm mt-1">Start a conversation scoped to this client.</p>
        </div>
      ) : (
        <div>
          <div className="space-y-2">
            {pg.pageItems.map((chat) => (
              <div key={chat.id} className="bg-white rounded-xl px-5 py-3 flex items-center gap-4"
                style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#EEF7EA' }}>
                  <FontAwesomeIcon icon={faCommentDots} style={{ color: '#3F9B2F', fontSize: 13 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{chat.title || 'Untitled Chat'}</p>
                    <CreatedByPill createdBy={chat.createdBy} members={members} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {chat.projectLabel ? `📁 ${chat.projectLabel} · ` : ''}
                    {new Date(chat.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {onOpenChat && (
                  <button onClick={() => onOpenChat(chat.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shrink-0"
                    style={{ borderColor: '#3F9B2F', color: '#3F9B2F', background: 'white' }}>
                    <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs" />
                    Open
                  </button>
                )}
              </div>
            ))}
          </div>
          <Pagination state={pg} label="chats" />
        </div>
      )}
    </div>
  );
}

// ── Connected Resources tab ───────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  policy_manual: 'Policy Manual',
  sop:           'SOP',
  handbook:      'Handbook',
  clinical_sop:  'Clinical SOP',
  template:      'Template',
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  policy_manual: { bg: '#f3f4f6', text: '#374151' },
  sop:           { bg: '#fdf4e7', text: '#92400e' },
  handbook:      { bg: '#f0fdf4', text: '#166534' },
  clinical_sop:  { bg: '#e8f4f8', text: '#1e4d5c' },
  template:      { bg: '#EEF4FF', text: '#1E88FF' },
};

function ConnectedResourcesTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [connections, setConnections] = useState<DriveConnection[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [showDrive, setShowDrive]   = useState<'google' | 'microsoft' | null>(null);
  const [removing, setRemoving]     = useState<string | null>(null);

  // Resources linked to THIS client. The system is link-only — files live in the
  // customer's Drive/OneDrive under their own sharing controls; we store the link.
  useEffect(() => {
    setLoading(true);
    api.getDriveConnections()
      .then((all) => setConnections(all.filter((c) => c.clientId === clientId)))
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  const handleRemove = async (id: string) => {
    setRemoving(id);
    try {
      await api.deleteDriveConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch { /* surfaced by the row staying */ }
    finally { setRemoving(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-1">Resources for this client</h2>
            <p className="text-sm text-gray-500 max-w-xl">
              Link reference documents from Google Drive or OneDrive. Files stay in your cloud
              under your existing sharing controls — myABA stores only the link, scoped to this client.
            </p>
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setShowPicker((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#2a5f6f' }}
            >
              <FontAwesomeIcon icon={faPlus} className="text-xs" />
              Add Resource
            </button>
            {showPicker && (
              <div
                className="absolute right-0 mt-1 w-52 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden"
              >
                <button
                  onClick={() => { setShowPicker(false); setShowDrive('google'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FontAwesomeIcon icon={faGoogle} style={{ color: '#ea4335' }} />
                  Link from Google Drive
                </button>
                <button
                  onClick={() => { setShowPicker(false); setShowDrive('microsoft'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
                >
                  <FontAwesomeIcon icon={faMicrosoft} style={{ color: '#0078d4' }} />
                  Link from OneDrive
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faFolderOpen} className="text-4xl mb-3 text-gray-300" />
          <p className="text-base font-medium">No resources linked</p>
          <p className="text-sm mt-1">Use "Add Resource" to link a document or folder from Google Drive or OneDrive.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => {
            const isGoogle = c.driveSource === 'google';
            return (
              <div
                key={c.id}
                className="bg-white rounded-xl px-5 py-4 flex items-center gap-4"
                style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: isGoogle ? '#fdeceb' : '#e8f1fb' }}
                >
                  <FontAwesomeIcon icon={isGoogle ? faGoogle : faMicrosoft} style={{ color: isGoogle ? '#ea4335' : '#0078d4', fontSize: 15 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm truncate">{c.driveItemName}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 bg-gray-100 text-gray-500 capitalize">
                      {c.driveItemType}
                    </span>
                    {c.hipaaVerified ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 inline-flex items-center gap-1"
                            style={{ background: '#EEF7EA', color: '#2E7D22' }}>
                        <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 9 }} /> HIPAA labeled
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                            style={{ background: '#fef3c7', color: '#92400e' }}>
                        Label unverified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{isGoogle ? 'Google Drive' : 'OneDrive'}</p>
                </div>
                <a
                  href={c.driveItemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-gray-400 hover:text-gray-600 px-2"
                  title="Open in provider"
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} className="text-sm" />
                </a>
                <button
                  onClick={() => handleRemove(c.id)}
                  disabled={removing === c.id}
                  className="shrink-0 text-gray-400 hover:text-red-500 px-2 disabled:opacity-50"
                  title="Remove link"
                >
                  <FontAwesomeIcon icon={removing === c.id ? faSpinner : faTrashAlt} className={`text-sm ${removing === c.id ? 'animate-spin' : ''}`} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showDrive && (
        <DriveConnectWizard
          provider={showDrive}
          clientId={clientId}
          clientName={clientName}
          onClose={() => setShowDrive(null)}
          onLinked={(c) => {
            setConnections((prev) => [c, ...prev]);
            setShowDrive(null);
          }}
        />
      )}
    </div>
  );
}

// ── Treatment Team Tab ────────────────────────────────────────────────────────

const TEAM_ROLE_LABEL: Record<string, string> = {
  TREATING_BCBA:    'Treating BCBA',
  SUPERVISING_BCBA: 'Clinical Supervisor',
  BCBA_STUDENT:     'BCBA Student',
  RBT:              'Behavior Technician',
  ORG_ADMIN:        'Practice Administrator',
  ORG_SUPER_ADMIN:  'Practice Administrator',
};

const TEAM_ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  TREATING_BCBA:    { bg: '#d1fae5', text: '#065f46' },
  SUPERVISING_BCBA: { bg: '#dbeafe', text: '#1e40af' },
  BCBA_STUDENT:     { bg: '#ede9fe', text: '#5b21b6' },
  RBT:              { bg: '#EEF4FF', text: '#1E88FF'  },
};

function memberInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function TreatmentTeamTab({
  client, orgId, onUpdate,
}: {
  client: Client;
  orgId: string;
  onUpdate: (updated: Client) => void;
}) {
  type OrgMember = {
    id: string; displayName: string; email: string; role: string; active: boolean;
    // Resolved role capabilities from the server (works for custom roles, not just built-ins).
    phiAccess?: boolean; canManageClients?: boolean;
  };

  const [members,        setMembers]        = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // supervisorIds = all supervisors on the case roster (multi-select)
  const [supervisorIds,     setSupervisorIds]     = useState<string[]>(client.supervisorIds ?? (client.supervisingBcbaId ? [client.supervisingBcbaId] : []));
  // supervisingBcbaId = the current/active supervisor (must be one of supervisorIds)
  const [supervisingBcbaId, setSupervisingBcbaId] = useState(client.supervisingBcbaId ?? '');
  const [rbtIds,            setRbtIds]            = useState<string[]>(client.rbtIds ?? []);

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (!orgId) { setLoadingMembers(false); return; }
    api.getOrgMembers(orgId)
      .then((data) => setMembers(data.filter((m) => m.active)))
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [orgId]);

  // Option B — gate the caseload pickers by RESOLVED capability (so custom-role users
  // appear in the right slot), not a hardcoded built-in role list. Supervisor slot =
  // can manage clients (CLIENT_MANAGE); Behavior-Technician slot = has PHI access.
  // Falls back to a built-in role-name check if the server didn't stamp the flags.
  const eligibleSupervisor = (m: OrgMember) => m.canManageClients ?? canManageClients(m.role as UserRole);
  const eligibleTechnician = (m: OrgMember) => m.phiAccess ?? isClinicalRole(m.role as UserRole);
  const supervisorOpts = members.filter(eligibleSupervisor);
  const rbtOptions     = members.filter(eligibleTechnician);

  // Toggle a supervisor on/off the roster; if removed and was current, clear current
  const toggleSupervisor = (id: string) => {
    setSupervisorIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (supervisingBcbaId === id) {
          setSupervisingBcbaId(next[0] ?? '');
        }
        return next;
      }
      return [...prev, id];
    });
  };

  const dirty =
    JSON.stringify([...supervisorIds].sort()) !==
      JSON.stringify([...(client.supervisorIds ?? (client.supervisingBcbaId ? [client.supervisingBcbaId] : []))].sort()) ||
    supervisingBcbaId !== (client.supervisingBcbaId ?? '') ||
    JSON.stringify([...rbtIds].sort()) !== JSON.stringify([...(client.rbtIds ?? [])].sort());

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateClientAuthorizations(client.id, {
        supervisorIds,
        supervisingBcbaId: supervisingBcbaId || undefined,
        rbtIds,
      });
      onUpdate({
        ...client,
        supervisorIds,
        supervisingBcbaId: supervisingBcbaId || undefined,
        rbtIds,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save treatment team');
    } finally {
      setSaving(false);
    }
  };

  const toggleRbt = (id: string) =>
    setRbtIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  if (loadingMembers) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
        <span className="text-sm">Loading team members…</span>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-5">

      {/* Supervisors — multi-select roster + "Current" designation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faUserNurse} style={{ color: '#1e40af', fontSize: 13 }} />
          <h4 className="font-semibold text-gray-800 text-sm">Supervisors</h4>
          <span className="text-xs text-gray-400 ml-auto">{supervisorIds.length} on case</span>
        </div>

        {supervisorOpts.length === 0 ? (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            No active Supervising BCBAs found. Invite one from the Team page.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-400">
              Check all supervisors on this case. Mark one as <strong>Current</strong> — the active supervisor responsible for the case right now.
            </p>
            <div className="space-y-2">
              {supervisorOpts.map((m) => {
                const onRoster  = supervisorIds.includes(m.id);
                const isCurrent = supervisingBcbaId === m.id;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                    style={{
                      border: `2px solid ${onRoster ? '#1e40af' : '#e5e7eb'}`,
                      background: onRoster ? '#eff6ff' : 'white',
                    }}
                  >
                    {/* Roster toggle checkbox */}
                    <button
                      onClick={() => toggleSupervisor(m.id)}
                      className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        borderColor: onRoster ? '#1e40af' : '#d1d5db',
                        background:  onRoster ? '#1e40af' : 'white',
                      }}
                      title={onRoster ? 'Remove from case' : 'Add to case'}
                    >
                      {onRoster && <FontAwesomeIcon icon={faCheck} style={{ color: 'white', fontSize: 9 }} />}
                    </button>

                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: onRoster ? '#1e40af' : '#9ca3af' }}
                    >
                      {memberInitials(m.displayName)}
                    </div>

                    {/* Name / email */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{m.displayName}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>

                    {/* Current badge / Set as Current button */}
                    {onRoster && (
                      isCurrent ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white shrink-0">
                          Current
                        </span>
                      ) : (
                        <button
                          onClick={() => setSupervisingBcbaId(m.id)}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-blue-300 text-blue-600 hover:bg-blue-50 shrink-0 transition-colors"
                        >
                          Set as Current
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            {supervisorIds.length > 0 && !supervisingBcbaId && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No current supervisor set. Click "Set as Current" on one of the supervisors above.
              </p>
            )}
          </>
        )}
      </div>

      {/* Behavior Technicians — multi-select toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faUsers} style={{ color: '#1E88FF', fontSize: 13 }} />
          <h4 className="font-semibold text-gray-800 text-sm">Behavior Technicians</h4>
          <span className="text-xs text-gray-400 ml-auto">{rbtIds.length} assigned</span>
        </div>
        {rbtOptions.length === 0 ? (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            No active Behavior Technicians or BCBA Students found. Invite RBTs from the Team page.
          </p>
        ) : (
          <div className="space-y-2">
            {rbtOptions.map((m) => {
              const selected = rbtIds.includes(m.id);
              const c = TEAM_ROLE_COLORS[m.role] ?? { bg: '#f3f4f6', text: '#374151' };
              return (
                <button
                  key={m.id}
                  onClick={() => toggleRbt(m.id)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors text-left"
                  style={{
                    border: `2px solid ${selected ? '#1E88FF' : '#e5e7eb'}`,
                    background: selected ? '#EEF4FF' : 'white',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: selected ? '#1E88FF' : '#9ca3af' }}
                  >
                    {memberInitials(m.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{m.displayName}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ background: c.bg, color: c.text }}>
                    {TEAM_ROLE_LABEL[m.role] ?? m.role}
                  </span>
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: selected ? '#1E88FF' : '#d1d5db', background: selected ? '#1E88FF' : 'white' }}
                  >
                    {selected && <FontAwesomeIcon icon={faCheck} style={{ color: 'white', fontSize: 9 }} />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold"
          style={{
            background: saved ? '#16a34a' : dirty ? '#3F9B2F' : '#d1d5db',
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Treatment Team'}
        </button>
        {dirty && !saving && (
          <button
            onClick={() => {
              setSupervisorIds(client.supervisorIds ?? (client.supervisingBcbaId ? [client.supervisingBcbaId] : []));
              setSupervisingBcbaId(client.supervisingBcbaId ?? '');
              setRbtIds(client.rbtIds ?? []);
            }}
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>

    </div>
  );
}
