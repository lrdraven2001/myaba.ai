import { useState, useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperclip, faTimes, faShieldAlt, faUsers, faFileAlt, faPlus, faArrowCircleUp, faBookmark, faCheckCircle, faExclamationTriangle, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { AttachedFile } from '../lib/fakeData';
import type { Chat, ChatMessage } from '../types';
import ChatSidebar from '../components/chat/ChatSidebar';
import type { SidebarClient } from '../components/chat/ChatSidebar';
import NewChatModal from '../components/chat/NewChatModal';
import type { NewChatData } from '../components/chat/NewChatModal';
import FileAttachModal from '../components/chat/FileAttachModal';

/** Derive initials from a name string. */
function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

/** Returns the best display name for a client — preferred name or first name, never full legal name. */
function clientDisplayName(c: { firstName?: string; lastName?: string; preferredName?: string }): string {
  return c.preferredName || c.firstName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '';
}

interface ChatViewProps {
  /** When set, auto-select this chat after the list loads (e.g. navigating from ProjectsView). */
  initialChatId?: string | null;
}

export default function ChatView({ initialChatId }: ChatViewProps = {}) {
  const [chats, setChats]                       = useState<Chat[]>([]);
  const [sidebarClients, setSidebarClients]     = useState<SidebarClient[]>([]);
  const [activeChatId, setActiveChatId]         = useState<string | null>(initialChatId ?? null);
  const [messagesByChat, setMessagesByChat]     = useState<Record<string, ChatMessage[]>>({});
  const [previews, setPreviews]                 = useState<Record<string, string>>({});
  const [input, setInput]                       = useState('');
  const [loading, setLoading]                   = useState(false);
  const [loadingChats, setLoadingChats]         = useState(true);
  const [loadingMessages, setLoadingMessages]   = useState(false);
  const [showNewChat, setShowNewChat]           = useState(false);
  const [showFileAttach, setShowFileAttach]     = useState(false);
  const [attachedFiles, setAttachedFiles]       = useState<AttachedFile[]>([]);
  const [templateSourceContent, setTemplateSourceContent] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat   = chats.find((c) => c.id === activeChatId) ?? null;
  const activeClient = activeChat?.clientId
    ? sidebarClients.find((c) => c.id === activeChat.clientId)
    : null;
  const messages = activeChatId ? (messagesByChat[activeChatId] ?? []) : [];

  // ── Load chats on mount ───────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setLoadingChats(true);
      try {
        const [chatsData, clientsData] = await Promise.all([
          api.getChats(),
          api.getClients(),
        ]);
        setChats(chatsData);
        setSidebarClients(
          clientsData.map((c) => ({
            id: c.id,
            preferredName: clientDisplayName(c),
            initials: toInitials(clientDisplayName(c)),
          }))
        );
        // If we navigated here with an initialChatId, make sure that chat is in the list.
        // (It was just created in ProjectsView so it should appear first.)
        // If not already set by prop, let the user choose from the sidebar.
      } catch {
        // Backend unreachable — show empty state
      } finally {
        setLoadingChats(false);
      }
    })();
  }, []);

  // ── Load messages when active chat changes ────────────────────────────────

  useEffect(() => {
    if (!activeChatId) return;
    if (messagesByChat[activeChatId]) return; // already loaded
    (async () => {
      setLoadingMessages(true);
      try {
        const msgs = await api.getChatMessages(activeChatId);
        const mapped: ChatMessage[] = msgs.map((m) => ({
          id:        m.id,
          chatId:    m.chatId,
          role:      m.role,
          content:   m.content,
          timestamp: (m as Record<string, string>).createdAt ?? new Date().toISOString(),
          createdAt: (m as Record<string, string>).createdAt,
        }));
        setMessagesByChat((prev) => ({ ...prev, [activeChatId]: mapped }));
        // set preview to last message text
        const last = mapped[mapped.length - 1];
        if (last) {
          setPreviews((p) => ({ ...p, [activeChatId]: last.content.slice(0, 60) }));
        }
      } catch {
        // Backend down — start with empty message list
        setMessagesByChat((prev) => ({ ...prev, [activeChatId]: [] }));
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Chat selection ────────────────────────────────────────────────────────

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id);
    setAttachedFiles([]);
    setInput('');
  }, []);

  // ── New chat ──────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(
    async (data: NewChatData) => {
      const now = new Date().toISOString();
      let chatId: string;

      try {
        const res = await api.createChat({
          title:        data.title,
          clientId:     data.clientId,
          projectId:    data.projectId,
          projectLabel: data.projectLabel,
          policyIds:    data.policyIds,
        });
        chatId = res.chatId;
      } catch {
        chatId = `ch-${Date.now()}`;
      }

      const newChat: Chat = {
        id:           chatId,
        title:        data.title,
        orgId:        '',
        createdBy:    '',
        clientId:     data.clientId ?? '',
        projectId:    data.projectId ?? '',
        projectLabel: data.projectLabel ?? '',
        policyIds:    data.policyIds,
        memberIds:    [],
        createdAt:    now,
        updatedAt:    now,
      };

      setChats((prev) => [newChat, ...prev]);
      setMessagesByChat((prev) => ({ ...prev, [chatId]: [] }));
      setActiveChatId(chatId);
      setShowNewChat(false);
      setAttachedFiles([]);
      setInput('');
    },
    []
  );

  // ── File attachment ───────────────────────────────────────────────────────

  const handleAttach = useCallback((files: AttachedFile[]) => {
    setAttachedFiles(files);
    setShowFileAttach(false);
  }, []);

  const removeAttached = useCallback((id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !activeChatId) return;

    const primaryClientId = activeChat?.clientId || undefined;
    const attachedClientIds = Array.from(
      new Set(attachedFiles.filter((f) => f.clientId).map((f) => f.clientId!))
    );
    const allClientIds = Array.from(
      new Set([...(primaryClientId ? [primaryClientId] : []), ...attachedClientIds])
    );

    const fileContext =
      attachedFiles.length > 0
        ? `\n\n[Context files attached: ${attachedFiles.map((f) => f.name).join(', ')}]`
        : '';

    const userMsg: ChatMessage = {
      id:        Date.now().toString(),
      role:      'user',
      content:   text + (attachedFiles.length > 0
        ? `\n\n[Context: ${attachedFiles.map((f) => f.name).join(', ')}]`
        : ''),
      timestamp: new Date().toISOString(),
    };

    const history = [...messages];
    setMessagesByChat((prev) => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] ?? []), userMsg],
    }));
    setInput('');
    setAttachedFiles([]);
    setLoading(true);

    // Optimistically update sidebar preview
    setPreviews((prev) => ({ ...prev, [activeChatId]: text.slice(0, 60) }));
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId ? { ...c, updatedAt: new Date().toISOString() } : c
      )
    );

    try {
      const res = await api.chat(
        text + fileContext,
        history,
        primaryClientId,
        allClientIds,
        activeChatId,
      );

      const assistantMsg: ChatMessage = {
        id:           (Date.now() + 1).toString(),
        role:         'assistant',
        content:      res.reply,
        timestamp:    new Date().toISOString(),
        aclxDecision: res.decision as ChatMessage['aclxDecision'],
      };
      setMessagesByChat((prev) => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] ?? []), assistantMsg],
      }));
      setPreviews((prev) => ({ ...prev, [activeChatId]: res.reply.slice(0, 60) }));
    } catch {
      const errMsg: ChatMessage = {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   'Could not reach the backend. Make sure the API is running on port 9090 (`mvn spring-boot:run -Dspring-boot.run.profiles=local` in `backend-java/`).',
        timestamp: new Date().toISOString(),
      };
      setMessagesByChat((prev) => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] ?? []), errMsg],
      }));
    } finally {
      setLoading(false);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content
  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTextarea();
  };

  // Ctrl+Enter / ⌘+Enter sends; plain Enter inserts newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Reset textarea height after send
  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [loading]);

  // Ctrl+K / ⌘K → open new chat from anywhere
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowNewChat(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingChats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Loading chats…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: chat list */}
      <ChatSidebar
        chats={chats}
        clients={sidebarClients}
        activeChatId={activeChatId}
        previews={previews}
        onSelectChat={handleSelectChat}
        onNewChat={() => setShowNewChat(true)}
      />

      {/* Right: active chat */}
      {activeChat ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat header */}
          <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-3 flex-wrap">
            {activeClient && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border"
                style={{ background: '#e8f4f8', borderColor: '#5fb3d0', color: '#1e4d5c' }}
              >
                <span
                  className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
                  style={{ background: '#2a5f6f' }}
                >
                  {activeClient.initials}
                </span>
                {activeClient.preferredName}
              </span>
            )}
            {activeChat.projectLabel && (
              <span className="px-3 py-1 bg-purple-50 border border-purple-200 rounded-full text-sm text-purple-700 font-medium">
                {activeChat.projectLabel}
              </span>
            )}
            <span className="text-sm font-semibold text-gray-700">{activeChat.title}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {loadingMessages ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-400 text-sm animate-pulse">Loading messages…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-semibold text-gray-700 mb-2">{activeChat.title}</h2>
                <p className="text-gray-400 text-sm max-w-sm">
                  {activeClient
                    ? `Ask anything about ${activeClient.preferredName}'s care — all responses are ACLX-governed for HIPAA compliance.`
                    : 'General project chat. You can reference information from multiple clients you are authorized for.'}
                </p>
                <p className="text-gray-300 text-xs mt-3">
                  Use the paperclip to attach templates or client files as context.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user' ? 'text-white' : 'bg-gray-100 text-gray-800'
                      }`}
                      style={msg.role === 'user' ? { background: '#2a5f6f' } : {}}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.aclxDecision && msg.aclxDecision !== 'ALLOW' && (
                        <AclxBadge decision={msg.aclxDecision} />
                      )}
                    </div>
                    {/* Save as Template — only on non-blocked assistant messages */}
                    {msg.role === 'assistant' &&
                      (!msg.aclxDecision || msg.aclxDecision === 'ALLOW') && (
                      <button
                        onClick={() => setTemplateSourceContent(msg.content)}
                        className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors px-1"
                        title="Save de-identified version as a reusable template"
                      >
                        <FontAwesomeIcon icon={faBookmark} style={{ fontSize: 10 }} />
                        Save as Template
                      </button>
                    )}
                  </div>
                ))}
                {loading && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="px-6 pb-6 pt-2">
            <div className="max-w-3xl mx-auto">
              {/* Attached file chips */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {attachedFiles.map((f) => (
                    <span
                      key={f.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                      style={{ background: '#e8f4f8', borderColor: '#5fb3d0', color: '#1e4d5c' }}
                    >
                      <FontAwesomeIcon icon={faPaperclip} className="text-xs" /> {f.name}
                      <button
                        className="hover:text-red-500 transition-colors"
                        onClick={() => removeAttached(f.id)}
                      >
                        <FontAwesomeIcon icon={faTimes} className="text-xs" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div
                className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2"
                style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}
              >
                {/* Attach */}
                <button
                  className="text-gray-400 hover:text-teal-600 transition-colors mb-1 flex-shrink-0"
                  title="Attach templates or client files"
                  onClick={() => setShowFileAttach(true)}
                >
                  <FontAwesomeIcon icon={faPaperclip} style={{ fontSize: 16 }} />
                </button>

                {/* Multi-line textarea */}
                <textarea
                  ref={textareaRef}
                  className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none leading-relaxed"
                  placeholder="Ask anything  —  Enter for new line  ·  Ctrl+Enter to send"
                  rows={1}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  style={{ maxHeight: 200, minHeight: 28 }}
                />

                {/* Green send button */}
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim() || !activeChatId}
                  title="Send (Ctrl+Enter)"
                  className="flex-shrink-0 mb-0.5 transition-all"
                  style={{
                    color: input.trim() && activeChatId ? '#3F9B2F' : '#C8D8C8',
                    cursor: input.trim() && activeChatId ? 'pointer' : 'default',
                  }}
                >
                  <FontAwesomeIcon icon={faArrowCircleUp} style={{ fontSize: 28 }} />
                </button>
              </div>
              <p className="text-center text-xs mt-1.5" style={{ color: '#B0BEC5' }}>
                Enter for new line &nbsp;·&nbsp; Ctrl+Enter to send
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ChatLandingPage onNewChat={() => setShowNewChat(true)} />
      )}

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          clients={sidebarClients}
          onClose={() => setShowNewChat(false)}
          onCreate={handleNewChat}
        />
      )}
      {showFileAttach && (
        <FileAttachModal
          onClose={() => setShowFileAttach(false)}
          onAttach={handleAttach}
          alreadyAttached={attachedFiles.map((f) => f.id)}
        />
      )}
      {templateSourceContent !== null && (
        <SaveAsTemplateModal
          rawContent={templateSourceContent}
          clientId={activeChat?.clientId ?? null}
          onClose={() => setTemplateSourceContent(null)}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACLX_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  REDACT:   { bg: '#e0f2fe', text: '#0369a1', label: 'REDACTED by ACLX' },
  BLOCK:    { bg: '#fee2e2', text: '#dc2626', label: 'BLOCKED by ACLX' },
  ESCALATE: { bg: '#fef3c7', text: '#d97706', label: 'ESCALATED — Pending Review' },
};

function AclxBadge({ decision }: { decision: string }) {
  const s = ACLX_STYLES[decision] ?? { bg: '#f3f4f6', text: '#6b7280', label: decision };
  return (
    <span
      className="inline-flex items-center gap-1 mt-2 text-xs px-2.5 py-0.5 rounded-full font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 10 }} />
      {s.label}
    </span>
  );
}

// ── Chat landing page (shown when no chat is open) ───────────────────────────

function ChatLandingPage({ onNewChat }: { onNewChat: () => void }) {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const shortcut = isMac ? '⌘ K' : 'Ctrl K';

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8" style={{ background: '#f8fbfc' }}>
      {/* Hero icon */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 72, height: 72, background: '#EEF7EA', boxShadow: '0 4px 16px rgba(63,155,47,0.15)' }}
        >
          <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 30, color: '#3F9B2F' }} />
        </div>
        <div style={{ width: 40, height: 2, background: 'linear-gradient(90deg, #3F9B2F, #1E88FF)', borderRadius: 2 }} />
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 72, height: 72, background: '#EEF4FF', boxShadow: '0 4px 16px rgba(30,136,255,0.15)' }}
        >
          <FontAwesomeIcon icon={faFileAlt} style={{ fontSize: 30, color: '#1E88FF' }} />
        </div>
      </div>

      {/* Headline */}
      <h1 className="text-2xl font-bold text-center mb-3" style={{ color: '#1E3347', letterSpacing: '-0.02em' }}>
        Secure. Compliant. Connected.
      </h1>
      <p className="text-sm text-center max-w-sm mb-1" style={{ color: '#6B7B88', lineHeight: 1.6 }}>
        Start a new chat to securely discuss documents across multiple conversations.
      </p>
      <p className="text-sm text-center mb-8" style={{ color: '#6B7B88' }}>
        All data is HIPAA compliant and role-permissioned.
      </p>

      {/* CTA — single button, no duplicate */}
      <button
        onClick={onNewChat}
        className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white mb-3 transition-all"
        style={{ background: '#3F9B2F', fontSize: 15, boxShadow: '0 4px 14px rgba(63,155,47,0.35)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#2E7D22')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#3F9B2F')}
      >
        <FontAwesomeIcon icon={faPlus} />
        New Chat
      </button>
      <p className="text-xs mb-12" style={{ color: '#A8B4BF' }}>
        or press <kbd
          className="px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: '#E8F0F4', color: '#6B7B88', border: '1px solid #DCE7EE' }}
        >{shortcut}</kbd>
      </p>

      {/* Feature row */}
      <div className="flex gap-10">
        {[
          { icon: faShieldAlt, color: '#3F9B2F', bg: '#EEF7EA', title: 'HIPAA Compliant',    desc: 'Your data is encrypted and protected.' },
          { icon: faUsers,     color: '#1E88FF', bg: '#EEF4FF', title: 'Role-Based Access',  desc: 'Chats and documents follow your permission model.' },
          { icon: faFileAlt,   color: '#F5A623', bg: '#FFF8EE', title: 'Document Aware',     desc: 'Ask questions across multiple linked documents.' },
        ].map(({ icon, color, bg, title, desc }) => (
          <div key={title} className="flex flex-col items-center text-center" style={{ maxWidth: 130 }}>
            <div
              className="flex items-center justify-center rounded-full mb-3"
              style={{ width: 48, height: 48, background: bg }}
            >
              <FontAwesomeIcon icon={icon} style={{ fontSize: 20, color }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: '#1E3347' }}>{title}</p>
            <p className="text-xs" style={{ color: '#6B7B88', lineHeight: 1.5 }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-100 rounded-2xl px-4 py-3">
        <div className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Save as Template modal ────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'progress_note',     label: 'Progress Note'     },
  { value: 'schedule',          label: 'Schedule'          },
  { value: 'bip',               label: 'BIP'               },
  { value: 'fba',               label: 'FBA'               },
  { value: 'skill_acquisition', label: 'Skill Acquisition' },
  { value: 'parent_training',   label: 'Parent Training'   },
  { value: 'other',             label: 'Other'             },
];

function SaveAsTemplateModal({
  rawContent,
  clientId,
  onClose,
}: {
  rawContent: string;
  clientId: string | null;
  onClose: () => void;
}) {
  const [title, setTitle]       = useState('');
  const [category, setCategory] = useState('schedule');
  const [content, setContent]   = useState('');
  const [redactedFields, setRedactedFields] = useState<string[]>([]);
  const [deidentifying, setDeidentifying]   = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [saved, setSaved]                   = useState(false);
  const [error, setError]                   = useState('');

  // On mount: de-identify if we have a client, otherwise use raw content
  useEffect(() => {
    if (!clientId) {
      setContent(rawContent);
      return;
    }
    setDeidentifying(true);
    api.deidentifyForTemplate(clientId, rawContent)
      .then(({ deidentifiedContent, redactedFields: rf }) => {
        setContent(deidentifiedContent);
        setRedactedFields(rf);
      })
      .catch(() => {
        // Fallback: use raw content and warn
        setContent(rawContent);
        setError('Could not reach the backend for de-identification — review content manually before saving.');
      })
      .finally(() => setDeidentifying(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!title.trim()) { setError('Template title is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.createTemplate({ title: title.trim(), category, content });
      setSaved(true);
      setTimeout(onClose, 1400);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed — please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faBookmark} className="text-teal-600" />
            <h2 className="text-base font-semibold text-gray-900">Save as Template</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* De-identification status */}
          {deidentifying && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-teal-600" />
              Removing client PHI…
            </div>
          )}

          {!deidentifying && redactedFields.length > 0 && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}
            >
              <FontAwesomeIcon icon={faCheckCircle} className="mt-0.5 shrink-0" style={{ color: '#16a34a' }} />
              <span>
                <strong>PHI removed:</strong> {redactedFields.join(', ')} replaced with{' '}
                <code className="font-mono text-xs">{'{{clientName}}'}</code>
                {redactedFields.includes('date of birth') && (
                  <> / <code className="font-mono text-xs">{'{{dateOfBirth}}'}</code></>
                )} placeholders.
              </span>
            </div>
          )}

          {!deidentifying && !clientId && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm"
              style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
            >
              <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 shrink-0" style={{ color: '#d97706' }} />
              <span>
                This chat has no associated client — review the content below for any patient identifiers before saving.
              </span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Template Name
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="e.g. 5-Day Morning Schedule"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Category
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Content — editable so clinician can make final corrections */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Template Content
              <span className="ml-1 font-normal normal-case text-gray-400">
                (review and edit before saving)
              </span>
            </label>
            <textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={deidentifying}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {saved && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium"
              style={{ background: '#f0fdf4', color: '#166534' }}
            >
              <FontAwesomeIcon icon={faCheckCircle} />
              Template saved!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deidentifying || saved}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60"
            style={{ background: '#2a5f6f' }}
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
