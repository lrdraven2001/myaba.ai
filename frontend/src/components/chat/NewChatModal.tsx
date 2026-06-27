import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faFileAlt, faChevronDown, faChevronUp, faFolderOpen, faSpinner } from '@fortawesome/free-solid-svg-icons';
import type { SidebarClient } from './ChatSidebar';
import type { PolicyDocument, Project } from '../../types';
import { api } from '../../lib/api';

type Scope = 'general' | 'client' | 'project';

export interface NewChatData {
  title: string;
  clientId?: string;
  projectId?: string;
  projectLabel?: string;
  policyIds?: string[];
}

interface Props {
  clients: SidebarClient[];
  onClose: () => void;
  onCreate: (data: NewChatData) => Promise<void> | void;
  /** Pre-select a project when opening from ProjectsView */
  initialProjectId?: string;
  /** Pre-select a client when opening from ClientsView */
  initialClientId?: string;
  /** When true, locks scope to 'general' and hides client/project tabs (non-clinical users) */
  generalChatOnly?: boolean;
}

function autoTitle(scope: Scope, clientName?: string, projectTitle?: string): string {
  const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (scope === 'client' && clientName) return `${clientName} — ${date}`;
  if (scope === 'project' && projectTitle) return `${projectTitle} — ${date}`;
  return `Chat — ${date}`;
}

export default function NewChatModal({ clients, onClose, onCreate, initialProjectId, initialClientId, generalChatOnly }: Props) {
  const [scope, setScope]                         = useState<Scope>(
    generalChatOnly ? 'general' : initialProjectId ? 'project' : initialClientId ? 'client' : 'general'
  );
  const [title, setTitle]                         = useState('');
  const [selectedClientId, setSelectedClientId]   = useState(initialClientId ?? clients[0]?.id ?? '');
  const [creating, setCreating]                   = useState(false);

  // Project picker
  const [projects, setProjects]                   = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects]     = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? '');

  // Policy picker
  const [policies, setPolicies]                   = useState<PolicyDocument[]>([]);
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [showPolicies, setShowPolicies]           = useState(false);
  const [loadingPolicies, setLoadingPolicies]     = useState(false);

  // Load projects when project scope is active
  useEffect(() => {
    if (scope !== 'project' || projects.length > 0) return;
    setLoadingProjects(true);
    api.getProjects()
      .then((list) => {
        setProjects(list);
        if (!selectedProjectId && list.length > 0) setSelectedProjectId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load policies when policy section is expanded
  useEffect(() => {
    if (!showPolicies || policies.length > 0) return;
    setLoadingPolicies(true);
    api.getPolicies()
      .then(setPolicies)
      .catch(() => {})
      .finally(() => setLoadingPolicies(false));
  }, [showPolicies, policies.length]);

  const togglePolicy = (id: string) =>
    setSelectedPolicyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const client = clients.find((c) => c.id === selectedClientId);
      const resolvedTitle =
        title.trim() ||
        autoTitle(scope, client?.preferredName, selectedProject?.title);

      await onCreate({
        title:        resolvedTitle,
        clientId:     scope === 'client'  ? selectedClientId                    : undefined,
        projectId:    scope === 'project' ? selectedProjectId || undefined       : undefined,
        projectLabel: scope === 'project' ? (selectedProject?.title ?? 'Project') : undefined,
        policyIds:    selectedPolicyIds.length > 0 ? selectedPolicyIds : undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">New Chat</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Scope tabs — hidden for general-chat-only users */}
        {!generalChatOnly && (
          <div className="flex gap-1.5 mb-5 bg-gray-100 p-1 rounded-xl">
            {(['general', 'client', 'project'] as Scope[]).map((s) => (
              <button
                key={s}
                className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors"
                style={
                  scope === s
                    ? { background: '#2a5f6f', color: 'white' }
                    : { background: 'transparent', color: '#6b7280' }
                }
                onClick={() => setScope(s)}
              >
                {s === 'general' ? '💬 General' : s === 'client' ? '👤 Client' : '📁 Project'}
              </button>
            ))}
          </div>
        )}

        {/* Client selector */}
        {scope === 'client' && (
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Client
            </label>
            {clients.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No clients available</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {clients.map((c) => (
                  <button
                    key={c.id}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      selectedClientId === c.id ? 'border-transparent' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                    style={selectedClientId === c.id ? { background: '#e8f4f8', borderColor: '#5fb3d0', color: '#1e4d5c' } : {}}
                    onClick={() => setSelectedClientId(c.id)}
                  >
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold mr-2"
                      style={{ background: '#2a5f6f' }}
                    >
                      {c.initials}
                    </span>
                    {c.preferredName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Project selector */}
        {scope === 'project' && (
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Project
            </label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                Loading projects…
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No projects yet — create one in the Projects tab.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      selectedProjectId === p.id ? 'border-transparent' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                    style={selectedProjectId === p.id ? { background: '#f0eaff', borderColor: '#a78bfa', color: '#4c1d95' } : {}}
                    onClick={() => setSelectedProjectId(p.id)}
                  >
                    <FontAwesomeIcon icon={faFolderOpen} className="mr-2 text-purple-400" />
                    {p.title}
                    {p.description && (
                      <span className="text-xs text-gray-400 ml-2 font-normal">{p.description.slice(0, 40)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Title (optional for all scopes) */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Title <span className="normal-case font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
            placeholder={`e.g. ${autoTitle(scope, clients.find((c) => c.id === selectedClientId)?.preferredName, selectedProject?.title)}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
          />
          <p className="text-xs text-gray-400 mt-1">Leave blank to auto-name by date.</p>
        </div>

        {/* Policy attachment (collapsible) */}
        <div className="mb-6">
          <button
            className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-full text-left"
            onClick={() => setShowPolicies((v) => !v)}
          >
            <FontAwesomeIcon icon={faFileAlt} className="text-gray-400" />
            Attach Policies
            {selectedPolicyIds.length > 0 && (
              <span
                className="ml-1 px-1.5 py-0.5 rounded text-white text-xs font-bold"
                style={{ background: '#2a5f6f' }}
              >
                {selectedPolicyIds.length}
              </span>
            )}
            <FontAwesomeIcon icon={showPolicies ? faChevronUp : faChevronDown} className="ml-auto text-gray-400" />
          </button>

          {showPolicies && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
              {loadingPolicies ? (
                <p className="text-xs text-gray-400 px-3 py-3">Loading policies…</p>
              ) : policies.filter((p) => p.isActive).length === 0 ? (
                <p className="text-xs text-gray-400 italic px-3 py-3">No active policies</p>
              ) : (
                <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {policies.filter((p) => p.isActive).map((p) => {
                    const checked = selectedPolicyIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={checked} onChange={() => togglePolicy(p.id)} className="mt-0.5 accent-teal-700" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                          <p className="text-xs text-gray-400 capitalize">{p.category.replace('_', ' ')}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedPolicyIds.length > 0 && (
                <div className="px-3 py-2 bg-blue-50 border-t border-blue-100">
                  <p className="text-xs text-blue-700">
                    {selectedPolicyIds.length} polic{selectedPolicyIds.length === 1 ? 'y' : 'ies'} will be injected as AI context.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: creating ? '#9ca3af' : '#2a5f6f' }}
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Start Chat'}
          </button>
        </div>
      </div>
    </div>
  );
}
