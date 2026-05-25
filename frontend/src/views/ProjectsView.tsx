import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faFolderOpen,
  faSpinner,
  faTimes,
  faTrash,
  faBookOpen,
  faLightbulb,
  faCommentDots,
  faChevronDown,
  faChevronUp,
  faFileAlt,
  faPencilAlt,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { Project, ProjectKnowledgeDoc } from '../types';

interface Props {
  onNavigateToChat: (chatId: string) => void;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ProjectsView({ onNavigateToChat }: Props) {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [showCreate, setShowCreate]     = useState(false);

  const load = () => {
    setLoading(true);
    api.getProjects()
      .then((list) => {
        setProjects(list);
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const handleCreated = (p: Project) => {
    setProjects((prev) => [p, ...prev]);
    setSelectedId(p.id);
    setShowCreate(false);
  };

  const handleDeleted = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(projects.find((p) => p.id !== id)?.id ?? null);
  };

  const handleUpdated = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50">

      {/* ── Left panel: project list ─────────────────────────────────── */}
      <div
        className="flex flex-col border-r border-gray-200 bg-white overflow-hidden shrink-0"
        style={{ width: 260 }}
      >
        {/* List header */}
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Projects</span>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
            style={{ background: '#2a5f6f' }}
            title="New Project"
          >
            <FontAwesomeIcon icon={faPlus} />
            New
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-300 text-xl" />
            </div>
          ) : projects.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-200 mb-2" />
              <p className="text-xs text-gray-400">No projects yet</p>
            </div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-2.5 transition-colors"
                style={{
                  background: selectedId === p.id ? '#f0f9ff' : 'transparent',
                  borderLeft: selectedId === p.id ? '3px solid #2a5f6f' : '3px solid transparent',
                }}
              >
                <FontAwesomeIcon
                  icon={faFolderOpen}
                  className="mt-0.5 shrink-0"
                  style={{ color: selectedId === p.id ? '#2a5f6f' : '#a78bfa' }}
                />
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: selectedId === p.id ? '#1e4d5c' : '#374151' }}
                  >
                    {p.title}
                  </p>
                  {p.description && (
                    <p className="text-xs text-gray-400 truncate">{p.description}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: project detail ──────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <ProjectDetail
            key={selected.id}
            project={selected}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
            onNavigateToChat={onNavigateToChat}
          />
        ) : (
          <EmptyDetail onNew={() => setShowCreate(true)} />
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ── Project detail ────────────────────────────────────────────────────────────

function ProjectDetail({
  project,
  onUpdated,
  onDeleted,
  onNavigateToChat,
}: {
  project: Project;
  onUpdated: (p: Project) => void;
  onDeleted: (id: string) => void;
  onNavigateToChat: (chatId: string) => void;
}) {
  const [editingTitle, setEditingTitle]         = useState(false);
  const [draftTitle, setDraftTitle]             = useState(project.title);
  const [instructions, setInstructions]         = useState(project.instructions ?? '');
  const [instructionsDirty, setInstructionsDirty] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [showKnowledge, setShowKnowledge]       = useState(true);
  const [knowledgeDocs, setKnowledgeDocs]       = useState<ProjectKnowledgeDoc[]>([]);
  const [loadingDocs, setLoadingDocs]           = useState(true);
  const [showAddDoc, setShowAddDoc]             = useState(false);
  const [deletingDocId, setDeletingDocId]       = useState<string | null>(null);
  const [startingChat, setStartingChat]         = useState(false);
  const [confirmDelete, setConfirmDelete]       = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Load knowledge docs
  useEffect(() => {
    setLoadingDocs(true);
    api.getProjectKnowledge(project.id)
      .then(setKnowledgeDocs)
      .catch(() => setKnowledgeDocs([]))
      .finally(() => setLoadingDocs(false));
  }, [project.id]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
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
    setSavingInstructions(true);
    try {
      await api.updateProject(project.id, { instructions });
      onUpdated({ ...project, instructions });
      setInstructionsDirty(false);
    } catch { /* silent */ }
    setSavingInstructions(false);
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
    } catch {
      setStartingChat(false);
    }
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
      {/* ── Project header ─────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center rounded-xl shrink-0"
              style={{ width: 44, height: 44, background: '#f3e8ff' }}
            >
              <FontAwesomeIcon icon={faFolderOpen} style={{ fontSize: 20, color: '#7c3aed' }} />
            </div>
            <div className="min-w-0">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  className="text-xl font-semibold text-gray-900 bg-transparent border-b-2 border-teal-500 outline-none w-full"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setDraftTitle(project.title); } }}
                />
              ) : (
                <h1
                  className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-teal-700 transition-colors"
                  onClick={() => setEditingTitle(true)}
                  title="Click to rename"
                >
                  {project.title}
                  <FontAwesomeIcon icon={faPencilAlt} className="ml-2 text-sm text-gray-300 hover:text-teal-500" />
                </h1>
              )}
              {project.description && (
                <p className="text-sm text-gray-400 mt-0.5 truncate">{project.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleStartChat}
              disabled={startingChat}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity"
              style={{ background: '#2a5f6f', opacity: startingChat ? 0.7 : 1 }}
            >
              <FontAwesomeIcon icon={startingChat ? faSpinner : faCommentDots} className={startingChat ? 'animate-spin' : ''} />
              {startingChat ? 'Starting…' : 'New Chat'}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-red-400 hover:bg-red-50 transition-colors"
              title="Delete project"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
          <span>{knowledgeDocs.length} knowledge doc{knowledgeDocs.length !== 1 ? 's' : ''}</span>
          {project.isShared && (
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Shared</span>
          )}
          <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

        {/* Instructions section */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-5 py-4 text-left"
            onClick={() => setShowInstructions((v) => !v)}
          >
            <FontAwesomeIcon icon={faLightbulb} className="text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-gray-800 flex-1">Instructions</span>
            <span className="text-xs text-gray-400 mr-2">
              {instructions.trim() ? 'Custom' : 'None set'}
            </span>
            <FontAwesomeIcon icon={showInstructions ? faChevronUp : faChevronDown} className="text-gray-400 text-xs" />
          </button>

          {showInstructions && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 mt-3 mb-2">
                These instructions are injected into every Claude conversation in this project as a custom system prompt.
              </p>
              <textarea
                rows={6}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
                placeholder="e.g. You are assisting a BCBA team reviewing Q3 caseloads. Focus on measurable behavior targets and evidence-based strategies…"
                value={instructions}
                onChange={(e) => { setInstructions(e.target.value); setInstructionsDirty(true); }}
              />
              {instructionsDirty && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={saveInstructions}
                    disabled={savingInstructions}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-semibold"
                    style={{ background: savingInstructions ? '#9ca3af' : '#2a5f6f' }}
                  >
                    {savingInstructions
                      ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Saving…</>
                      : <><FontAwesomeIcon icon={faCheck} /> Save</>
                    }
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Knowledge section */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            <button
              className="flex items-center gap-3 flex-1 text-left"
              onClick={() => setShowKnowledge((v) => !v)}
            >
              <FontAwesomeIcon icon={faBookOpen} className="text-teal-500 shrink-0" />
              <span className="text-sm font-semibold text-gray-800 flex-1">Knowledge</span>
              <span className="text-xs text-gray-400 mr-2">
                {loadingDocs ? '…' : `${knowledgeDocs.length} doc${knowledgeDocs.length !== 1 ? 's' : ''}`}
              </span>
              <FontAwesomeIcon icon={showKnowledge ? faChevronUp : faChevronDown} className="text-gray-400 text-xs" />
            </button>
            <button
              onClick={() => setShowAddDoc(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 ml-2"
            >
              <FontAwesomeIcon icon={faPlus} />
              Add
            </button>
          </div>

          {showKnowledge && (
            <div className="border-t border-gray-100">
              {loadingDocs ? (
                <div className="flex items-center justify-center py-6">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-300 text-xl" />
                </div>
              ) : knowledgeDocs.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <FontAwesomeIcon icon={faFileAlt} className="text-3xl text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">No documents yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Add policy excerpts, reference guides, or context docs — Claude will use them in every project chat.
                  </p>
                  <button
                    onClick={() => setShowAddDoc(true)}
                    className="mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: '#2a5f6f' }}
                  >
                    Add Document
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {knowledgeDocs.map((doc) => (
                    <KnowledgeDocRow
                      key={doc.id}
                      doc={doc}
                      deleting={deletingDocId === doc.id}
                      onDelete={() => handleDeleteDoc(doc.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Add doc modal */}
      {showAddDoc && (
        <AddKnowledgeDocModal
          projectId={project.id}
          onClose={() => setShowAddDoc(false)}
          onAdded={(doc) => {
            setKnowledgeDocs((prev) => [...prev, doc]);
            setShowAddDoc(false);
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDeleteModal
          title={project.title}
          onConfirm={handleDeleteProject}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ── Knowledge doc row ─────────────────────────────────────────────────────────

function KnowledgeDocRow({
  doc, deleting, onDelete,
}: {
  doc: ProjectKnowledgeDoc; deleting: boolean; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = doc.textContent.slice(0, 160);

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <button
          className="flex items-start gap-2.5 flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <FontAwesomeIcon icon={faFileAlt} className="mt-0.5 text-teal-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">{doc.title}</p>
            {!expanded && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{preview}{doc.textContent.length > 160 ? '…' : ''}</p>
            )}
          </div>
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} className="text-gray-300 text-xs mt-1 shrink-0" />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-red-400 shrink-0 transition-colors"
          title="Remove"
        >
          <FontAwesomeIcon icon={deleting ? faSpinner : faTimes} className={deleting ? 'animate-spin' : ''} style={{ fontSize: 13 }} />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 ml-7 bg-gray-50 rounded-lg p-3">
          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
            {doc.textContent}
          </pre>
        </div>
      )}
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
  const [docTitle, setDocTitle]       = useState('');
  const [textContent, setTextContent] = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!docTitle.trim()) setDocTitle(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (ev) => setTextContent((ev.target?.result as string) ?? '');
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!docTitle.trim()) { setError('Title is required'); return; }
    if (!textContent.trim()) { setError('Content is required — paste text or upload a file'); return; }
    setSaving(true); setError('');
    try {
      const { docId } = await api.addProjectKnowledge(projectId, docTitle.trim(), textContent);
      const doc: ProjectKnowledgeDoc = {
        id: docId, title: docTitle.trim(), textContent,
        createdAt: new Date().toISOString(), createdBy: '',
      };
      onAdded(doc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add document');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Add Knowledge Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title</label>
            <input
              type="text"
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="e.g. Q2 Goals Summary"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Content</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-teal-600 hover:text-teal-800 font-medium"
              >
                Upload .txt / .md
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={handleFile} />
            <textarea
              rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none font-mono"
              placeholder="Paste your reference text here, or upload a file above…"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">{textContent.length.toLocaleString()} characters</p>
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
            style={{ background: saving ? '#9ca3af' : '#2a5f6f' }}
          >
            {saving ? 'Adding…' : 'Add Document'}
          </button>
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
  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [instructions, setInstructions] = useState('');
  const [isShared, setIsShared]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const { projectId } = await api.createProject({
        title: title.trim(), description, instructions: instructions.trim() || undefined, isShared,
      });
      onCreated({
        id: projectId, title: title.trim(), description,
        instructions: instructions.trim() || undefined,
        isShared,
        orgId: '', ownerId: '', clientIds: [], members: {}, memberIds: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title</label>
            <input
              type="text"
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="e.g. Q3 Caseload Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Description <span className="normal-case font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="What is this project for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Instructions <span className="normal-case font-normal text-gray-400">(optional — you can add these later)</span>
            </label>
            <textarea
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
              placeholder="e.g. You are assisting a BCBA team with…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} className="accent-teal-700" />
            <span className="text-sm text-gray-700">Share with team members</span>
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
            style={{ background: saving ? '#9ca3af' : '#2a5f6f' }}
          >
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmDeleteModal({
  title, onConfirm, onCancel,
}: {
  title: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Project</h2>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to delete <strong>{title}</strong>? This cannot be undone.
          Knowledge documents and chat associations will be removed.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-red-500 hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyDetail({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div
        className="flex items-center justify-center rounded-2xl mb-4"
        style={{ width: 72, height: 72, background: '#f3e8ff' }}
      >
        <FontAwesomeIcon icon={faFolderOpen} style={{ fontSize: 32, color: '#7c3aed' }} />
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">No project selected</h2>
      <p className="text-sm text-gray-400 max-w-xs mb-5">
        Projects let you set custom instructions and attach reference documents that are automatically
        injected into every Claude conversation.
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
        style={{ background: '#2a5f6f' }}
      >
        <FontAwesomeIcon icon={faPlus} />
        Create your first project
      </button>
    </div>
  );
}
