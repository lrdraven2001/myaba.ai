import { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faTimes, faSpinner, faSearch, faChevronDown, faEllipsisH,
  faFilePdf, faFileWord, faFilePowerpoint, faFileExcel, faFileLines, faLink, faGlobe,
  faEye, faPen, faBoxArchive, faRotateLeft, faTrash, faShareNodes, faCopy, faUpload,
  faUsers, faUser, faStar, faFolderOpen, faFileWord as faWordUpload,
} from '@fortawesome/free-solid-svg-icons';
import { faGoogleDrive, faMicrosoft } from '@fortawesome/free-brands-svg-icons';
import { api } from '../lib/api';
import type { ResourceInput } from '../lib/api';
import type { DriveConnection } from '../types';
import DriveConnectWizard from '../components/drive/DriveConnectWizard';
import { useAuth } from '../contexts/AuthContext';
import { DOCUMENT_TYPES, documentTypeLabel, defaultTemplateFor, categoryFor } from '../lib/documentTypes';

/** Bucket each tab writes to. */
const TAB_BUCKET: Record<Tab, string> = { templates: 'LIBRARY', library: 'LIBRARY', policies: 'POLICY', grounding: 'GROUNDING' };
/** Marker placed on documentType for cloud folders linked from the Templates tab. */
const TEMPLATE_LINK_MARKER = '__templates_link__';

// (Resources are agency-wide; tabs are simply Active / Archived — no per-user sharing split.)

// ── Types ───────────────────────────────────────────────────────────────────────

type Tab = 'templates' | 'policies' | 'grounding' | 'library';

interface Resource {
  id: string;
  title: string;
  description?: string;
  resourceType?: string;
  bucket?: string;
  documentType?: string;
  customized?: boolean;
  topicCategory?: string;
  fileType?: string;
  source?: string;
  url?: string;
  folder?: string;
  shared?: boolean;
  archived?: boolean;
  /** ISO timestamp set when archived — drives the HIPAA 7-day delete gate. */
  archivedAt?: string;
  /** Archive-first: delete unlocks 7 days after archiving (server-enforced). */
  hipaaMarked?: boolean;
  linkedIds?: string[];
  clientId?: string;
  textContent?: string;
  isActive?: boolean;
  orgId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: 'templates', label: 'Templates'      },
  { key: 'policies',  label: 'Policies'       },
  { key: 'library',   label: 'Agency Library' },
  { key: 'grounding', label: 'Grounding'      },
];

const FILE_TYPES: Record<string, { icon: typeof faFilePdf; color: string; label: string }> = {
  PDF:  { icon: faFilePdf,         color: '#E03E2D', label: 'PDF'  },
  DOCX: { icon: faFileWord,        color: '#2B7CD3', label: 'DOCX' },
  PPTX: { icon: faFilePowerpoint,  color: '#D24726', label: 'PPTX' },
  XLSX: { icon: faFileExcel,       color: '#1D7044', label: 'XLSX' },
  LINK: { icon: faLink,            color: '#6B7B88', label: 'Link' },
  TEXT: { icon: faFileLines,       color: '#6B7B88', label: 'Text' },
};
const FILE_TYPE_OPTIONS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'LINK', 'TEXT'];

const TOPIC_CATEGORIES = ['Billing', 'Clinical', 'Supervision', 'Parent Training', 'Intake', 'Reports', 'Discharge', 'Training', 'Other'];
const TOPIC_COLORS: Record<string, { bg: string; text: string }> = {
  Billing:           { bg: '#E6F4EA', text: '#1E7E34' },
  Clinical:          { bg: '#E6F0FF', text: '#1E5FBF' },
  Supervision:       { bg: '#F3EAFE', text: '#7C3AED' },
  'Parent Training': { bg: '#FEEFE3', text: '#C2410C' },
  Intake:            { bg: '#FFF7E0', text: '#A16207' },
  Reports:           { bg: '#FCE7F0', text: '#BE185D' },
  Discharge:         { bg: '#FEE2E2', text: '#B91C1C' },
  Training:          { bg: '#E0F2FE', text: '#0369A1' },
  Other:             { bg: '#F0F4F8', text: '#5A7184' },
};

const SOURCES: Record<string, { icon: typeof faGlobe; brand?: boolean; color: string; label: string }> = {
  DRIVE:    { icon: faGoogleDrive, brand: true, color: '#1A73E8', label: 'Google Drive' },
  ONEDRIVE: { icon: faMicrosoft,   brand: true, color: '#0364B8', label: 'OneDrive'     },
  WEB:      { icon: faGlobe,       color: '#5A7184', label: 'Web Link' },
  UPLOAD:   { icon: faUpload,      color: '#5A7184', label: 'Upload'   },
  MANUAL:   { icon: faFileLines,   color: '#5A7184', label: 'Manual'   },
};

const LIBRARY_TYPES: Record<string, string> = {
  STANDARD_TEMPLATE:   'Standard Template',
  KNOWLEDGE_REFERENCE: 'Knowledge Reference',
};

function relDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function slug(name: string): string {
  return 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Root ─────────────────────────────────────────────────────────────────────────

export default function ResourcesView() {
  const { currentUser } = useAuth();
  const orgId = currentUser?.orgId ?? '';
  const isAdmin = currentUser?.role === 'ORG_SUPER_ADMIN' || currentUser?.role === 'CLINICAL_DIRECTOR';

  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [resources, setResources] = useState<Resource[]>([]);
  const [members, setMembers]     = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(true);

  const load = () => {
    setLoading(true);
    api.getResources()
      .then((r) => setResources(((r as Resource[]) ?? [])))
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (orgId) {
      api.getOrgMembers(orgId)
        .then((ms) => setMembers(Object.fromEntries(ms.map((m) => [m.id, m.displayName]))))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Sub-navigation */}
      <div className="bg-white border-b border-gray-200 px-8">
        <div className="flex gap-7">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="relative py-4 text-sm font-semibold transition-colors"
              style={{ color: activeTab === t.key ? '#1E88FF' : '#6B7B88' }}
            >
              {t.label}
              {activeTab === t.key && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ background: '#1E88FF' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      <ResourceManager
        key={activeTab}
        tab={activeTab}
        allResources={resources}
        members={members}
        currentUid={currentUser?.uid ?? ''}
        isAdmin={isAdmin}
        loading={loading}
        onChanged={load}
      />
    </div>
  );
}

// ── Manager (per tab) ──────────────────────────────────────────────────────────

const TAB_META: Record<Tab, { title: string; subtitle: string; addLabel: string }> = {
  templates: { title: 'Templates', subtitle: 'Create, customize, and manage the document templates your team uses to generate client documents.', addLabel: 'New Template' },
  policies:  { title: 'Policies',  subtitle: "Your agency's rules, SOPs, and handbooks — usable as context in any chat.", addLabel: 'Add Policy' },
  grounding: { title: 'Grounding', subtitle: "Trusted sources the AI is checked against to prevent hallucinations.", addLabel: 'Add Source' },
  library:   { title: 'Resources', subtitle: 'Store, organize, and manage reference materials your AI can draw from.', addLabel: 'Add Resource' },
};

function ResourceManager({
  tab, allResources, members, currentUid, isAdmin, loading, onChanged,
}: {
  tab: Tab;
  allResources: Resource[];
  members: Record<string, string>;
  currentUid: string;
  isAdmin: boolean;
  loading: boolean;
  onChanged: () => void;
}) {
  const meta = TAB_META[tab];
  const builtinKeys = useMemo(() => new Set(DOCUMENT_TYPES.map((d) => d.value)), []);

  // Filter the global list down to this tab's bucket.
  const tabResources = useMemo(() => allResources.filter((r) => {
    if (tab === 'templates') return r.resourceType === 'GENERATION_TEMPLATE'
      || (r.resourceType === 'LINKED_FOLDER' && r.documentType === TEMPLATE_LINK_MARKER);
    if (tab === 'library')   return (r.bucket ?? 'LIBRARY') === 'LIBRARY'
      && r.resourceType !== 'GENERATION_TEMPLATE' && r.documentType !== TEMPLATE_LINK_MARKER;
    if (tab === 'policies')  return (r.bucket ?? 'POLICY') === 'POLICY';
    return (r.bucket ?? '') === 'GROUNDING';
  }), [allResources, tab]);

  const [countTab, setCountTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch]     = useState('');
  const [fType, setFType]       = useState('');
  const [fCat, setFCat]         = useState('');
  const [fSource, setFSource]   = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starterSel, setStarterSel] = useState<string | null>(null);
  const [form, setForm]         = useState<{ open: boolean; editing?: Resource; presetDoc?: string; custom?: boolean }>({ open: false });
  const [driveProvider, setDriveProvider] = useState<'google' | 'microsoft' | null>(null);
  const [addMenuOpen, setAddMenuOpen]     = useState(false);

  // ── Templates: synthetic "Starter" rows from the 8 built-in document types ──
  const starterRows = useMemo(() => DOCUMENT_TYPES.map((d) => {
    const customResource   = tabResources.find((r) => r.documentType === d.value && r.customized && !r.archived);
    const archivedResource = tabResources.find((r) => r.documentType === d.value && r.archived);
    return { value: d.value, label: d.label, category: categoryFor(d.value), customized: !!customResource, archived: !!archivedResource, resource: customResource ?? archivedResource };
  }), [tabResources]);

  const tabBucket = TAB_BUCKET[tab];

  const handleDriveLinked = async (conn: DriveConnection) => {
    await api.createPolicy({
      title: conn.driveItemName || 'Linked folder',
      category: 'linked_folder',
      description: `Linked ${conn.driveSource === 'google' ? 'Google Drive' : 'OneDrive'} folder`,
      bucket: tabBucket,
      resourceType: 'LINKED_FOLDER',
      documentType: tab === 'templates' ? TEMPLATE_LINK_MARKER : undefined,
      fileType: 'LINK',
      source: conn.driveSource === 'google' ? 'DRIVE' : 'ONEDRIVE',
      url: conn.driveItemUrl,
      isActive: true,
    }).catch(() => {});
    setDriveProvider(null);
    onChanged();
  };

  // Hide a starter template (so it disappears from the client Generate Document pulldown).
  const archiveStarter = async (docValue: string) => {
    const existing = tabResources.find((r) => r.documentType === docValue);
    if (existing) await api.setResourceArchived(existing.id, true).catch(() => {});
    else await api.createPolicy({
      title: documentTypeLabel(docValue), category: 'generation_template',
      bucket: 'LIBRARY', resourceType: 'GENERATION_TEMPLATE',
      documentType: docValue, customized: false, archived: true, isActive: true,
    }).catch(() => {});
    setStarterSel(null); onChanged();
  };
  const restoreStarter = async (docValue: string) => {
    const existing = tabResources.find((r) => r.documentType === docValue && r.archived);
    if (existing) await api.setResourceArchived(existing.id, false).catch(() => {});
    setStarterSel(null); onChanged();
  };

  // ── Resource rows for the table (custom templates for Templates; bucket resources otherwise) ──
  const rows = useMemo(() => {
    const base = tab === 'templates'
      ? tabResources.filter((r) => !builtinKeys.has(r.documentType ?? ''))   // custom templates + linked folders
      : tabResources;
    const wantArchived = countTab === 'archived';
    const q = search.trim().toLowerCase();
    return base
      .filter((r) => !!r.archived === wantArchived)
      .filter((r) =>
        (!q || r.title.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)) &&
        (!fType   || (r.fileType ?? 'TEXT') === fType) &&
        (!fCat    || (r.topicCategory ?? '') === fCat) &&
        (!fSource || (r.source ?? 'MANUAL') === fSource),
      );
  }, [tabResources, countTab, search, fType, fCat, fSource, tab, builtinKeys]);

  // ── Starter templates shown in the current (Active/Archived) tab ──
  const shownStarters = useMemo(() => {
    if (tab !== 'templates') return [];
    const q = search.trim().toLowerCase();
    return starterRows
      .filter((s) => (countTab === 'archived' ? s.archived : !s.archived))
      .filter((s) => !q || s.label.toLowerCase().includes(q));
  }, [starterRows, countTab, search, tab]);

  const counts = useMemo(() => {
    if (tab === 'templates') {
      const customActive   = tabResources.filter((r) => !builtinKeys.has(r.documentType ?? '') && !r.archived).length;
      const customArchived = tabResources.filter((r) => !builtinKeys.has(r.documentType ?? '') && r.archived).length;
      const starterActive   = starterRows.filter((s) => !s.archived).length;
      const starterArchived = starterRows.filter((s) => s.archived).length;
      return { active: starterActive + customActive, archived: starterArchived + customArchived };
    }
    return {
      active:   tabResources.filter((r) => !r.archived).length,
      archived: tabResources.filter((r) => r.archived).length,
    };
  }, [tabResources, tab, builtinKeys, starterRows]);

  const countTabDefs = [
    { key: 'active',   label: 'Active',   sub: 'In active use',           icon: faFolderOpen, count: counts.active },
    { key: 'archived', label: 'Archived', sub: 'No longer in active use', icon: faBoxArchive, count: counts.archived },
  ];

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? tabResources.find((r) => r.id === selectedId) : undefined;
  const starterSelected = tab === 'templates' && starterSel ? starterRows.find((s) => s.value === starterSel) : undefined;

  // ── Actions ──
  const archive = async (r: Resource, val: boolean) => { await api.setResourceArchived(r.id, val).catch(() => {}); setSelectedId(null); onChanged(); };
  // Surface delete failures — the server may refuse (e.g. HIPAA 7-day archive gate).
  const del     = async (r: Resource) => {
    try { await api.deletePolicy(r.id); } catch (e) { alert(e instanceof Error ? e.message : 'Delete failed.'); }
    setSelectedId(null); onChanged();
  };

  const openAdd = () => {
    if (tab === 'templates') setForm({ open: true, custom: true });
    else setForm({ open: true });
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{meta.title}</h1>
            {isAdmin && (
              <div className="relative shrink-0">
                <div className="flex">
                  <button
                    onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 rounded-l-lg text-white text-sm font-semibold"
                    style={{ background: '#1E88FF' }}
                  >
                    <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> {meta.addLabel}
                  </button>
                  <button
                    onClick={() => setAddMenuOpen((o) => !o)}
                    className="px-2.5 py-2 rounded-r-lg text-white text-sm border-l"
                    style={{ background: '#1E88FF', borderColor: 'rgba(255,255,255,0.3)' }}
                    aria-label="More add options"
                  >
                    <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 11 }} />
                  </button>
                </div>
                {addMenuOpen && (
                  <div className="absolute right-0 mt-1 z-30 bg-white rounded-lg shadow-xl border border-gray-100 py-1 w-56 text-left" onMouseLeave={() => setAddMenuOpen(false)}>
                    <button onClick={() => { setAddMenuOpen(false); openAdd(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12, width: 16 }} /> {meta.addLabel} manually
                    </button>
                    <div className="my-1 border-t border-gray-100" />
                    <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Link a cloud folder</p>
                    <button onClick={() => { setAddMenuOpen(false); setDriveProvider('google'); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <FontAwesomeIcon icon={faGoogleDrive as any} style={{ fontSize: 13, width: 16, color: '#1A73E8' }} /> Google Drive folder
                    </button>
                    <button onClick={() => { setAddMenuOpen(false); setDriveProvider('microsoft'); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <FontAwesomeIcon icon={faMicrosoft as any} style={{ fontSize: 13, width: 16, color: '#0364B8' }} /> OneDrive folder
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-5">{meta.subtitle}</p>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[220px]">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" style={{ fontSize: 13 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${meta.title.toLowerCase()}…`}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              />
            </div>
            {tab === 'library' && (
              <>
                <FilterSelect label="Type"     value={fType}   onChange={setFType}   options={FILE_TYPE_OPTIONS.map((t) => ({ value: t, label: FILE_TYPES[t].label }))} />
                <FilterSelect label="Category" value={fCat}    onChange={setFCat}    options={TOPIC_CATEGORIES.map((c) => ({ value: c, label: c }))} />
                <FilterSelect label="Source"   value={fSource} onChange={setFSource} options={Object.entries(SOURCES).map(([k, v]) => ({ value: k, label: v.label }))} />
              </>
            )}
            {tab !== 'library' && (
              <FilterSelect label="Category" value={fCat} onChange={setFCat} options={TOPIC_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            )}
          </div>

          {/* Count tabs */}
          <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: `repeat(${countTabDefs.length}, minmax(0, 1fr))` }}>
            {countTabDefs.map((c) => (
              <button
                key={c.key}
                onClick={() => { setCountTab(c.key); setSelectedId(null); setStarterSel(null); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors"
                style={{
                  borderColor: countTab === c.key ? '#1E88FF' : '#E5EAF0',
                  background: countTab === c.key ? '#F5F9FF' : 'white',
                }}
              >
                <FontAwesomeIcon icon={c.icon} style={{ fontSize: 15, color: countTab === c.key ? '#1E88FF' : '#9AA7B2' }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 truncate">{c.label}</span>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#EEF2F6', color: '#52616B' }}>{c.count}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{c.sub}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-20"><FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-300 text-2xl" /></div>
          ) : tab === 'templates' ? (
            (shownStarters.length === 0 && rows.length === 0) ? (
              <EmptyState tab={tab} isAdmin={isAdmin} />
            ) : (
              <div className="space-y-5">
                {shownStarters.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faStar} style={{ fontSize: 10 }} /> Starter Templates · Provided by myABA
                    </p>
                    <StarterTable rows={shownStarters} selected={starterSel} onSelect={setStarterSel} isAdmin={isAdmin} onArchive={archiveStarter} onRestore={restoreStarter} />
                  </div>
                )}
                {rows.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faUser} style={{ fontSize: 10 }} /> Your Templates
                    </p>
                    <ResourceTable
                      tab={tab} rows={rows} members={members} selectedId={selectedId}
                      onSelect={setSelectedId} onArchive={(r) => archive(r, !r.archived)} onDelete={del}
                      onEdit={(r) => setForm({ open: true, editing: r })} isAdmin={isAdmin}
                    />
                  </div>
                )}
              </div>
            )
          ) : rows.length === 0 ? (
            <EmptyState tab={tab} isAdmin={isAdmin} />
          ) : (
            <ResourceTable
              tab={tab} rows={rows} members={members} selectedId={selectedId}
              onSelect={setSelectedId}
              onArchive={(r) => archive(r, !r.archived)}
              onDelete={del}
              onEdit={(r) => setForm({ open: true, editing: r })}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </div>

      {/* Details panel */}
      {(selected || starterSelected) && (
        <DetailsPanel
          tab={tab}
          resource={selected}
          starter={starterSelected}
          members={members}
          isAdmin={isAdmin}
          onClose={() => { setSelectedId(null); setStarterSel(null); }}
          onEdit={(r) => setForm({ open: true, editing: r })}
          onCustomizeStarter={(docValue) => setForm({ open: true, presetDoc: docValue })}
          onArchive={(r) => archive(r, !r.archived)}
          onDelete={del}
        />
      )}

      {/* Add / Edit modal */}
      {form.open && (
        <ResourceFormModal
          tab={tab}
          editing={form.editing}
          presetDoc={form.presetDoc}
          custom={form.custom}
          onClose={() => setForm({ open: false })}
          onSaved={() => { setForm({ open: false }); onChanged(); }}
        />
      )}

      {/* Cloud folder linking */}
      {driveProvider && (
        <DriveConnectWizard
          provider={driveProvider}
          onClose={() => setDriveProvider(null)}
          onLinked={handleDriveLinked}
        />
      )}
    </div>
  );
}

// ── Filter select ──────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <option value="">{label}: All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <FontAwesomeIcon icon={faChevronDown} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" style={{ fontSize: 10 }} />
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────────

function fileMeta(r: Resource) { return FILE_TYPES[r.fileType ?? 'TEXT'] ?? FILE_TYPES.TEXT; }

function ResourceTable({ tab, rows, members, selectedId, onSelect, onArchive, onDelete, onEdit, isAdmin }: {
  tab: Tab; rows: Resource[]; members: Record<string, string>; selectedId: string | null;
  onSelect: (id: string) => void; onArchive: (r: Resource) => void; onDelete: (r: Resource) => void;
  onEdit: (r: Resource) => void; isAdmin: boolean;
}) {
  // Menu uses fixed positioning (anchored to the trigger's rect) so it can't be
  // clipped by the table's overflow-hidden container.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuId = menu?.id ?? null;
  const showSourceType = tab === 'library';

  /** Delete rules for HIPAA-marked rows: archive-first, unlock 7 days later. */
  const deleteState = (r: Resource): { allowed: boolean; label: string } => {
    if (!r.hipaaMarked) return { allowed: true, label: 'Delete' };
    if (!r.archived) return { allowed: false, label: 'Delete (archive first)' };
    if (!r.archivedAt) return { allowed: false, label: 'Delete (re-archive to start 7-day clock)' };
    const unlockMs = new Date(r.archivedAt).getTime() + 7 * 24 * 3600 * 1000;
    const daysLeft = Math.ceil((unlockMs - Date.now()) / (24 * 3600 * 1000));
    return daysLeft > 0
      ? { allowed: false, label: `Delete (in ${daysLeft}d)` }
      : { allowed: true, label: 'Delete' };
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide" style={{ borderBottom: '1px solid #EEF2F6' }}>
            <th className="px-5 py-3">{tab === 'templates' ? 'Template Name' : 'Resource Name'}</th>
            {showSourceType && <th className="px-3 py-3">Type</th>}
            <th className="px-3 py-3">Category</th>
            {showSourceType && <th className="px-3 py-3">Source</th>}
            <th className="px-3 py-3">Last Modified</th>
            <th className="px-3 py-3">{tab === 'templates' ? 'Used By' : 'Linked To'}</th>
            <th className="px-3 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const fm = fileMeta(r);
            const sm = SOURCES[r.source ?? 'MANUAL'] ?? SOURCES.MANUAL;
            const cat = r.topicCategory || 'Other';
            const cc = TOPIC_COLORS[cat] ?? TOPIC_COLORS.Other;
            const isCustom = tab === 'templates' && !!r.documentType && r.documentType.startsWith('custom_');
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className="cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid #F3F6F9', background: selectedId === r.id ? '#F5F9FF' : undefined }}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={fm.icon} style={{ color: fm.color, fontSize: 16 }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800 truncate">{r.title}</span>
                        {tab === 'templates' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={isCustom ? { background: '#E6F4FF', color: '#1E88FF' } : { background: '#F3EEFE', color: '#7C3AED' }}>
                            {isCustom ? 'Custom' : 'Customized'}
                          </span>
                        )}
                      </div>
                      {r.description && <p className="text-xs text-gray-400 truncate">{r.description}</p>}
                    </div>
                  </div>
                </td>
                {showSourceType && <td className="px-3 py-3 text-gray-500 text-xs font-medium">{fm.label}</td>}
                <td className="px-3 py-3">
                  {r.topicCategory && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cc.bg, color: cc.text }}>{cat}</span>}
                </td>
                {showSourceType && (
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      {sm.brand
                        ? <FontAwesomeIcon icon={sm.icon as any} style={{ color: sm.color, fontSize: 13 }} />
                        : <FontAwesomeIcon icon={sm.icon} style={{ color: sm.color, fontSize: 12 }} />}
                      {sm.label}
                    </span>
                  </td>
                )}
                <td className="px-3 py-3 text-gray-500">
                  <div className="text-xs">{relDate(r.updatedAt)}</div>
                  <div className="text-[11px] text-gray-400">by {members[r.createdBy ?? ''] ?? '—'}</div>
                </td>
                <td className="px-3 py-3 text-gray-500">
                  <span className="flex items-center gap-1.5 text-xs"><FontAwesomeIcon icon={faUsers} style={{ fontSize: 11, color: '#9AA7B2' }} />{(r.linkedIds ?? []).length}</span>
                </td>
                <td className="px-3 py-3 text-right relative" onClick={(e) => e.stopPropagation()}>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        if (menuId === r.id) { setMenu(null); return; }
                        const rect = e.currentTarget.getBoundingClientRect();
                        // Flip the menu above the trigger when there isn't room below
                        // (e.g. the last row, near the bottom of the viewport).
                        const MENU_H = 128;
                        const openUp = rect.bottom + MENU_H > window.innerHeight - 8;
                        setMenu({ id: r.id, x: rect.right, y: openUp ? rect.top - MENU_H : rect.bottom + 4 });
                      }}
                      className="w-7 h-7 rounded hover:bg-gray-100 text-gray-400"
                    >
                      <FontAwesomeIcon icon={faEllipsisH} style={{ fontSize: 13 }} />
                    </button>
                  )}
                  {menuId === r.id && menu && (
                    <div
                      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-100 py-1 w-56 text-left"
                      style={{ top: menu.y, left: Math.max(8, menu.x - 224) }}
                      onMouseLeave={() => setMenu(null)}
                    >
                      <MenuItem icon={faPen} label="Edit" onClick={() => { setMenu(null); onEdit(r); }} />
                      <MenuItem icon={r.archived ? faRotateLeft : faBoxArchive} label={r.archived ? 'Restore' : 'Archive'} onClick={() => { setMenu(null); onArchive(r); }} />
                      {(() => { const d = deleteState(r); return (
                        <MenuItem icon={faTrash} label={d.label} danger disabled={!d.allowed}
                          onClick={() => { if (!d.allowed) return; setMenu(null); onDelete(r); }} />
                      ); })()}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger, disabled }: { icon: typeof faPen; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'HIPAA-marked — archive first; deletion unlocks 7 days after archiving.' : undefined}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed"
      style={{ color: disabled ? '#9CA3AF' : danger ? '#DC2626' : '#374151' }}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 12, width: 14 }} /> {label}
    </button>
  );
}

// ── Starter templates table ──────────────────────────────────────────────────────

function StarterTable({ rows, selected, onSelect, isAdmin, onArchive, onRestore }: {
  rows: { value: string; label: string; category: string; customized: boolean; archived: boolean }[];
  selected: string | null; onSelect: (v: string) => void;
  isAdmin: boolean; onArchive: (v: string) => void; onRestore: (v: string) => void;
}) {
  const status = (r: { customized: boolean; archived: boolean }) =>
    r.archived ? { label: 'Hidden', bg: '#FEE2E2', text: '#B91C1C' }
    : r.customized ? { label: 'Customized', bg: '#F3EEFE', text: '#7C3AED' }
    : { label: 'Default', bg: '#F0F4F8', text: '#8CA4B5' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide" style={{ borderBottom: '1px solid #EEF2F6' }}>
            <th className="px-5 py-3">Template Name</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Provided By</th><th className="px-3 py-3 text-right">In Pulldown</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = status(r);
            const cc = TOPIC_COLORS[r.category] ?? TOPIC_COLORS.Other;
            return (
              <tr key={r.value} onClick={() => onSelect(r.value)} className="cursor-pointer" style={{ borderBottom: '1px solid #F3F6F9', background: selected === r.value ? '#F5F9FF' : undefined, opacity: r.archived ? 0.6 : 1 }}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={faFileLines} style={{ color: '#1E88FF', fontSize: 16 }} />
                    <span className="font-semibold text-gray-800">{r.label}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cc.bg, color: cc.text }}>{r.category}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>{s.label}</span>
                </td>
                <td className="px-3 py-3 text-xs text-gray-400">myABA</td>
                <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  {isAdmin && (
                    <button
                      onClick={() => (r.archived ? onRestore(r.value) : onArchive(r.value))}
                      className="text-xs font-semibold px-2.5 py-1 rounded-md border"
                      style={r.archived ? { borderColor: '#1E88FF', color: '#1E88FF' } : { borderColor: '#E5EAF0', color: '#6B7B88' }}
                      title={r.archived ? 'Show in client Generate Document pulldown' : 'Hide from client Generate Document pulldown'}
                    >
                      <FontAwesomeIcon icon={r.archived ? faRotateLeft : faBoxArchive} style={{ fontSize: 10 }} /> {r.archived ? 'Restore' : 'Hide'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────────

function EmptyState({ tab, isAdmin }: { tab: Tab; isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 bg-white rounded-xl border border-dashed border-gray-200 text-center">
      <FontAwesomeIcon icon={faFolderOpen} style={{ fontSize: 36, color: '#D6DEE6' }} />
      <p className="text-sm font-semibold text-gray-600">Nothing here yet</p>
      {isAdmin && <p className="text-xs text-gray-400">Use the <strong>{TAB_META[tab].addLabel}</strong> button above to get started.</p>}
    </div>
  );
}

// ── Details panel ────────────────────────────────────────────────────────────────

function DetailsPanel({ tab, resource, starter, members, isAdmin, onClose, onEdit, onCustomizeStarter, onArchive, onDelete }: {
  tab: Tab; resource?: Resource; starter?: { value: string; label: string; category?: string; customized: boolean; resource?: Resource };
  members: Record<string, string>; isAdmin: boolean; onClose: () => void;
  onEdit: (r: Resource) => void; onCustomizeStarter: (docValue: string) => void;
  onArchive: (r: Resource) => void; onDelete: (r: Resource) => void;
}) {
  const r = resource ?? starter?.resource;
  const title = resource?.title ?? starter?.label ?? '';
  const fm = r ? fileMeta(r) : FILE_TYPES.TEXT;
  return (
    <div className="w-[340px] shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">{tab === 'templates' ? 'Template Details' : 'Resource Details'}</h3>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500"><FontAwesomeIcon icon={faTimes} /></button>
      </div>
      <div className="px-5 py-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F4F7FA' }}>
            <FontAwesomeIcon icon={fm.icon} style={{ color: fm.color, fontSize: 20 }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-tight">{title}</p>
            {starter && !starter.customized && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: '#F0F4F8', color: '#8CA4B5' }}>Default · myABA</span>}
            {r?.shared && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: '#E6F4EA', color: '#1E7E34' }}>Shared</span>}
          </div>
        </div>
        {(r?.description) && <p className="text-sm text-gray-500 mb-4">{r.description}</p>}

        <dl className="space-y-2.5 text-sm border-t border-gray-100 pt-4">
          {tab === 'library' && <Row k="Type"  v={fm.label} />}
          {(r?.topicCategory || starter?.category) && <Row k="Category" v={r?.topicCategory || starter?.category || ''} />}
          {tab === 'library' && r && <Row k="Source" v={(SOURCES[r.source ?? 'MANUAL'] ?? SOURCES.MANUAL).label} />}
          {tab === 'templates' && <Row k="Document Type" v={resource ? documentTypeLabel(resource.documentType ?? '') : starter?.label ?? ''} />}
          {r?.createdBy && <Row k="Added By" v={members[r.createdBy] ?? '—'} />}
          {r?.createdAt && <Row k="Added On" v={relDate(r.createdAt)} />}
          <Row k="Last Modified" v={r ? relDate(r.updatedAt) : 'Built-in'} />
          <Row k="Linked To" v={`${(r?.linkedIds ?? []).length} item(s)`} />
          {r?.folder && <Row k="Location" v={r.folder} />}
        </dl>

        {isAdmin && (
          <div className="mt-5 space-y-2">
            {starter && !r ? (
              <button onClick={() => onCustomizeStarter(starter.value)} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ background: '#1E88FF' }}>
                Customize Template
              </button>
            ) : r && (
              <>
                <button onClick={() => onEdit(r)} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ background: '#1E88FF' }}>
                  <FontAwesomeIcon icon={faPen} style={{ fontSize: 11 }} /> {tab === 'templates' ? 'Edit Template' : 'Edit Details'}
                </button>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="block w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-center text-gray-600"><FontAwesomeIcon icon={faEye} style={{ fontSize: 11 }} /> View Resource</a>}
                <div className="pt-2 border-t border-gray-100 mt-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">More Actions</p>
                  {r.url && <PanelAction icon={faCopy} label="Copy Link" onClick={() => navigator.clipboard.writeText(r.url!)} />}
                  <PanelAction icon={r.archived ? faRotateLeft : faBoxArchive} label={r.archived ? 'Restore' : 'Archive'} onClick={() => onArchive(r)} />
                  <PanelAction icon={faTrash} label="Delete" danger onClick={() => onDelete(r)} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-gray-400">{k}</dt><dd className="text-gray-700 font-medium text-right truncate">{v}</dd></div>;
}
function PanelAction({ icon, label, onClick, danger }: { icon: typeof faPen; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className="w-full flex items-center gap-2.5 py-1.5 text-sm hover:opacity-70" style={{ color: danger ? '#DC2626' : '#52616B' }}><FontAwesomeIcon icon={icon} style={{ fontSize: 12, width: 14 }} /> {label}</button>;
}

// ── Add / Edit modal ─────────────────────────────────────────────────────────────

function ResourceFormModal({ tab, editing, presetDoc, custom, onClose, onSaved }: {
  tab: Tab; editing?: Resource; presetDoc?: string; custom?: boolean; onClose: () => void; onSaved: () => void;
}) {
  const isTemplate = tab === 'templates';
  const [title, setTitle]       = useState(editing?.title ?? (presetDoc ? `${documentTypeLabel(presetDoc)} Template` : ''));
  const [description, setDesc]  = useState(editing?.description ?? '');
  const [resourceType, setRT]   = useState(editing?.resourceType ?? (isTemplate ? 'GENERATION_TEMPLATE' : 'KNOWLEDGE_REFERENCE'));
  const [topicCategory, setCat] = useState(editing?.topicCategory ?? (presetDoc ? categoryFor(presetDoc) : ''));
  const [fileType, setFileType] = useState(editing?.fileType ?? 'TEXT');
  const [source, setSource]     = useState(editing?.source ?? 'MANUAL');
  const [url, setUrl]           = useState(editing?.url ?? '');
  const [folder, setFolder]     = useState(editing?.folder ?? '');
  const [shared] = useState(editing?.shared ?? true);
  const [content, setContent]   = useState(editing?.textContent ?? (presetDoc ? defaultTemplateFor(presetDoc) : ''));
  const [hipaaMarked, setHipaaMarked] = useState(editing?.hipaaMarked ?? false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const extractFileText = async (f: File): Promise<string> => {
    if (/\.(txt|md|text)$/i.test(f.name)) return f.text();
    const { text } = await api.extractAttachment(f);
    return text ?? '';
  };

  const fileTypeFor = (name: string) =>
    /\.docx$/i.test(name) ? 'DOCX' : /\.pdf$/i.test(name) ? 'PDF' : 'TEXT';

  // Upload any supported document (Word/PDF/Excel/text) — extracted server-side.
  const uploadFile = async (f: File) => {
    setUploading(true); setError('');
    try {
      const text = await extractFileText(f);
      if (!text.trim()) { setError(`No readable text found in “${f.name}”.`); setUploading(false); return; }
      setContent(text);
      setFileType(fileTypeFor(f.name));
      setSource('UPLOAD');
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to read the file.'); }
    finally { setUploading(false); }
  };

  // Multiple files (up to 10, new items only): each becomes its own resource,
  // titled after its filename and using the form's current type/category settings.
  const uploadFiles = async (files: File[]) => {
    if (files.length === 1) { await uploadFile(files[0]); return; }
    if (files.length > 10) { setError('You can add up to 10 files at a time.'); return; }
    setUploading(true); setError('');
    const bucket = tab === 'templates' || tab === 'library' ? 'LIBRARY' : tab === 'policies' ? 'POLICY' : 'GROUNDING';
    const failures: string[] = [];
    let addedCount = 0;
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(`${i + 1} of ${files.length}`);
      const f = files[i];
      const docTitle = f.name.replace(/\.[^.]+$/, '');
      try {
        const text = await extractFileText(f);
        if (!text.trim()) { failures.push(`${f.name}: no readable text`); continue; }
        await api.createPolicy({
          title: docTitle,
          category: (isTemplate ? 'generation_template' : resourceType.toLowerCase()),
          textContent: text,
          description: description.trim(),
          bucket,
          resourceType: isTemplate ? 'GENERATION_TEMPLATE' : resourceType,
          documentType: isTemplate ? slug(docTitle) : undefined,
          customized: isTemplate ? true : undefined,
          topicCategory: topicCategory || undefined,
          fileType: fileTypeFor(f.name),
          source: 'UPLOAD',
          folder: folder.trim() || undefined,
          shared,
          hipaaMarked,
          isActive: true,
        });
        addedCount++;
      } catch (e: unknown) {
        failures.push(`${f.name}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
    setUploading(false);
    setUploadProgress('');
    if (failures.length > 0) window.alert(`Some files could not be added:\n${failures.join('\n')}`);
    if (addedCount > 0) onSaved(); // closes the modal and refreshes the list
    else if (failures.length > 0) setError('No documents were added.');
  };

  const save = async () => {
    if (!title.trim())   { setError('Name is required.'); return; }
    if (!content.trim() && !url.trim()) { setError('Add content, upload a file, or provide a link.'); return; }
    setSaving(true); setError('');
    const bucket = tab === 'templates' || tab === 'library' ? 'LIBRARY' : tab === 'policies' ? 'POLICY' : 'GROUNDING';
    const documentType = isTemplate
      ? (editing?.documentType ?? presetDoc ?? slug(title))
      : undefined;
    const payload: ResourceInput = {
      title: title.trim(),
      category: (isTemplate ? 'generation_template' : resourceType.toLowerCase()),
      textContent: content,
      description: description.trim(),
      bucket,
      resourceType: isTemplate ? 'GENERATION_TEMPLATE' : resourceType,
      documentType,
      customized: isTemplate ? true : undefined,
      topicCategory: topicCategory || undefined,
      fileType,
      source,
      url: url.trim() || undefined,
      folder: folder.trim() || undefined,
      shared,
      hipaaMarked,
      isActive: true,
    };
    try {
      if (editing) await api.updatePolicy(editing.id, payload);
      else await api.createPolicy({ ...payload, title: title.trim(), category: payload.category! });
      onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save.'); setSaving(false); }
  };

  const label = isTemplate ? 'Template' : tab === 'policies' ? 'Policy' : tab === 'grounding' ? 'Grounding Source' : 'Resource';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{editing ? `Edit ${label}` : `New ${label}`}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FontAwesomeIcon icon={faTimes} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label={isTemplate ? 'Template Name' : 'Title'} req>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder={isTemplate ? 'e.g. Monthly Authorization Summary' : 'e.g. Insurance Coverage Guidelines'} />
            {isTemplate && custom && <p className="text-xs text-gray-400 mt-1">Becomes a new option in the client Generate Document pulldown.</p>}
          </Field>
          <Field label="Description">
            <input value={description} onChange={(e) => setDesc(e.target.value)} className={inputCls} placeholder="Short description" />
          </Field>

          {!isTemplate && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tab === 'library' && (
                <Field label="Resource Type">
                  <select value={resourceType} onChange={(e) => setRT(e.target.value)} className={inputCls}>
                    {Object.entries(LIBRARY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Category">
                <select value={topicCategory} onChange={(e) => setCat(e.target.value)} className={inputCls}>
                  <option value="">None</option>
                  {TOPIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          )}
          {isTemplate && (
            <Field label="Category">
              <select value={topicCategory} onChange={(e) => setCat(e.target.value)} className={inputCls}>
                <option value="">None</option>
                {TOPIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}

          {tab === 'library' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Source">
                <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
                  {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="File Type">
                <select value={fileType} onChange={(e) => setFileType(e.target.value)} className={inputCls}>
                  {FILE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{FILE_TYPES[t].label}</option>)}
                </select>
              </Field>
            </div>
          )}

          {tab === 'library' && (source === 'DRIVE' || source === 'ONEDRIVE' || source === 'WEB' || fileType === 'LINK') && (
            <Field label="Link URL"><input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://…" /></Field>
          )}

          {/* Document upload — all buckets (templates, policies, library, grounding) */}
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer" style={{ borderColor: '#1E88FF', color: '#1E88FF' }}>
            <FontAwesomeIcon icon={uploading ? faSpinner : faWordUpload} className={uploading ? 'animate-spin' : ''} />
            {uploading
              ? (uploadProgress ? `Adding ${uploadProgress}…` : 'Reading…')
              : `Upload document${editing ? '' : 's'} (Word / PDF / Excel / text)`}
            <input type="file" multiple={!editing} accept=".docx,.pdf,.xlsx,.xls,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif" className="hidden" disabled={uploading} onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) { if (editing) uploadFile(fs[0]); else uploadFiles(fs); } e.target.value = ''; }} />
          </label>

          <Field label="Content">
            <textarea rows={7} value={content} onChange={(e) => setContent(e.target.value)} className={`${inputCls} font-mono`} style={{ resize: 'vertical', lineHeight: 1.6 }} placeholder="Paste or type the content here…" />
          </Field>

          {/* HIPAA marking — archive-first lifecycle */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-teal-700" checked={hipaaMarked} onChange={(e) => setHipaaMarked(e.target.checked)} />
            <span className="text-sm text-gray-700">
              Contains HIPAA-sensitive content
              <span className="block text-xs text-gray-400 mt-0.5">
                HIPAA-marked items can only be archived; deletion unlocks 7 days after archiving.
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving || uploading} className="px-5 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: saving ? '#7EC8FF' : '#1E88FF' }}>
            {saving ? 'Saving…' : `Save ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}{req && <span className="text-red-400"> *</span>}</label>
      {children}
    </div>
  );
}
