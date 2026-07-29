import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faSpinner, faTimes, faCloudUploadAlt,
  faFileAlt, faEye,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { Template, TemplateCategory, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  bip:               'BIP',
  fba:               'FBA',
  progress_note:     'Progress Note',
  schedule:          'Schedule',
  skill_acquisition: 'Skill Acquisition',
  parent_training:   'Parent Training',
  other:             'Other',
};

const CATEGORY_COLORS: Record<TemplateCategory, { bg: string; text: string }> = {
  bip:               { bg: '#e8f4f8', text: '#1e4d5c' },
  fba:               { bg: '#fdf4e7', text: '#92400e' },
  progress_note:     { bg: '#f0fdf4', text: '#166534' },
  schedule:          { bg: '#eff6ff', text: '#1e40af' },
  skill_acquisition: { bg: '#faf5ff', text: '#6b21a8' },
  parent_training:   { bg: '#fff1f2', text: '#9f1239' },
  other:             { bg: '#f3f4f6', text: '#374151' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as TemplateCategory[];

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: 'ORG_SUPER_ADMIN',   label: 'Practice Administrator' },
  { value: 'CLINICAL_DIRECTOR', label: 'Clinical Director'      },
  { value: 'SUPERVISING_BCBA',  label: 'Supervising BCBA'       },
  { value: 'RBT',               label: 'RBT'                    },
  { value: 'GENERAL_STAFF',     label: 'General Staff'          },
];

// ── Main view ──────────────────────────────────────────────────────────────────

export default function TemplatesView({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ORG_SUPER_ADMIN' || currentUser?.role === 'CLINICAL_DIRECTOR';

  const [templates, setTemplates]   = useState<Template[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterCat, setFilterCat]   = useState<TemplateCategory | 'all'>('all');
  const [search, setSearch]         = useState('');

  const [editTarget, setEditTarget]     = useState<Template | null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [previewTarget, setPreviewTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const load = () => {
    setLoading(true);
    api.getTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = templates.filter((t) => {
    const matchCat    = filterCat === 'all' || t.category === filterCat;
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteTemplate(deleteTarget.id);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch { /* ignore */ } finally { setDeleting(false); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center gap-4 flex-wrap">
        {!embedded && <h1 className="text-lg font-semibold text-gray-900">Templates</h1>}

        <div className="flex-1" />

        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: '#2a5f6f' }}
          >
            <FontAwesomeIcon icon={faPlus} />
            New Template
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-8 py-3 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search templates…"
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
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-2xl" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <FontAwesomeIcon icon={faFileAlt} className="text-5xl mb-4 text-gray-300" />
              <p className="text-base font-medium">No templates found</p>
              <p className="text-sm mt-1">
                {isAdmin
                  ? 'Click "New Template" to create your first template.'
                  : 'No templates have been published yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isAdmin={isAdmin}
                  onEdit={() => setEditTarget(template)}
                  onDelete={() => setDeleteTarget(template)}
                  onPreview={() => setPreviewTarget(template)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {(showCreate || editTarget) && (
        <TemplateFormModal
          template={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null); }}
          onSaved={(t) => {
            if (editTarget) {
              setTemplates((prev) => prev.map((x) => x.id === t.id ? t : x));
            } else {
              setTemplates((prev) => [t, ...prev]);
            }
            setShowCreate(false);
            setEditTarget(null);
          }}
        />
      )}

      {previewTarget && (
        <PreviewModal template={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Template"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          dangerous
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template, isAdmin, onEdit, onDelete, onPreview,
}: {
  template: Template;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const colors = CATEGORY_COLORS[template.category] ?? { bg: '#f3f4f6', text: '#374151' };
  const visibilityLabel = template.visibleToRoles.length === 0
    ? 'All roles'
    : template.visibleToRoles.length === 1
    ? template.visibleToRoles[0].replace(/_/g, ' ')
    : `${template.visibleToRoles.length} roles`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{template.title}</h3>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
              style={{ background: colors.bg, color: colors.text }}
            >
              {CATEGORY_LABELS[template.category]}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 shrink-0">
              {visibilityLabel}
            </span>
          </div>
          {template.content && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {template.content.slice(0, 200)}{template.content.length > 200 ? '…' : ''}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Updated {new Date(template.updatedAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onPreview}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
            title="Preview"
          >
            <FontAwesomeIcon icon={faEye} className="text-sm" />
          </button>
          {isAdmin && (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Template form modal (create / edit) ───────────────────────────────────────

function TemplateFormModal({
  template, onClose, onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: (t: Template) => void;
}) {
  const [title, setTitle]       = useState(template?.title ?? '');
  const [category, setCategory] = useState<TemplateCategory>(template?.category ?? 'progress_note');
  const [content, setContent]   = useState(template?.content ?? '');
  const [visibleToRoles, setVisibleToRoles] = useState<Set<UserRole>>(
    new Set(template?.visibleToRoles ?? []),
  );
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleRole = (role: UserRole) => {
    setVisibleToRoles((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  };

  const [reading, setReading] = useState(false);

  // Word/PDF/Excel go through the backend extractor; plain text reads locally.
  const handleFileRead = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setError('');
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    if (/\.(txt|md|text)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = (ev) => setContent(ev.target?.result as string ?? '');
      reader.readAsText(file);
      return;
    }
    setReading(true);
    try {
      const { text } = await api.extractAttachment(file);
      if (!text.trim()) { setError(`No readable text found in “${file.name}”.`); return; }
      setContent(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file.');
    } finally {
      setReading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    const visibleToRolesArr = Array.from(visibleToRoles) as UserRole[];
    try {
      if (template) {
        await api.updateTemplate(template.id, { title, category, content, visibleToRoles: visibleToRolesArr });
        onSaved({ ...template, title, category, content, visibleToRoles: visibleToRolesArr, updatedAt: new Date().toISOString() });
      } else {
        const { templateId } = await api.createTemplate({ title, category, content, visibleToRoles: visibleToRolesArr });
        onSaved({
          id: templateId, title, category, content, visibleToRoles: visibleToRolesArr,
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
          <h2 className="text-lg font-semibold text-gray-900">
            {template ? 'Edit Template' : 'New Template'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Progress Note — Skill Acquisition"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Category</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
            >
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Visible to roles */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Visible to roles{' '}
              <span className="text-gray-400 font-normal normal-case">(leave all unchecked = all roles)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {ALL_ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-teal-700"
                    checked={visibleToRoles.has(r.value)}
                    onChange={() => toggleRole(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Template Content
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={reading}
                className="text-xs text-teal-600 hover:underline flex items-center gap-1 disabled:opacity-60"
              >
                <FontAwesomeIcon icon={reading ? faSpinner : faCloudUploadAlt} className={reading ? 'animate-spin' : ''} />
                {reading ? 'Reading file…' : 'Upload file'}
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".txt,.md,.text,.docx,.pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleFileRead} />
            <textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 font-mono"
              placeholder="Paste or type template content here…"
            />
          </div>

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
            {saving ? 'Saving…' : template ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const colors = CATEGORY_COLORS[template.category] ?? { bg: '#f3f4f6', text: '#374151' };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{template.title}</h2>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
              style={{ background: colors.bg, color: colors.text }}
            >
              {CATEGORY_LABELS[template.category]}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-4 shrink-0">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
            {template.content || <span className="text-gray-400 italic">No content</span>}
          </pre>
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
