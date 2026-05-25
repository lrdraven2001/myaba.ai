import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faFileAlt, faUpload, faUsers, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../lib/api';
import {
  FAKE_TEMPLATES,
  FAKE_CLIENT_FILES,
} from '../../lib/fakeData';
import type { AttachedFile, FakeClientFile } from '../../lib/fakeData';
import type { Client, Template } from '../../types';

/** Minimal shape used inside this modal */
interface SidebarClientEntry {
  id: string;
  preferredName: string;
  initials: string;
}

interface Props {
  onClose: () => void;
  onAttach: (files: AttachedFile[]) => void;
  alreadyAttached: string[];
}

type Tab = 'templates' | 'client_files' | 'upload';

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  bip:               { bg: '#dbeafe', text: '#1d4ed8' },
  fba:               { bg: '#ede9fe', text: '#6d28d9' },
  progress_note:     { bg: '#dcfce7', text: '#166534' },
  skill_acquisition: { bg: '#ffedd5', text: '#9a3412' },
  parent_training:   { bg: '#fce7f3', text: '#9d174d' },
  intake:            { bg: '#f0fdf4', text: '#15803d' },
  assessment:        { bg: '#fef9c3', text: '#854d0e' },
  other:             { bg: '#f3f4f6', text: '#6b7280' },
};

/** Normalize a Template (from API) into the minimal shape used for display. */
interface DisplayTemplate {
  id: string;
  title: string;
  category: string;
}

export default function FileAttachModal({ onClose, onAttach, alreadyAttached }: Props) {
  const [activeTab, setActiveTab]     = useState<Tab>('templates');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(alreadyAttached));
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [templates, setTemplates]     = useState<DisplayTemplate[]>([]);
  const [clients, setClients]         = useState<SidebarClientEntry[]>([]);

  // Load templates from API (fall back to fake data if backend is down)
  useEffect(() => {
    api.getTemplates()
      .then((data: Template[]) =>
        setTemplates(data.map((t) => ({ id: t.id, title: t.title, category: t.category })))
      )
      .catch(() =>
        setTemplates(FAKE_TEMPLATES.map((t) => ({ id: t.id, title: t.title, category: t.category })))
      );
  }, []);

  // Load clients when client files tab is active
  useEffect(() => {
    if (activeTab !== 'client_files' || clients.length > 0) return;
    api.getClients()
      .then((data: Client[]) => {
        const mapped = data.map((c) => ({
          id: c.id,
          preferredName: c.preferredName,
          initials: c.preferredName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2),
        }));
        setClients(mapped);
        setExpandedClients(new Set(mapped.map((c) => c.id)));
      })
      .catch(() => {});
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleClientExpand = (clientId: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const handleAttach = () => {
    const files: AttachedFile[] = [];
    templates.forEach((t) => {
      if (selectedIds.has(t.id)) files.push({ id: t.id, name: t.title, source: 'template' });
    });
    FAKE_CLIENT_FILES.forEach((f) => {
      if (selectedIds.has(f.id))
        files.push({ id: f.id, name: f.title, source: 'client_file', clientId: f.clientId });
    });
    onAttach(files);
  };

  const selectedCount = selectedIds.size;

  const tabs: { id: Tab; label: string; icon: typeof faFileAlt }[] = [
    { id: 'templates',    label: 'Templates',    icon: faFolderOpen },
    { id: 'client_files', label: 'Client Files', icon: faUsers },
    { id: 'upload',       label: 'Upload New',   icon: faUpload },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Attach Files</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-2">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab(id)}
            >
              <FontAwesomeIcon icon={icon} />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">

          {/* ── Templates ─────────────────────────────────────────── */}
          {activeTab === 'templates' && (
            <div className="space-y-1">
              {templates.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">Loading templates…</p>
              ) : (
                templates.map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    checked={selectedIds.has(t.id)}
                    onToggle={() => toggle(t.id)}
                  />
                ))
              )}
            </div>
          )}

          {/* ── Client Files ───────────────────────────────────────── */}
          {activeTab === 'client_files' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1 mb-2">
                Files from multiple clients will be referenced in context — ACLX governs the output.
              </p>
              {clients.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">Loading clients…</p>
              ) : (
                clients.map((client) => {
                  const files = FAKE_CLIENT_FILES.filter((f) => f.clientId === client.id);
                  const isExpanded = expandedClients.has(client.id);
                  const selectedInClient = files.filter((f) => selectedIds.has(f.id)).length;
                  return (
                    <div key={client.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm"
                        onClick={() => toggleClientExpand(client.id)}
                      >
                        <span className="flex items-center gap-2 font-medium text-gray-700">
                          <span
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                            style={{ background: '#2a5f6f' }}
                          >
                            {client.initials}
                          </span>
                          {client.preferredName}
                          <span className="text-xs text-gray-400 font-normal">
                            {files.length} file{files.length !== 1 ? 's' : ''}
                          </span>
                          {selectedInClient > 0 && (
                            <span className="text-xs font-semibold text-teal-600">
                              {selectedInClient} selected
                            </span>
                          )}
                        </span>
                        <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      {isExpanded && files.length > 0 && (
                        <div className="divide-y divide-gray-100">
                          {files.map((f) => (
                            <ClientFileRow
                              key={f.id}
                              file={f}
                              checked={selectedIds.has(f.id)}
                              onToggle={() => toggle(f.id)}
                            />
                          ))}
                        </div>
                      )}
                      {isExpanded && files.length === 0 && (
                        <p className="text-xs text-gray-400 italic px-4 py-3">No documents uploaded yet.</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Upload ─────────────────────────────────────────────── */}
          {activeTab === 'upload' && (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-300 rounded-xl text-sm">
              <FontAwesomeIcon icon={faUpload} className="text-4xl text-gray-300 mb-3" />
              <p className="font-semibold text-gray-600">Drag files here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT — max 20 MB each</p>
              <button
                className="mt-4 px-5 py-2 text-white text-sm font-medium rounded-lg opacity-50 cursor-not-allowed"
                style={{ background: '#2a5f6f' }}
                disabled
                title="DLP scanning not yet configured"
              >
                Browse Files
              </button>
              <p className="text-xs text-gray-400 mt-4 max-w-xs text-center">
                Uploaded files will pass through Google DLP scanning before being added to context.
                DLP is currently not configured — uploads are disabled.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            {selectedCount > 0
              ? `${selectedCount} file${selectedCount !== 1 ? 's' : ''} selected`
              : 'No files selected'}
          </span>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{
                background: '#2a5f6f',
                opacity: selectedCount === 0 ? 0.4 : 1,
                cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
              }}
              onClick={handleAttach}
              disabled={selectedCount === 0}
            >
              Attach{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  checked,
  onToggle,
}: {
  template: DisplayTemplate;
  checked: boolean;
  onToggle: () => void;
}) {
  const colors = CATEGORY_COLORS[template.category] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 rounded"
        style={{ accentColor: '#2a5f6f' }}
      />
      <FontAwesomeIcon icon={faFileAlt} className="text-gray-400 text-sm flex-shrink-0" />
      <span className="flex-1 text-sm text-gray-700">{template.title}</span>
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
        style={{ background: colors.bg, color: colors.text }}
      >
        {template.category.replace(/_/g, ' ')}
      </span>
    </label>
  );
}

function ClientFileRow({
  file,
  checked,
  onToggle,
}: {
  file: FakeClientFile;
  checked: boolean;
  onToggle: () => void;
}) {
  const colors = CATEGORY_COLORS[file.category] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 rounded"
        style={{ accentColor: '#2a5f6f' }}
      />
      <FontAwesomeIcon icon={faFileAlt} className="text-gray-400 text-sm flex-shrink-0" />
      <span className="flex-1 text-sm text-gray-700">{file.title}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">{file.uploadedAt}</span>
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
        style={{ background: colors.bg, color: colors.text }}
      >
        {file.category.replace(/_/g, ' ')}
      </span>
    </label>
  );
}
