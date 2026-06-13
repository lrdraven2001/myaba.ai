import { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faChevronRight, faArrowLeft,
  faSortAlphaDown, faSortAlphaUp, faFilter, faCommentDots,
  faFileAlt, faFolderOpen, faLink, faSpinner, faTimes,
  faRobot, faComments, faExternalLinkAlt,
} from '@fortawesome/free-solid-svg-icons';
import type { Client, PolicyDocument, Chat } from '../types';
import ClientAuthorizationsPanel from '../components/ClientAuthorizationsPanel';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientTab   = 'info' | 'ai_data' | 'treatment_team' | 'ehr' | 'authorizations' | 'resources';
type SortField   = 'lastName' | 'firstName' | 'dateOfBirth' | 'diagnosis';
type SortDir     = 'asc' | 'desc';

const TABS: { key: ClientTab; label: string }[] = [
  { key: 'info',           label: 'Client Information'   },
  { key: 'ai_data',        label: 'Connected AI Data'    },
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

const DEV_CLIENT_IDS = ['c-001', 'c-002', 'c-003'];

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

export default function ClientsView({ onStartChat }: { onStartChat?: (clientId: string) => void }) {
  const { currentUser } = useAuth();
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [insurers, setInsurers]       = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab]     = useState<ClientTab>('info');
  const [form, setForm]               = useState(EMPTY_CLIENT);
  const [devClientId, setDevClientId] = useState(DEV_CLIENT_IDS[0]);
  const [devClientDx, setDevClientDx] = useState('');

  // List controls
  const [search, setSearch]           = useState('');
  const [sortField, setSortField]     = useState<SortField>('lastName');
  const [sortDir, setSortDir]         = useState<SortDir>('asc');
  const [filterDx, setFilterDx]       = useState('');
  const [showSortMenu, setShowSortMenu]     = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showNewClient, setShowNewClient]   = useState(false);

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
    }
  }, [currentUser?.orgId]);

  // Fetch diagnosis for dev mode
  useEffect(() => {
    if (selectedClient) return;
    setDevClientDx('');
    api.getClient(devClientId)
      .then((c) => setDevClientDx(c.diagnosis ?? ''))
      .catch(() => {});
  }, [devClientId, selectedClient]);

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
      return matchSearch && matchDx;
    });
    list = [...list].sort((a, b) => {
      const av = (a[sortField] ?? '').toLowerCase();
      const bv = (b[sortField] ?? '').toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [clients, search, filterDx, sortField, sortDir]);

  const handleFormChange = (field: keyof typeof EMPTY_CLIENT, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSelectClient = (c: Client) => {
    setSelectedClient(c);
    setForm({
      firstName: c.firstName ?? '', lastName: c.lastName ?? '',
      preferredName: c.preferredName ?? '',
      dateOfBirth: c.dateOfBirth, gender: c.gender,
      diagnosis: c.diagnosis, primaryInsurance: c.primaryInsurance,
      ehrProvider: c.ehrProvider ?? '', ehrCaseId: c.ehrCaseId ?? '',
    });
    setActiveTab('info');
  };

  const handleBack = () => { setSelectedClient(null); setActiveTab('info'); };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setShowSortMenu(false);
  };

  const activeClientId = selectedClient?.id ?? devClientId;
  const activeClientDx = selectedClient?.diagnosis ?? devClientDx;

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
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: '#3F9B2F' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#2E7D22')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#3F9B2F')}
            >
              Save Changes
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
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
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
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-800">Linked EHR Information</h3>
                    <Field label="EHR Provider" value={form.ehrProvider ?? ''} onChange={(v) => handleFormChange('ehrProvider', v)} inputClass={inputClass} labelClass={labelClass} />
                    <Field label="Case ID #" value={form.ehrCaseId ?? ''} onChange={(v) => handleFormChange('ehrCaseId', v)} inputClass={inputClass} labelClass={labelClass} />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'ai_data' && <ConnectedAIDataTab clientId={selectedClient.id} onStartChat={onStartChat ? () => onStartChat!(selectedClient.id) : undefined} />}
            {activeTab === 'treatment_team' && <EmptyTab message="No team members assigned" sub="Add BCBAs and RBTs to this client's treatment team" />}
            {activeTab === 'ehr' && <EmptyTab message="No EHR connected" sub="Connect an EHR provider to sync client data automatically" />}
            {activeTab === 'resources' && <ConnectedResourcesTab clientId={selectedClient.id} />}

            {activeTab === 'authorizations' && (
              <div>
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-gray-800 mb-1">Authorization Records</h2>
                  <p className="text-sm text-gray-500">
                    Consent, research, and special-category authorization records for this client.
                    These are included with every ACLX evaluate call to verify legally-required authorizations.
                  </p>
                </div>
                {!selectedClient && (
                  <div className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <span className="text-xs text-amber-700 font-medium shrink-0">Dev preview:</span>
                    <div className="flex gap-2">
                      {DEV_CLIENT_IDS.map((id) => (
                        <button
                          key={id}
                          onClick={() => setDevClientId(id)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold border transition-colors"
                          style={devClientId === id
                            ? { background: '#3F9B2F', color: 'white', borderColor: '#3F9B2F' }
                            : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
          <div className="space-y-2">
            {displayClients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                onSelect={handleSelectClient}
                onStartChat={onStartChat ? () => onStartChat(client.id) : undefined}
              />
            ))}
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
  client, onSelect, onStartChat,
}: {
  client: Client;
  onSelect: (c: Client) => void;
  onStartChat?: () => void;
}) {
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
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.firstName.trim()) { setError('First name is required.'); return; }
    if (!form.lastName.trim())  { setError('Last name is required.');  return; }
    setSaving(true); setError('');
    try {
      const res = await api.createClient(form);
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
          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lc}>EHR Provider</label>
              <input className={ic} value={form.ehrProvider} onChange={(e) => set('ehrProvider', e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className={lc}>EHR Case ID</label>
              <input className={ic} value={form.ehrCaseId} onChange={(e) => set('ehrCaseId', e.target.value)} placeholder="Optional" />
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

// ── Connected AI Data tab ─────────────────────────────────────────────────────

function ConnectedAIDataTab({
  clientId,
  onStartChat,
}: {
  clientId: string;
  onStartChat?: () => void;
}) {
  const [chats, setChats]       = useState<Chat[]>([]);
  const [docs, setDocs]         = useState<unknown[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getChats().catch(() => [] as Chat[]),
      api.getClientDocuments(clientId).then((r) => r.documents).catch(() => []),
    ]).then(([allChats, clientDocs]) => {
      setChats(allChats.filter((c) => c.clientId === clientId));
      setDocs(clientDocs);
    }).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
      </div>
    );
  }

  const hasData = chats.length > 0 || docs.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <FontAwesomeIcon icon={faRobot} className="text-4xl text-gray-300" />
        <p className="text-base font-medium">No AI data yet</p>
        <p className="text-sm">Start a chat for this client to begin generating AI-assisted documentation.</p>
        {onStartChat && (
          <button
            onClick={onStartChat}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: '#3F9B2F', color: '#3F9B2F', background: 'white' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF7EA')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
          >
            <FontAwesomeIcon icon={faCommentDots} className="text-xs" />
            Start Chat
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Chats section */}
      {chats.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FontAwesomeIcon icon={faComments} style={{ color: '#3F9B2F', fontSize: 14 }} />
            <h3 className="text-sm font-semibold text-gray-700">Chat Sessions</h3>
            <span className="text-xs text-gray-400">({chats.length})</span>
          </div>
          <div className="space-y-2">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className="bg-white rounded-xl px-5 py-3 flex items-center gap-4"
                style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#EEF7EA' }}
                >
                  <FontAwesomeIcon icon={faCommentDots} style={{ color: '#3F9B2F', fontSize: 13 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{chat.title || 'Untitled Chat'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {chat.projectLabel ? `📁 ${chat.projectLabel} · ` : ''}
                    {new Date(chat.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {onStartChat && (
                  <button
                    onClick={onStartChat}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0"
                    style={{ borderColor: '#3F9B2F', color: '#3F9B2F', background: 'white' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF7EA')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs" />
                    Open
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI-generated documents section */}
      {docs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FontAwesomeIcon icon={faRobot} style={{ color: '#1E88FF', fontSize: 14 }} />
            <h3 className="text-sm font-semibold text-gray-700">AI-Generated Documents</h3>
            <span className="text-xs text-gray-400">({docs.length})</span>
          </div>
          <div className="space-y-2">
            {docs.map((doc, i) => {
              const d = doc as Record<string, string>;
              return (
                <div
                  key={d.id ?? i}
                  className="bg-white rounded-xl px-5 py-3 flex items-center gap-4"
                  style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: '#EEF4FF' }}
                  >
                    <FontAwesomeIcon icon={faFileAlt} style={{ color: '#1E88FF', fontSize: 13 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {d.documentType ?? d.title ?? 'AI Document'}
                    </p>
                    {d.createdAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Generated {new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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

function ConnectedResourcesTab({ clientId }: { clientId: string }) {
  const [resources, setResources] = useState<PolicyDocument[]>([]);
  const [all, setAll]             = useState<PolicyDocument[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');

  useEffect(() => {
    setLoading(true);
    api.getPolicies()
      .then((docs) => {
        setAll(docs);
        // For now show all active resources; future: filter by clientId linkage
        setResources(docs.filter((d) => d.isActive));
      })
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
    void clientId; // will be used for server-side filtering once wired
  }, [clientId]);

  const filtered = search
    ? resources.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
    : resources;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 border border-gray-300 bg-white" style={{ minWidth: 220 }}>
          <FontAwesomeIcon icon={faSearch} className="text-gray-400 text-xs shrink-0" />
          <input
            type="text"
            placeholder="Search resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400 w-full"
          />
        </div>
        <span className="text-sm text-gray-400">{filtered.length} resource{filtered.length !== 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
          style={{ borderColor: '#3F9B2F', color: '#3F9B2F', background: 'white' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF7EA')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
        >
          <FontAwesomeIcon icon={faLink} className="text-xs" />
          Link Resource
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faFolderOpen} className="text-4xl mb-3 text-gray-300" />
          <p className="text-base font-medium">No resources connected</p>
          <p className="text-sm mt-1">Use "Link Resource" to attach policies, SOPs, or templates to this client.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const colors = CATEGORY_COLORS[r.category] ?? { bg: '#f3f4f6', text: '#374151' };
            return (
              <div
                key={r.id}
                className="bg-white rounded-xl px-5 py-4 flex items-center gap-4"
                style={{ border: '2px solid #DCE7EE', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: colors.bg }}
                >
                  <FontAwesomeIcon icon={faFileAlt} style={{ color: colors.text, fontSize: 15 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm truncate">{r.title}</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {CATEGORY_LABELS[r.category] ?? r.category}
                    </span>
                  </div>
                  {r.textContent && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{r.textContent.slice(0, 100)}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  Updated {new Date(r.updatedAt).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
