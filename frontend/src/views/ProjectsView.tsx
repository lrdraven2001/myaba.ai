import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faFolderOpen, faSpinner, faTimes, faTrash,
  faLightbulb, faCommentDots, faFileAlt, faPencilAlt,
  faCheck, faShieldAlt, faUsers, faChevronDown, faChevronRight,
  faArrowLeft, faExclamationTriangle, faUpload, faBookOpen,
} from '@fortawesome/free-solid-svg-icons';
import { faGoogleDrive } from '@fortawesome/free-brands-svg-icons';
import { api } from '../lib/api';
import { importDriveFile, isPickerConfigured } from '../lib/googlePicker';
import { useAuth } from '../contexts/AuthContext';
import { isAdminRole } from '../types';
import type { Project, ProjectKnowledgeDoc, Chat } from '../types';

// Roles that cannot access PHI projects
const NON_CLINICAL_ROLES = new Set(['GENERAL_STAFF']);

function canAccessPhiProject(role: string): boolean {
  return !NON_CLINICAL_ROLES.has(role);
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });
}

interface Props {
  onNavigateToChat: (chatId: string) => void;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ProjectsView({ onNavigateToChat }: Props) {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showTrash, setShowTrash]   = useState(false);
  const isSuperAdmin = currentUser?.role === 'ORG_SUPER_ADMIN';

  useEffect(() => {
    api.getProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (p: Project) => {
    setProjects((prev) => [p, ...prev]);
    setSelected(p);
    setView('detail');
    setShowCreate(false);
  };

  const handleUpdated = (p: Project) => {
    setProjects((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    setSelected(p);
  };

  const handleDeleted = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
    setView('list');
  };

  const openProject = (p: Project) => {
    setSelected(p);
    setView('detail');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {view === 'list' && (
        <ProjectListView
          projects={projects}
          loading={loading}
          onOpen={openProject}
          onNew={() => setShowCreate(true)}
          isSuperAdmin={isSuperAdmin}
          onShowTrash={() => setShowTrash(true)}
        />
      )}
      {view === 'detail' && selected && (
        <ProjectDetailView
          key={selected.id}
          project={selected}
          orgId={currentUser?.orgId ?? ''}
          currentUserId={currentUser?.uid ?? ''}
          currentUserRole={currentUser?.role ?? ''}
          onBack={() => setView('list')}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onNavigateToChat={onNavigateToChat}
        />
      )}
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {showTrash && (
        <TrashModal
          onClose={() => setShowTrash(false)}
          onRestored={(p) => setProjects((prev) => [p, ...prev.filter((x) => x.id !== p.id)])}
        />
      )}
    </div>
  );
}

// ── Project list (card grid) ──────────────────────────────────────────────────

function ProjectListView({
  projects, loading, onOpen, onNew, isSuperAdmin, onShowTrash,
}: {
  projects: Project[];
  loading: boolean;
  onOpen: (p: Project) => void;
  onNew: () => void;
  isSuperAdmin?: boolean;
  onShowTrash?: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Projects</h2>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button
                onClick={onShowTrash}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors"
                style={{ borderColor: '#e5e7eb', color: '#6b7280', background: 'white' }}
                title="Recently deleted projects (restorable for 48 hours)"
              >
                <FontAwesomeIcon icon={faTrash} style={{ fontSize: 11 }} />
                Trash
              </button>
            )}
            <button
              onClick={onNew}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: '#2a5f6f' }}
            >
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
              New project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-300 text-2xl" />
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-gray-200 py-16 cursor-pointer hover:border-teal-300 transition-colors"
            onClick={onNew}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#f3e8ff' }}>
              <FontAwesomeIcon icon={faFolderOpen} style={{ fontSize: 22, color: '#7c3aed' }} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-700">Create your first project</p>
              <p className="text-sm text-gray-400 mt-1">
                Group related chats and knowledge docs together
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onClick={() => onOpen(p)} />
            ))}
            {/* New project card */}
            <button
              onClick={onNew}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 p-6 text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-colors min-h-[140px]"
            >
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 18 }} />
              <span className="text-sm font-medium">New project</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Trash modal (super admin: restore within 48h) ─────────────────────────────

function TrashModal({
  onClose, onRestored,
}: {
  onClose: () => void;
  onRestored: (p: Project) => void;
}) {
  const [trashed, setTrashed] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    api.getTrashedProjects()
      .then(setTrashed)
      .catch(() => setTrashed([]))
      .finally(() => setLoading(false));
  }, []);

  const hoursLeft = (deletedAt?: string) => {
    if (!deletedAt) return 0;
    const elapsedMs = Date.now() - new Date(deletedAt).getTime();
    return Math.max(0, Math.ceil(48 - elapsedMs / 3_600_000));
  };

  const handleRestore = async (p: Project) => {
    setRestoringId(p.id);
    try {
      await api.restoreProject(p.id);
      setTrashed((prev) => prev.filter((x) => x.id !== p.id));
      onRestored({ ...p, deletedAt: undefined, deletedBy: undefined });
    } catch {
      /* leave it in the list so the admin can retry */
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recently Deleted</h3>
            <p className="text-xs text-gray-400 mt-0.5">Projects are restorable for 48 hours after deletion.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-300 text-2xl" />
            </div>
          ) : trashed.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
              <FontAwesomeIcon icon={faTrash} className="text-3xl text-gray-200" />
              <p className="text-sm">No deleted projects in the last 48 hours.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trashed.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-150 bg-gray-50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400">
                      Deleted {relativeDate(p.deletedAt ?? '')} · {hoursLeft(p.deletedAt)}h left to restore
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(p)}
                    disabled={restoringId === p.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white shrink-0"
                    style={{ background: '#2a5f6f', opacity: restoringId === p.id ? 0.6 : 1 }}
                  >
                    <FontAwesomeIcon icon={restoringId === p.id ? faSpinner : faArrowLeft} className={restoringId === p.id ? 'animate-spin' : ''} style={{ fontSize: 11 }} />
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project: p, onClick }: { project: Project; onClick: () => void }) {
  const memberCount = Object.keys(p.members ?? {}).length + 1; // +1 for owner
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all flex flex-col gap-3 min-h-[140px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: '#f3e8ff' }}
        >
          <FontAwesomeIcon icon={faFolderOpen} style={{ fontSize: 16, color: '#7c3aed' }} />
        </div>
        {p.containsPhi && (
          <span
            className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
          >
            <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 9 }} />
            PHI
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{p.title}</p>
        {p.description && (
          <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{p.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>Updated {relativeDate(p.updatedAt)}</span>
        {memberCount > 1 && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faUsers} style={{ fontSize: 10 }} />
              {memberCount}
            </span>
          </>
        )}
        {p.isShared && (
          <>
            <span>·</span>
            <span style={{ color: '#2a5f6f', fontWeight: 600 }}>Org</span>
          </>
        )}
      </div>
    </button>
  );
}

// ── Project detail view ───────────────────────────────────────────────────────

function ProjectDetailView({
  project, orgId, currentUserId, currentUserRole,
  onBack, onUpdated, onDeleted, onNavigateToChat,
}: {
  project: Project;
  orgId: string;
  currentUserId: string;
  currentUserRole: string;
  onBack: () => void;
  onUpdated: (p: Project) => void;
  onDeleted: (id: string) => void;
  onNavigateToChat: (chatId: string) => void;
}) {
  const [editingTitle, setEditingTitle]   = useState(false);
  const [draftTitle, setDraftTitle]       = useState(project.title);
  const [instructions, setInstructions]   = useState(project.instructions ?? '');
  const [instructionsDirty, setInstructionsDirty] = useState(false);
  const [savingInstr, setSavingInstr]     = useState(false);
  const [showInstr, setShowInstr]         = useState(true);
  const [knowledgeDocs, setKnowledgeDocs] = useState<ProjectKnowledgeDoc[]>([]);
  const [loadingDocs, setLoadingDocs]     = useState(true);
  const [showAddDoc, setShowAddDoc]       = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [projectChats, setProjectChats]   = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats]   = useState(true);
  const [startingChat, setStartingChat]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAccess, setShowAccess]       = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoadingDocs(true);
    api.getProjectKnowledge(project.id)
      .then(setKnowledgeDocs)
      .catch(() => {})
      .finally(() => setLoadingDocs(false));

    setLoadingChats(true);
    api.getChats()
      .then((chats) => setProjectChats(chats.filter((c) => c.projectId === project.id)))
      .catch(() => {})
      .finally(() => setLoadingChats(false));
  }, [project.id]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  const saveTitle = async () => {
    const t = draftTitle.trim();
    if (!t || t === project.title) { setEditingTitle(false); setDraftTitle(project.title); return; }
    try {
      await api.updateProject(project.id, { title: t });
      onUpdated({ ...project, title: t });
    } catch { setDraftTitle(project.title); }
    setEditingTitle(false);
  };

  const saveInstructions = async () => {
    setSavingInstr(true);
    try {
      await api.updateProject(project.id, { instructions });
      onUpdated({ ...project, instructions });
      setInstructionsDirty(false);
    } catch { /* silent */ }
    setSavingInstr(false);
  };

  const handleStartChat = async () => {
    setStartingChat(true);
    try {
      const { chatId } = await api.createChat({
        title: `${project.title} — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        projectId: project.id,
        projectLabel: project.title,
      });
      onNavigateToChat(chatId);
    } catch { setStartingChat(false); }
  };

  const handleDeleteDoc = async (docId: string) => {
    setDeletingDocId(docId);
    try {
      await api.deleteProjectKnowledge(project.id, docId);
      setKnowledgeDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch { /* silent */ }
    setDeletingDocId(null);
  };

  const handleDeleteProject = async () => {
    try {
      await api.deleteProject(project.id);
      onDeleted(project.id);
    } catch { /* silent */ }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mr-1"
        >
          <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 12 }} />
          Projects
        </button>

        <div style={{ width: 1, height: 16, background: '#e5e7eb' }} />

        {project.containsPhi && (
          <span
            className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
          >
            <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 9 }} />
            PHI
          </span>
        )}

        {/* Editable title */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              className="text-base font-semibold text-gray-900 border-b-2 border-teal-500 bg-transparent outline-none w-full max-w-xs"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setDraftTitle(project.title); } }}
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="flex items-center gap-1.5 text-base font-semibold text-gray-900 hover:text-teal-700 transition-colors"
            >
              {project.title}
              <FontAwesomeIcon icon={faPencilAlt} className="text-gray-300 hover:text-teal-500" style={{ fontSize: 11 }} />
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAccess(true)}
            title="Share this project — give people view or edit access"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FontAwesomeIcon icon={faUsers} style={{ fontSize: 12 }} />
            Share
          </button>
          <button
            onClick={handleStartChat}
            disabled={startingChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60"
            style={{ background: '#2a5f6f' }}
          >
            {startingChat
              ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
              : <FontAwesomeIcon icon={faCommentDots} style={{ fontSize: 12 }} />}
            New Chat
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete project"
          >
            <FontAwesomeIcon icon={faTrash} style={{ fontSize: 13 }} />
          </button>
        </div>
      </div>

      {/* ── Body: chat history + sidebar ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: chat history — fills the space up to the knowledge sidebar */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="w-full">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Chats in this project
            </p>

            {loadingChats ? (
              <div className="flex items-center gap-2 text-gray-300 text-sm">
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                Loading…
              </div>
            ) : projectChats.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 py-10 rounded-xl border border-dashed border-gray-200 cursor-pointer hover:border-teal-300 transition-colors"
                onClick={handleStartChat}
              >
                <FontAwesomeIcon icon={faCommentDots} style={{ fontSize: 24, color: '#cbd5e1' }} />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">No chats yet</p>
                  <p className="text-xs text-gray-400 mt-0.5">Start a new chat to begin working in this project</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
                {projectChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => onNavigateToChat(chat.id)}
                    className="w-full text-left px-5 py-3.5 hover:bg-gray-50 transition-colors flex items-center gap-3"
                  >
                    <FontAwesomeIcon icon={faCommentDots} style={{ fontSize: 14, color: '#94a3b8' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{chat.title}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {relativeDate(chat.updatedAt ?? chat.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {projectChats.length > 0 && (
              <button
                onClick={handleStartChat}
                disabled={startingChat}
                className="mt-4 flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900 transition-colors disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
                Start new chat
              </button>
            )}
          </div>
        </div>

        {/* Right sidebar: instructions + knowledge */}
        <div
          className="flex flex-col overflow-y-auto border-l border-gray-200 bg-white"
          style={{ width: 300, flexShrink: 0 }}
        >
          {/* Instructions */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setShowInstr((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 13, color: '#f59e0b' }} />
                Instructions
              </div>
              <div className="flex items-center gap-2">
                {!instructions && <span className="text-xs text-gray-400">None set</span>}
                <FontAwesomeIcon
                  icon={showInstr ? faChevronDown : faChevronRight}
                  style={{ fontSize: 11, color: '#9ca3af' }}
                />
              </div>
            </button>
            {showInstr && (
              <div className="px-5 pb-4">
                <textarea
                  className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={5}
                  placeholder="e.g. You are assisting a BCBA team reviewing Q3 caseloads. Focus on measurable behavior targets and evidence-based strategies…"
                  value={instructions}
                  onChange={(e) => { setInstructions(e.target.value); setInstructionsDirty(true); }}
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  These instructions are injected into every model conversation in this project.
                </p>
                {instructionsDirty && (
                  <button
                    onClick={saveInstructions}
                    disabled={savingInstr}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-60"
                    style={{ background: '#2a5f6f' }}
                  >
                    {savingInstr
                      ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      : <FontAwesomeIcon icon={faCheck} />}
                    Save
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Knowledge docs */}
          <div>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <FontAwesomeIcon icon={faBookOpen} style={{ fontSize: 13, color: '#0ea5e9' }} />
                Knowledge
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {loadingDocs ? '…' : `${knowledgeDocs.length} doc${knowledgeDocs.length !== 1 ? 's' : ''}`}
                </span>
                <button
                  onClick={() => setShowAddDoc(true)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                >
                  <FontAwesomeIcon icon={faPlus} style={{ fontSize: 9 }} />
                  Add
                </button>
              </div>
            </div>
            <div className="px-3 py-2 max-h-72 overflow-y-auto">
              {loadingDocs ? (
                <div className="flex items-center gap-2 px-2 py-3 text-gray-300 text-sm">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                </div>
              ) : knowledgeDocs.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-gray-400">No documents yet</p>
                  <p className="text-xs text-gray-300 mt-0.5">Add policy excerpts or reference guides</p>
                </div>
              ) : (
                knowledgeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 group"
                  >
                    <FontAwesomeIcon icon={faFileAlt} style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0 }} />
                    <span className="flex-1 text-sm text-gray-700 truncate">{doc.title}</span>
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      disabled={deletingDocId === doc.id}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                    >
                      {deletingDocId === doc.id
                        ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" style={{ fontSize: 11 }} />
                        : <FontAwesomeIcon icon={faTimes} style={{ fontSize: 11 }} />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddDoc && (
        <AddKnowledgeDocModal
          projectId={project.id}
          onClose={() => setShowAddDoc(false)}
          onAdded={(doc) => { setKnowledgeDocs((prev) => [...prev, doc]); setShowAddDoc(false); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          title={project.title}
          onConfirm={handleDeleteProject}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {showAccess && (
        <ProjectAccessModal
          project={project}
          orgId={orgId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setShowAccess(false)}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}

// ── Access modal ──────────────────────────────────────────────────────────────

type OrgMember = { id: string; displayName: string; email: string; role: string; active: boolean };

function ProjectAccessModal({
  project, orgId, currentUserId, currentUserRole, onClose, onUpdated,
}: {
  project: Project;
  orgId: string;
  currentUserId: string;
  currentUserRole: string;
  onClose: () => void;
  onUpdated: (p: Project) => void;
}) {
  const [containsPhi, setContainsPhi] = useState(project.containsPhi ?? false);
  const [isShared, setIsShared]       = useState(project.isShared ?? false);
  const [saving, setSaving]           = useState(false);

  const [orgMembers, setOrgMembers]   = useState<OrgMember[]>([]);
  const [members, setMembers]         = useState<Record<string, string>>(project.members ?? {});
  const [addUserId, setAddUserId]     = useState('');
  const [addRole, setAddRole]         = useState<'editor' | 'viewer'>('viewer');
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId]   = useState<string | null>(null);

  const isOwner = project.ownerId === currentUserId;
  const canManage = isOwner || isAdminRole(currentUserRole as never);

  useEffect(() => {
    if (!orgId) return;
    api.getOrgMembers(orgId)
      .then(setOrgMembers)
      .catch(() => {});
  }, [orgId]);

  const saveSettings = async (phiVal: boolean, sharedVal: boolean) => {
    setSaving(true);
    try {
      await api.updateProject(project.id, { containsPhi: phiVal, isShared: sharedVal });
      onUpdated({ ...project, containsPhi: phiVal, isShared: sharedVal });
    } catch { /* silent */ }
    setSaving(false);
  };

  const handlePhiToggle = async () => {
    const next = !containsPhi;
    setContainsPhi(next);
    // If PHI is now on and org sharing is on, warn but keep — admin should decide
    await saveSettings(next, isShared);
  };

  const handleSharedToggle = async () => {
    const next = !isShared;
    setIsShared(next);
    await saveSettings(containsPhi, next);
  };

  const handleAddMember = async () => {
    if (!addUserId) return;
    const member = orgMembers.find((m) => m.id === addUserId);
    if (!member) return;
    // PHI gate: block non-clinical roles
    if (containsPhi && NON_CLINICAL_ROLES.has(member.role)) return;
    setAddingMember(true);
    try {
      await api.shareProject(project.id, addUserId, addRole);
      const next = { ...members, [addUserId]: addRole };
      setMembers(next);
      onUpdated({ ...project, members: next as Record<string, 'editor' | 'viewer'>, memberIds: Object.keys(next) });
      setAddUserId('');
    } catch { /* silent */ }
    setAddingMember(false);
  };

  const handleRemoveMember = async (userId: string) => {
    setRemovingId(userId);
    try {
      await api.removeProjectMember(project.id, userId);
      const next = { ...members };
      delete next[userId];
      setMembers(next);
      onUpdated({ ...project, members: next as Record<string, 'editor' | 'viewer'>, memberIds: Object.keys(next) });
    } catch { /* silent */ }
    setRemovingId(null);
  };

  // Change an existing member's role (view ↔ edit) without removing them.
  const handleChangeRole = async (userId: string, role: 'editor' | 'viewer') => {
    const prev = members[userId];
    if (prev === role) return;
    const next = { ...members, [userId]: role };
    setMembers(next); // optimistic
    try {
      await api.shareProject(project.id, userId, role); // PUT upserts the role
      onUpdated({ ...project, members: next as Record<string, 'editor' | 'viewer'>, memberIds: Object.keys(next) });
    } catch {
      setMembers({ ...members, [userId]: prev }); // revert
    }
  };

  // Members available to add: not already in project, not owner, role-filtered for PHI
  const availableToAdd = orgMembers.filter((m) => {
    if (m.id === project.ownerId) return false;
    if (members[m.id]) return false;
    if (!m.active) return false;
    if (containsPhi && NON_CLINICAL_ROLES.has(m.role)) return false;
    return true;
  });

  const getMemberDisplay = (uid: string) => {
    const m = orgMembers.find((x) => x.id === uid);
    return m ? (m.displayName || m.email) : uid;
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      ORG_SUPER_ADMIN: 'Practice Administrator', ORG_ADMIN: 'Practice Administrator',
      TREATING_BCBA: 'Treating BCBA', SUPERVISING_BCBA: 'Clinical Supervisor',
      BCBA_STUDENT: 'BCBA Student', RBT: 'Behavior Technician',
      GENERAL_STAFF: 'General Staff', SCHEDULING_ADMIN: 'Scheduling Admin',
      BILLING_ADMIN: 'Billing Admin',
    };
    return labels[role] ?? role;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Project Access</h2>
          {saving && <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-400 text-sm" />}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* PHI toggle */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#d97706', fontSize: 13 }} />
                Contains PHI / HIPAA Data
              </p>
              <p className="text-xs text-gray-400 mt-1">
                When on, only clinical and administrative roles may be added as members.
                {isShared && containsPhi && (
                  <span className="block mt-1 font-medium" style={{ color: '#92400e' }}>
                    Org sharing is on — non-clinical members will be filtered automatically.
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={canManage ? handlePhiToggle : undefined}
              disabled={!canManage}
              className="shrink-0 text-2xl transition-colors disabled:opacity-40"
              style={{ color: containsPhi ? '#d97706' : '#d1d5db' }}
            >
              {containsPhi ? '🔒' : '🔓'}
            </button>
          </div>

          <hr className="border-gray-100" />

          {/* Org sharing toggle */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Share with organization</p>
              <p className="text-xs text-gray-400 mt-1">
                {containsPhi
                  ? 'All clinical staff in your org get viewer access. Non-clinical roles are excluded.'
                  : 'All members of your org get viewer access to this project.'}
              </p>
            </div>
            <button
              onClick={canManage ? handleSharedToggle : undefined}
              disabled={!canManage}
              className="shrink-0 transition-colors text-2xl disabled:opacity-40"
              style={{ color: isShared ? '#2a5f6f' : '#d1d5db' }}
            >
              {isShared ? '✅' : '⬜'}
            </button>
          </div>

          <hr className="border-gray-100" />

          {/* Member list */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-3">Members</p>

            {/* Owner */}
            <div className="flex items-center gap-3 py-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: '#2a5f6f' }}
              >
                {getMemberDisplay(project.ownerId).slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{getMemberDisplay(project.ownerId)}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">Owner</span>
            </div>

            {/* Other members */}
            {Object.entries(members).map(([uid, role]) => (
              <div key={uid} className="flex items-center gap-3 py-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: '#6366f1' }}
                >
                  {getMemberDisplay(uid).slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{getMemberDisplay(uid)}</p>
                  {!canManage && (
                    <p className="text-xs text-gray-400">{role === 'editor' ? 'Can edit' : 'Can view'}</p>
                  )}
                </div>
                {canManage && (
                  <select
                    value={role}
                    onChange={(e) => handleChangeRole(uid, e.target.value as 'editor' | 'viewer')}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 shrink-0"
                    aria-label="Member access level"
                  >
                    <option value="viewer">Can view</option>
                    <option value="editor">Can edit</option>
                  </select>
                )}
                {canManage && (
                  <button
                    onClick={() => handleRemoveMember(uid)}
                    disabled={removingId === uid}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    {removingId === uid
                      ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" style={{ fontSize: 12 }} />
                      : <FontAwesomeIcon icon={faTimes} style={{ fontSize: 12 }} />}
                  </button>
                )}
              </div>
            ))}

            {/* Add member */}
            {canManage && availableToAdd.length > 0 && (
              <div className="mt-3 flex gap-2">
                <select
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-0"
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                >
                  <option value="">Add a member…</option>
                  {availableToAdd.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.email} ({getRoleLabel(m.role)})
                    </option>
                  ))}
                </select>
                <select
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 shrink-0"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as 'editor' | 'viewer')}
                >
                  <option value="viewer">Can view</option>
                  <option value="editor">Can edit</option>
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!addUserId || addingMember}
                  className="px-3 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 shrink-0"
                  style={{ background: '#2a5f6f' }}
                >
                  {addingMember
                    ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                    : 'Add'}
                </button>
              </div>
            )}

            {/* No one available to add — say why instead of hiding the control */}
            {canManage && availableToAdd.length === 0 && (
              <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                {orgMembers.filter((m) => m.active && m.id !== project.ownerId).length === 0
                  ? 'No other members in your organization yet — invite teammates from the Team page, then share this project with them here.'
                  : containsPhi
                    ? 'Everyone eligible already has access. (PHI is on, so non-clinical roles can’t be added.)'
                    : 'Everyone in your organization already has access.'}
              </p>
            )}

            {containsPhi && (
              <p className="mt-3 text-xs flex items-start gap-1.5" style={{ color: '#92400e' }}>
                <FontAwesomeIcon icon={faExclamationTriangle} style={{ fontSize: 10, marginTop: 2, flexShrink: 0 }} />
                PHI is active — General Staff, Scheduling Admin, and Billing Admin roles are excluded from member selection.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create project modal ──────────────────────────────────────────────────────

function CreateProjectModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [containsPhi, setContainsPhi] = useState(false);
  const [creating, setCreating]       = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      const { projectId } = await api.createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        containsPhi,
      });
      const newProject = await api.getProject(projectId);
      onCreated(newProject as unknown as Project);
    } catch { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">New project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g. Q3 Caseload Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Description
            </label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Optional — what is this project for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* PHI flag */}
          <div
            className="flex items-center justify-between gap-4 p-3 rounded-xl cursor-pointer"
            style={{ background: containsPhi ? '#fef9c3' : '#f9fafb', border: `1px solid ${containsPhi ? '#fcd34d' : '#e5e7eb'}` }}
            onClick={() => setContainsPhi((v) => !v)}
          >
            <div>
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <FontAwesomeIcon icon={faShieldAlt} style={{ color: containsPhi ? '#d97706' : '#9ca3af', fontSize: 12 }} />
                Contains PHI / HIPAA Data
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Restricts access to clinical and administrative roles only
              </p>
            </div>
            <div
              className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: containsPhi ? '#d97706' : '#d1d5db', background: containsPhi ? '#d97706' : 'white' }}
            >
              {containsPhi && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 10, color: 'white' }} />}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            className="flex-1 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: '#2a5f6f' }}
          >
            {creating ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add knowledge doc modal ───────────────────────────────────────────────────

function AddKnowledgeDocModal({
  projectId, onClose, onAdded,
}: {
  projectId: string;
  onClose: () => void;
  onAdded: (doc: ProjectKnowledgeDoc) => void;
}) {
  const [title, setTitle]     = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving]   = useState(false);
  const [reading, setReading] = useState(false);
  const [readProgress, setReadProgress] = useState('');
  const [fileError, setFileError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Import a file straight from Google Drive (Docs/Sheets export as text;
  // regular files go through the backend extractor). Hidden when the Drive
  // Picker isn't configured.
  const handleDriveImport = async () => {
    setFileError('');
    setReading(true);
    try {
      const picked = await importDriveFile();
      if (!picked) return; // user cancelled
      if (!title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
      const text = picked.text ?? (picked.file ? (await api.extractAttachment(picked.file)).text : '');
      if (!text.trim()) { setFileError(`No readable text found in “${picked.name}”.`); return; }
      setContent(text);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not import from Google Drive.');
    } finally {
      setReading(false);
    }
  };

  // Word/PDF/Excel go through the backend extractor; plain text reads locally.
  const extractFile = async (file: File): Promise<string> => {
    if (/\.(txt|md)$/i.test(file.name)) return file.text();
    const { text } = await api.extractAttachment(file);
    return text ?? '';
  };

  // One file fills the form for review; multiple files (up to 10) each become
  // their own knowledge document immediately, titled after the filename.
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file(s)
    if (files.length === 0) return;
    if (files.length > 10) { setFileError('You can add up to 10 files at a time.'); return; }
    setFileError('');

    if (files.length === 1) {
      const file = files[0];
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      setReading(true);
      try {
        const text = await extractFile(file);
        if (!text.trim()) { setFileError(`No readable text found in “${file.name}”.`); return; }
        setContent(text);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Could not read the file.');
      } finally {
        setReading(false);
      }
      return;
    }

    setReading(true);
    const failures: string[] = [];
    const added: ProjectKnowledgeDoc[] = [];
    for (let i = 0; i < files.length; i++) {
      setReadProgress(`${i + 1} of ${files.length}`);
      const file = files[i];
      const docTitle = file.name.replace(/\.[^.]+$/, '');
      try {
        const text = await extractFile(file);
        if (!text.trim()) { failures.push(`${file.name}: no readable text`); continue; }
        const { docId } = await api.addProjectKnowledge(projectId, docTitle, text.trim());
        added.push({
          id: docId, title: docTitle, textContent: text.trim(),
          createdAt: new Date().toISOString(), createdBy: '',
        });
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
    setReading(false);
    setReadProgress('');
    // onAdded closes the modal, so surface any per-file failures before delivering results.
    if (failures.length > 0) window.alert(`Some files could not be added:\n${failures.join('\n')}`);
    added.forEach(onAdded);
    if (added.length === 0 && failures.length > 0) setFileError('No documents were added.');
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      const { docId } = await api.addProjectKnowledge(projectId, title.trim(), content.trim());
      onAdded({
        id: docId,
        title: title.trim(),
        textContent: content.trim(),
        createdAt: new Date().toISOString(),
        createdBy: '',
      });
    } catch { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
     <div className="min-h-full flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Add Knowledge Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Document Title <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g. Staff Training Guide"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-500">
                Content <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                {isPickerConfigured() && (
                  <button
                    onClick={handleDriveImport}
                    disabled={reading}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-700 transition-colors disabled:opacity-60"
                  >
                    <FontAwesomeIcon icon={faGoogleDrive} style={{ fontSize: 10 }} />
                    Google Drive
                  </button>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={reading}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-700 transition-colors disabled:opacity-60"
                >
                  <FontAwesomeIcon icon={reading ? faSpinner : faUpload} className={reading ? 'animate-spin' : ''} style={{ fontSize: 10 }} />
                  {reading ? (readProgress ? `Adding ${readProgress}…` : 'Reading…') : 'Upload files'}
                </button>
              </div>
            </div>
            <input ref={fileRef} type="file" multiple accept=".txt,.md,.docx,.pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.gif" className="hidden" onChange={handleFile} />
            {fileError && <p className="text-xs text-red-500 mb-1.5">{fileError}</p>}
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              rows={10}
              placeholder="Paste or type document content here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1.5">The model will reference this document in every chat in this project.</p>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !content.trim() || saving}
            className="flex-1 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: '#2a5f6f' }}
          >
            {saving ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> : 'Add Document'}
          </button>
        </div>
      </div>
     </div>
    </div>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmDeleteModal({
  title, onConfirm, onCancel,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <FontAwesomeIcon icon={faTrash} style={{ color: '#ef4444', fontSize: 16 }} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Delete project?</h3>
            <p className="text-sm text-gray-500 mt-1">
              "<span className="font-medium">{title}</span>" and all its knowledge docs will be permanently deleted. Chats created in this project are preserved.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ background: '#ef4444' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
