import { useState, useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperclip, faTimes, faShieldAlt, faUsers, faFileAlt, faPlus, faArrowCircleUp, faBookmark, faCheckCircle, faExclamationTriangle, faSpinner, faBan, faPen } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import type { AttachedFile } from '../lib/fakeData';
import type { Chat, ChatMessage } from '../types';
import ChatSidebar from '../components/chat/ChatSidebar';
import type { SidebarClient } from '../components/chat/ChatSidebar';
import NewChatModal from '../components/chat/NewChatModal';
import type { NewChatData } from '../components/chat/NewChatModal';
import FileAttachModal from '../components/chat/FileAttachModal';

// ── Lightweight markdown renderer ────────────────────────────────────────────
// Handles the patterns Claude commonly produces: headers, bold, italic,
// inline code, fenced code blocks, numbered/bulleted lists, and hr.
// No external dependency needed.
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (s: string, key: string | number) => {
    // Split on bold (**), italic (*), and inline code (`)
    const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return (
      <span key={key}>
        {parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**'))
            return <strong key={j}>{p.slice(2, -2)}</strong>;
          if (p.startsWith('*') && p.endsWith('*'))
            return <em key={j}>{p.slice(1, -1)}</em>;
          if (p.startsWith('`') && p.endsWith('`'))
            return <code key={j} className="bg-gray-100 text-teal-700 rounded px-1 text-xs font-mono">{p.slice(1, -1)}</code>;
          return p;
        })}
      </span>
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-gray-900 text-green-300 rounded-xl px-4 py-3 text-xs overflow-x-auto my-2 whitespace-pre">
          {lang && <div className="text-gray-500 text-xs mb-1">{lang}</div>}
          {codeLines.join('\n')}
        </pre>
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith('### ')) { elements.push(<h3 key={i} className="font-semibold text-gray-800 text-sm mt-3 mb-0.5">{renderInline(line.slice(4), 0)}</h3>); i++; continue; }
    if (line.startsWith('## '))  { elements.push(<h2 key={i} className="font-bold text-gray-800 text-base mt-4 mb-1">{renderInline(line.slice(3), 0)}</h2>); i++; continue; }
    if (line.startsWith('# '))   { elements.push(<h1 key={i} className="font-bold text-gray-900 text-lg mt-4 mb-1">{renderInline(line.slice(2), 0)}</h1>); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { elements.push(<hr key={i} className="my-3 border-gray-200" />); i++; continue; }

    // Ordered list — collect contiguous numbered lines
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={i} className="list-decimal list-outside ml-5 space-y-0.5 my-1">
          {items.map((item, j) => <li key={j} className="text-sm">{renderInline(item, j)}</li>)}
        </ol>
      );
      continue;
    }

    // Unordered list — collect contiguous bullet lines
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={i} className="list-disc list-outside ml-5 space-y-0.5 my-1">
          {items.map((item, j) => <li key={j} className="text-sm">{renderInline(item, j)}</li>)}
        </ul>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') { elements.push(<div key={i} className="h-2" />); i++; continue; }

    // Normal paragraph line
    elements.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line, 0)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

/** Derive a short chat title from the first user message. */
function deriveTitleFromMessage(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= 48) return clean.charAt(0).toUpperCase() + clean.slice(1);
  const cut = clean.slice(0, 48);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1) + '…';
}

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
  /** When set, auto-open New Chat modal pre-scoped to this client (e.g. navigating from ClientsView).
   *  Re-fires whenever the value changes so clicking a second client while already in chat view works. */
  initialClientId?: string | null;
}

export default function ChatView({ initialChatId, initialClientId }: ChatViewProps = {}) {
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
  const [editingTitle, setEditingTitle]                   = useState(false);
  const [titleDraft, setTitleDraft]                       = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat   = chats.find((c) => c.id === activeChatId) ?? null;
  const activeClient = activeChat?.clientId
    ? sidebarClients.find((c) => c.id === activeChat.clientId)
    : null;
  const messages = activeChatId ? (messagesByChat[activeChatId] ?? []) : [];

  // ── Auto-create chat when arriving from ClientsView ──────────────────────
  // When initialClientId is set, skip the modal and create the chat immediately.
  // Waits until the client list has finished loading so we can derive the title.

  useEffect(() => {
    if (!initialClientId || loadingChats) return;
    const client = sidebarClients.find((c) => c.id === initialClientId);
    const name   = client?.preferredName ?? '';
    const date   = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const title  = name ? `${name} — ${date}` : `Chat — ${date}`;
    handleNewChat({ title, clientId: initialClientId });
  }, [initialClientId, loadingChats]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setEditingTitle(false);
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

  // ── Delete chat ───────────────────────────────────────────────────────────

  const handleDeleteChat = useCallback(async (id: string) => {
    // Optimistic remove
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);

    try {
      await api.deleteChat(id);
    } catch {
      // Non-fatal — chat already gone from local state; backend may still clean up on next load
    }
  }, [activeChatId]);

  // ── Rename chat ───────────────────────────────────────────────────────────

  const saveTitle = useCallback(async () => {
    setEditingTitle(false);
    const newTitle = titleDraft.trim();
    if (!newTitle || !activeChatId || newTitle === activeChat?.title) return;

    // Optimistic update
    setChats((prev) =>
      prev.map((c) => (c.id === activeChatId ? { ...c, title: newTitle } : c))
    );

    try {
      await api.updateChatTitle(activeChatId, newTitle);
    } catch {
      // Revert on failure
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId ? { ...c, title: activeChat?.title ?? c.title } : c
        )
      );
    }
  }, [titleDraft, activeChatId, activeChat?.title]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // ── Auto-title on first message (always, regardless of response) ─────────
    // Derive a title from the first user message as soon as it's sent — don't
    // wait for the AI response, which may be blocked or error.
    if (history.length === 0) {
      const autoTitle = deriveTitleFromMessage(text);
      setChats((prev) =>
        prev.map((c) => (c.id === activeChatId ? { ...c, title: autoTitle } : c))
      );
      api.updateChatTitle(activeChatId, autoTitle).catch(() => {/* non-fatal */});
    }

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
    } catch (err) {
      // ── Input guard block ─────────────────────────────────────────────────
      // The backend detected a policy violation and returned HTTP 422 with a
      // structured error body (code, message, detected).  Surface the guard
      // message directly rather than a generic infrastructure error, and restore
      // the user's input so they can edit the message.
      // Handled codes: CROSS_CLIENT_PHI_INPUT | PROMPT_INJECTION_DETECTED |
      //                SENSITIVE_IDENTIFIER_DETECTED
      if (err instanceof ApiError && INPUT_GUARD_CODES.has(err.code ?? '')) {
        const redirectMsg   = (err.details.message as string) ?? err.message;
        const detectedValue = (err.details.detected as string) ?? '';

        // Restore input — the message was not sent; user should edit it
        setInput(text);

        // Replace the optimistically-added user message with a warning variant
        const guardMsg: ChatMessage & {
          guardBlock: true;
          guardCode: string;
          detectedValue: string;
        } = {
          id:           (Date.now() + 1).toString(),
          role:         'assistant',
          content:      redirectMsg,
          timestamp:    new Date().toISOString(),
          guardBlock:   true,
          guardCode:    err.code ?? 'UNKNOWN',
          detectedValue,
        };
        setMessagesByChat((prev) => ({
          ...prev,
          [activeChatId]: [...(prev[activeChatId] ?? []), guardMsg],
        }));
      } else if (err instanceof ApiError && err.code === 'AUTH_REQUIRED') {
        // ── Hard-block: client requires explicit written authorization ──────
        const clientName = activeClient
          ? (activeClient.preferredName || activeClient.firstName || 'this client')
          : 'this client';
        const errMsg: ChatMessage = {
          id:        (Date.now() + 1).toString(),
          role:      'assistant',
          content:   `AI access for ${clientName} is blocked — their diagnosis includes a specially-protected data category that requires a written authorization before any AI processing.\n\nTo unblock: go to **Clients → ${clientName} → Authorizations tab** and add an **ABA Treatment Authorization** (covers all routine ABA care). Use the specific authorization type only if required by your compliance team.`,
          timestamp: new Date().toISOString(),
        };
        setMessagesByChat((prev) => ({
          ...prev,
          [activeChatId]: [...(prev[activeChatId] ?? []), errMsg],
        }));
      } else if (err instanceof ApiError && err.code === 'USAGE_LIMIT_EXCEEDED') {
        // ── Monthly request limit reached ──────────────────────────────────
        const errMsg: ChatMessage = {
          id:        (Date.now() + 1).toString(),
          role:      'assistant',
          content:   'Your organization has reached its monthly AI request limit. Clinical AI features are unavailable until the next billing period.\n\nContact **support@myaba.ai** to upgrade your plan or adjust your spending cap.',
          timestamp: new Date().toISOString(),
        };
        setMessagesByChat((prev) => ({
          ...prev,
          [activeChatId]: [...(prev[activeChatId] ?? []), errMsg],
        }));
      } else {
        // ── Generic backend / network error ────────────────────────────────
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
      }
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

  // Enter sends; Shift+Enter inserts newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
        onDeleteChat={handleDeleteChat}
      />

      {/* Right: active chat */}
      {activeChat ? (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Chat header */}
          <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-3 flex-wrap flex-shrink-0">
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

            {/* Inline-editable chat title */}
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ minWidth: 160, maxWidth: 320 }}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();
                  } else if (e.key === 'Escape') {
                    setEditingTitle(false);
                  }
                }}
                onBlur={saveTitle}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                  {activeChat.title}
                </span>
                <button
                  title="Rename chat"
                  onClick={() => {
                    setTitleDraft(activeChat.title);
                    setEditingTitle(true);
                    setTimeout(() => titleInputRef.current?.select(), 0);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#6b7280', lineHeight: 1 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#0d9488')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                >
                  <FontAwesomeIcon icon={faPen} style={{ fontSize: 11 }} />
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
            {loadingMessages ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-400 text-sm animate-pulse">Loading messages…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-semibold text-gray-700 mb-2">{activeChat.title}</h2>
                <p className="text-gray-400 text-sm max-w-sm">
                  {activeClient
                    ? `Ask anything about ${activeClient.preferredName}'s care.`
                    : 'General project chat. You can reference information from multiple clients you are authorized for.'}
                </p>
                <p className="text-gray-300 text-xs mt-3">
                  Use the paperclip to attach templates or client files as context.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => {
                  // ── Input guard block — policy warning banner ───────────────
                  const raw = msg as Record<string, unknown>;
                  if (raw.guardBlock === true) {
                    return (
                      <InputGuardWarning
                        key={msg.id}
                        guardCode={raw.guardCode as string}
                        detectedValue={raw.detectedValue as string}
                        message={msg.content}
                      />
                    );
                  }

                  return (
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
                        {msg.role === 'assistant'
                          ? <MarkdownContent text={msg.content} />
                          : <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                        }
                        {msg.aclxDecision && msg.aclxDecision !== 'ALLOW' && (
                          <AclxBadge decision={msg.aclxDecision} />
                        )}
                      </div>
                      {/* Save as Template — only on genuine allowed AI responses */}
                      {msg.role === 'assistant' &&
                        msg.aclxDecision === 'ALLOW' && (
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
                  );
                })}
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
                  placeholder="Ask anything  —  Shift+Enter for new line"
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
                Shift+Enter for new line
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

// ── Guard codes handled by InputGuardWarning ──────────────────────────────────
// Keep in sync with InputGuardService guard implementations on the backend.

const INPUT_GUARD_CODES = new Set([
  'CROSS_CLIENT_PHI_INPUT',
  'PROMPT_INJECTION_DETECTED',
  'SENSITIVE_IDENTIFIER_DETECTED',
]);

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
      <h1 className="text-2xl font-bold text-center mb-4" style={{ color: '#1E3347', letterSpacing: '-0.02em' }}>
        Secure. Compliant. Connected.
      </h1>

      {/* Responsible AI notice */}
      <div
        className="mb-8"
        style={{
          maxWidth: 520,
          width: '100%',
          background: '#F0F7FF',
          border: '1px solid #BDD7F5',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <FontAwesomeIcon icon={faShieldAlt} style={{ fontSize: 14, color: '#1E88FF' }} />
        </div>
        <p style={{ fontSize: 12, color: '#2C4A6B', lineHeight: 1.7, margin: 0 }}>
          AI must be used ethically, responsibly, and in alignment with HIPAA, company policies,
          and the <strong style={{ fontWeight: 600 }}>BACB Ethics Code</strong>. AI can support
          efficiency and organization, but it should not replace clinical judgment, supervision,
          or individualized care.{' '}
          <strong style={{ fontWeight: 600 }}>All AI-generated content should be reviewed and verified before use.</strong>
        </p>
      </div>

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

// ── Input guard warning banner ────────────────────────────────────────────────
//
// Rendered in place of an assistant bubble when any InputGuard fires (HTTP 422).
// Styling and copy adapt to the specific guard code so clinicians immediately
// understand what was blocked and why.
//
// Code → treatment:
//   PROMPT_INJECTION_DETECTED    → red/rose  — security event
//   SENSITIVE_IDENTIFIER_DETECTED → orange    — super-PHI data protection
//   CROSS_CLIENT_PHI_INPUT        → amber     — HIPAA Minimum Necessary

const GUARD_STYLES: Record<string, {
  bg: string;
  border: string;
  bodyText: string;
  headerText: string;
  mutedText: string;
  badgeBg: string;
  icon: typeof faBan;
  title: string;
  badge: string;
  citation: string | null;
}> = {
  PROMPT_INJECTION_DETECTED: {
    bg: '#fff1f2', border: '#fecdd3', bodyText: '#881337',
    headerText: '#9f1239', mutedText: '#be123c', badgeBg: '#ffe4e6',
    icon: faBan,
    title: 'Security policy violation',
    badge: 'Prompt injection',
    citation: null,
  },
  SENSITIVE_IDENTIFIER_DETECTED: {
    bg: '#fff7ed', border: '#fed7aa', bodyText: '#7c2d12',
    headerText: '#9a3412', mutedText: '#c2410c', badgeBg: '#ffedd5',
    icon: faExclamationTriangle,
    title: 'Sensitive identifier detected',
    badge: 'Data protection',
    citation: null,
  },
  CROSS_CLIENT_PHI_INPUT: {
    bg: '#fffbeb', border: '#fde68a', bodyText: '#78350f',
    headerText: '#92400e', mutedText: '#a16207', badgeBg: '#fef3c7',
    icon: faBan,
    title: 'Cross-client reference blocked',
    badge: 'HIPAA · Minimum Necessary',
    citation: '45 CFR §164.514(d) — Minimum Necessary Rule',
  },
};

function InputGuardWarning({
  guardCode,
  detectedValue,
  message,
}: {
  guardCode: string;
  detectedValue: string;
  message: string;
}) {
  const s = GUARD_STYLES[guardCode] ?? GUARD_STYLES['CROSS_CLIENT_PHI_INPUT'];

  return (
    <div className="max-w-[85%] self-start w-full">
      <div
        className="rounded-2xl px-4 py-3.5 text-sm"
        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.bodyText }}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2 font-semibold" style={{ color: s.headerText }}>
          <FontAwesomeIcon icon={s.icon} style={{ fontSize: 13, color: s.mutedText }} />
          {s.title}
          <span
            className="ml-auto text-xs font-normal px-2 py-0.5 rounded-full"
            style={{ background: s.badgeBg, color: s.headerText }}
          >
            {s.badge}
          </span>
        </div>

        {/* Detected value callout — only shown when meaningful */}
        {detectedValue && detectedValue !== 'prompt-injection' && (
          <p className="text-xs mb-2.5" style={{ color: s.mutedText }}>
            Detected: <strong>"{detectedValue}"</strong>
          </p>
        )}

        {/* Full guard message */}
        <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: s.bodyText }}>
          {message}
        </p>

        {/* Optional citation */}
        {s.citation && (
          <p className="text-xs mt-3 pt-2.5 border-t" style={{ borderColor: s.border, color: s.mutedText }}>
            {s.citation}
          </p>
        )}
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
