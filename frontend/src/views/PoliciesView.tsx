import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faSpinner, faTimes, faCloudUploadAlt,
} from '@fortawesome/free-solid-svg-icons';
import { faGoogle, faMicrosoft } from '@fortawesome/free-brands-svg-icons';
import { api } from '../lib/api';
import type { DriveConnection, PolicyDocument, PolicyCategory } from '../types';
import { useAuth } from '../contexts/AuthContext';
import DriveConnectWizard from '../components/drive/DriveConnectWizard';

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  policy_manual: 'Policy Manual',
  sop:           'SOP',
  handbook:      'Handbook',
  clinical_sop:  'Clinical SOP',
  template:      'Template',
};

const CATEGORY_COLORS: Record<PolicyCategory, { bg: string; text: string }> = {
  policy_manual: { bg: '#f3f4f6', text: '#374151' },
  sop:           { bg: '#fdf4e7', text: '#92400e' },
  handbook:      { bg: '#f0fdf4', text: '#166534' },
  clinical_sop:  { bg: '#e8f4f8', text: '#1e4d5c' },
  template:      { bg: '#EEF4FF', text: '#1E88FF' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as PolicyCategory[];

// ── Main view ──────────────────────────────────────────────────────────────────

export default function PoliciesView({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ORG_SUPER_ADMIN' || currentUser?.role === 'CLINICAL_DIRECTOR';

  const [policies, setPolicies]       = useState<PolicyDocument[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterCat, setFilterCat]     = useState<PolicyCategory | 'all'>('all');
  const [search, setSearch]           = useState('');

  // Drive connections
  const [driveConnections, setDriveConnections] = useState<DriveConnection[]>([]);

  // Modals
  const [editTarget, setEditTarget]   = useState<PolicyDocument | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [showDrive, setShowDrive]     = useState<'google' | 'microsoft' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PolicyDocument | null>(null);
  const [deleting, setDeleting]       = useState(false);

  const load = () => {
    setLoading(true);
    api.getPolicies()
      .then(setPolicies)
      .catch(() => setPolicies([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.getDriveConnections()
      .then(setDriveConnections)
      .catch(() => setDriveConnections([]));
  }, []);

  const filtered = policies.filter((p) => {
    const matchCat = filterCat === 'all' || p.category === filterCat;
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deletePolicy(deleteTarget.id);
      setPolicies((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch { /* ignore */ } finally { setDeleting(false); }
  };

  const handleToggleActive = async (policy: PolicyDocument) => {
    try {
      await api.updatePolicy(policy.id, { isActive: !policy.isActive });
      setPolicies((prev) =>
        prev.map((p) => p.id === policy.id ? { ...p, isActive: !p.isActive } : p)
      );
    } catch { /* ignore */ }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1" />

        {/* Drive connection buttons */}
        <button
          onClick={() => setShowDrive('google')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FontAwesomeIcon icon={faGoogle} className="text-red-500" />
          Google Drive
        </button>
        <button
          onClick={() => setShowDrive('microsoft')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FontAwesomeIcon icon={faMicrosoft} className="text-blue-600" />
          OneDrive
        </button>

        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: '#2a5f6f' }}
          >
            <FontAwesomeIcon icon={faPlus} />
            Add Resource
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-8 py-3 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search resources…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 w-56"
        />
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip label="All" active={filterCat === 'all'} onClick={() => setFilterCat('all')} />
          {ALL_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              label={CATEGORY_LABELS[cat]}
              active={filterCat === cat}
              onClick={() => setFilterCat(cat)}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

          {/* Connected Sources — compact link list */}
          {driveConnections.length > 0 && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                Connected:
              </span>
              {driveConnections.map((conn) => (
                <a
                  key={conn.id}
                  href={conn.driveItemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium hover:bg-gray-50 transition-colors"
                  style={{ borderColor: '#d1d5db', color: '#374151' }}
                >
                  <FontAwesomeIcon
                    icon={conn.driveSource === 'google' ? faGoogle : faMicrosoft}
                    style={{ color: conn.driveSource === 'google' ? '#ea4335' : '#0078d4', fontSize: 10 }}
                  />
                  {conn.driveItemName}
                </a>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <FontAwesomeIcon icon={faCloudUploadAlt} className="text-5xl mb-4 text-gray-300" />
              <p className="text-base font-medium">No resources found</p>
              <p className="text-sm mt-1">
                {isAdmin ? 'Click "Add Resource" to create your first resource document.' : 'No resources have been published yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((policy) => (
                <PolicyCard
                  key={policy.id}
                  policy={policy}
                  isAdmin={isAdmin}
                  onEdit={() => setEditTarget(policy)}
                  onDelete={() => setDeleteTarget(policy)}
                  onToggleActive={() => handleToggleActive(policy)}
                />
              ))}
            </div>
          )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {(showCreate || editTarget) && (
        <PolicyFormModal
          policy={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null); }}
          onSaved={(p) => {
            if (editTarget) {
              setPolicies((prev) => prev.map((x) => x.id === p.id ? p : x));
            } else {
              setPolicies((prev) => [p, ...prev]);
            }
            setShowCreate(false);
            setEditTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Resource"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          dangerous
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showDrive && (
        <DriveConnectWizard
          provider={showDrive}
          onClose={() => setShowDrive(null)}
          onLinked={(c) => {
            setDriveConnections((prev) => [c, ...prev]);
            setShowDrive(null);
          }}
        />
      )}
    </div>
  );
}

// ── Policy card ───────────────────────────────────────────────────────────────

function PolicyCard({
  policy, isAdmin, onEdit, onDelete, onToggleActive,
}: {
  policy: PolicyDocument;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = CATEGORY_COLORS[policy.category] ?? { bg: '#f3f4f6', text: '#374151' };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden transition-opacity ${policy.isActive ? '' : 'opacity-60'}`}>
      <div className="p-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{policy.title}</h3>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
              style={{ background: colors.bg, color: colors.text }}
            >
              {CATEGORY_LABELS[policy.category]}
            </span>
            {!policy.isActive && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400 shrink-0">
                Draft
              </span>
            )}
          </div>
          {policy.textContent && (
            <p className="text-sm text-gray-500 mt-1">
              {expanded
                ? policy.textContent
                : policy.textContent.slice(0, 160) + (policy.textContent.length > 160 ? '…' : '')}
            </p>
          )}
          {policy.textContent && policy.textContent.length > 160 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-teal-600 mt-1 hover:underline"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Updated {new Date(policy.updatedAt).toLocaleDateString()}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleActive}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={
                policy.isActive
                  ? { borderColor: '#d1d5db', color: '#6b7280' }
                  : { borderColor: '#2a5f6f', color: '#2a5f6f', background: '#e8f4f8' }
              }
              title={policy.isActive ? 'Unpublish' : 'Publish'}
            >
              {policy.isActive ? 'Published' : 'Publish'}
            </button>
            <button
              onClick={onEdit}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
              title="Edit"
            >
              <FontAwesomeIcon icon={faEdit} className="text-sm" />
            </button>
            <button
              onClick={onDelete}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400"
              title="Delete"
            >
              <FontAwesomeIcon icon={faTrash} className="text-sm" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Policy form modal (create / edit) ─────────────────────────────────────────

function PolicyFormModal({
  policy, onClose, onSaved,
}: {
  policy: PolicyDocument | null;
  onClose: () => void;
  onSaved: (p: PolicyDocument) => void;
}) {
  const [title, setTitle]           = useState(policy?.title ?? '');
  const [category, setCategory]     = useState<PolicyCategory>(policy?.category ?? 'policy_manual');
  const [textContent, setTextContent] = useState(policy?.textContent ?? '');
  const [isActive, setIsActive]     = useState(policy?.isActive ?? true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setTextContent(ev.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      if (policy) {
        await api.updatePolicy(policy.id, { title, category, textContent, isActive });
        onSaved({ ...policy, title, category, textContent, isActive, updatedAt: new Date().toISOString() });
      } else {
        const { policyId } = await api.createPolicy({ title, category, textContent, isActive });
        onSaved({
          id: policyId, title, category, textContent, isActive,
          orgId: '', createdBy: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{policy ? 'Edit Resource' : 'Add Resource'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="space-y-4">
          <FieldInput label="Title" value={title} onChange={setTitle} placeholder="e.g. HIPAA Privacy Policy" />

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Category</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              value={category}
              onChange={(e) => setCategory(e.target.value as PolicyCategory)}
            >
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Content
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-teal-600 hover:underline flex items-center gap-1"
              >
                <FontAwesomeIcon icon={faCloudUploadAlt} /> Upload .txt / .md
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".txt,.md,.text" className="hidden" onChange={handleFileRead} />
            <textarea
              rows={8}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 font-mono"
              placeholder="Paste or type document text here…"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-teal-700" />
            <span className="text-sm text-gray-700">Published (visible to all staff)</span>
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium"
            style={{ background: '#2a5f6f' }}
          >
            {saving ? 'Saving…' : policy ? 'Save Changes' : 'Create Resource'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
      style={
        active
          ? { background: '#2a5f6f', color: 'white', borderColor: '#2a5f6f' }
          : { background: 'white', color: '#6b7280', borderColor: '#d1d5db' }
      }
    >
      {label}
    </button>
  );
}

function FieldInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
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

function ConfirmModal({
  title, message, confirmLabel, dangerous, loading, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel: string; dangerous?: boolean;
  loading: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium"
            style={{ background: dangerous ? '#dc2626' : '#2a5f6f' }}
          >
            {loading ? 'Removing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
