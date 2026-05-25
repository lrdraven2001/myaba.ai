import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faChevronDown, faChevronRight, faChevronLeft,
  faSearch, faTimes,
} from '@fortawesome/free-solid-svg-icons';
import type { Chat } from '../../types';

export interface SidebarClient {
  id: string;
  preferredName: string;
  initials: string;
}

type Tab = 'recents' | 'clients' | 'projects';

interface Props {
  chats: Chat[];
  clients: SidebarClient[];
  activeChatId: string | null;
  previews?: Record<string, string>;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
}

// ── Time bucket helpers ───────────────────────────────────────────────────────

function timeBucket(iso: string): 'today' | 'yesterday' | 'this_week' | 'earlier' {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOfToday    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
    const startOfWeek     = new Date(startOfToday.getTime() - startOfToday.getDay() * 86_400_000);
    if (d >= startOfToday)     return 'today';
    if (d >= startOfYesterday) return 'yesterday';
    if (d >= startOfWeek)      return 'this_week';
    return 'earlier';
  } catch { return 'earlier'; }
}

const BUCKET_LABELS: Record<string, string> = {
  today:     'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  earlier:   'Earlier',
};
const BUCKET_ORDER = ['today', 'yesterday', 'this_week', 'earlier'];

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatSidebar({
  chats,
  clients,
  activeChatId,
  previews = {},
  onSelectChat,
  onNewChat,
}: Props) {
  const [activeTab, setActiveTab]   = useState<Tab>('recents');
  const [collapsed, setCollapsed]   = useState(false);
  const [searching, setSearching]   = useState(false);
  const [query, setQuery]           = useState('');
  const searchRef                   = useRef<HTMLInputElement>(null);

  // Which section keys are expanded (e.g. "today", "client:c-001", "project:Q3")
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['today']));

  // Auto-expand the section containing the active chat
  useEffect(() => {
    if (!activeChatId) return;
    const chat = chats.find((c) => c.id === activeChatId);
    if (!chat) return;
    const keys: string[] = [timeBucket(chat.updatedAt)];
    if (chat.clientId) keys.push(`client:${chat.clientId}`);
    const projKey = chat.clientId ? '' : (chat.projectLabel || 'General');
    if (projKey) keys.push(`project:${projKey}`);
    setExpanded((prev) => { const n = new Set(prev); keys.forEach((k) => n.add(k)); return n; });
  }, [activeChatId, chats]);

  // Focus search input when opened
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const toggle = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const closeSearch = () => { setSearching(false); setQuery(''); };

  // Filter chats by query
  const visibleChats = query.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : chats;

  // ── Collapsed strip ──────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center py-3 border-r border-gray-200 bg-gray-50 gap-3"
        style={{ width: 44, flexShrink: 0 }}
      >
        {/* Expand button */}
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          title="Expand chat history"
        >
          <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
        </button>
        {/* New chat */}
        <button
          onClick={onNewChat}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white transition-colors"
          style={{ background: '#2a5f6f' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#1e4d5c')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#2a5f6f')}
          title="New chat"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" />
        </button>
        {/* Active chat dot indicator */}
        {activeChatId && (
          <div
            className="w-2 h-2 rounded-full mt-1"
            style={{ background: '#5fb3d0' }}
            title="Chat active"
          />
        )}
      </div>
    );
  }

  // ── Expanded panel ───────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col border-r border-gray-200 bg-gray-50 overflow-hidden"
      style={{ width: 272, flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-gray-200 bg-white">
        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0"
          title="Collapse chat history"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
        </button>

        {searching ? (
          /* Inline search input */
          <div className="flex-1 flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
            <FontAwesomeIcon icon={faSearch} className="text-gray-400 text-xs shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400 min-w-0"
              onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 shrink-0">
                <FontAwesomeIcon icon={faTimes} className="text-xs" />
              </button>
            )}
          </div>
        ) : (
          /* Normal header: title + search + new chat */
          <>
            <span className="flex-1 font-semibold text-gray-800 text-sm">Chats</span>
            <button
              onClick={() => setSearching(true)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0"
              title="Search chats"
            >
              <FontAwesomeIcon icon={faSearch} className="text-xs" />
            </button>
            <button
              className="flex items-center gap-1 text-xs font-semibold text-white px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
              style={{ background: '#2a5f6f' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#1e4d5c')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#2a5f6f')}
              onClick={onNewChat}
            >
              <FontAwesomeIcon icon={faPlus} className="text-xs" />
              New Chat
            </button>
          </>
        )}

        {/* Close search */}
        {searching && (
          <button onClick={closeSearch} className="text-gray-400 hover:text-gray-600 shrink-0 ml-1">
            <FontAwesomeIcon icon={faTimes} className="text-xs" />
          </button>
        )}
      </div>

      {/* Search results — flat list when querying */}
      {searching && query.trim() ? (
        <div className="flex-1 overflow-y-auto py-1">
          {visibleChats.length === 0 ? (
            <p className="text-xs text-gray-400 text-center mt-8 px-4">No chats match "{query}"</p>
          ) : (
            visibleChats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                preview={previews[chat.id]}
                isActive={activeChatId === chat.id}
                onClick={() => { onSelectChat(chat.id); closeSearch(); }}
              />
            ))
          )}
        </div>
      ) : (
        <>
          {/* Tab strip */}
          <div className="flex border-b border-gray-200 bg-white">
            {(['recents', 'clients', 'projects'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="flex-1 py-2 text-xs font-semibold transition-colors"
                style={{
                  color: activeTab === t ? '#2a5f6f' : '#9ca3af',
                  borderBottom: activeTab === t ? '2px solid #2a5f6f' : '2px solid transparent',
                }}
              >
                {t === 'recents' ? 'Recents' : t === 'clients' ? 'Clients' : 'Projects'}
              </button>
            ))}
          </div>

          {/* Chat list */}
          <div className="flex-1 overflow-y-auto py-1">
            {chats.length === 0 ? (
              <p className="text-xs text-gray-400 text-center mt-8 px-4">
                No chats yet — hit <strong>New Chat</strong> to start.
              </p>
            ) : (
              <>
                {activeTab === 'recents' && (
                  <RecentsTab
                    chats={visibleChats}
                    activeChatId={activeChatId}
                    previews={previews}
                    expanded={expanded}
                    onToggle={toggle}
                    onSelect={onSelectChat}
                  />
                )}
                {activeTab === 'clients' && (
                  <ClientsTab
                    chats={visibleChats}
                    clients={clients}
                    activeChatId={activeChatId}
                    previews={previews}
                    expanded={expanded}
                    onToggle={toggle}
                    onSelect={onSelectChat}
                  />
                )}
                {activeTab === 'projects' && (
                  <ProjectsTab
                    chats={visibleChats}
                    activeChatId={activeChatId}
                    previews={previews}
                    expanded={expanded}
                    onToggle={toggle}
                    onSelect={onSelectChat}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Recents tab ───────────────────────────────────────────────────────────────

function RecentsTab({ chats, activeChatId, previews, expanded, onToggle, onSelect }: TabProps) {
  const sorted = [...chats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const grouped = new Map<string, Chat[]>();
  for (const chat of sorted) {
    const b = timeBucket(chat.updatedAt);
    if (!grouped.has(b)) grouped.set(b, []);
    grouped.get(b)!.push(chat);
  }
  return (
    <>
      {BUCKET_ORDER.filter((b) => grouped.has(b)).map((bucket) => (
        <Section
          key={bucket}
          sectionKey={bucket}
          label={BUCKET_LABELS[bucket]}
          chats={grouped.get(bucket)!}
          activeChatId={activeChatId}
          previews={previews}
          expanded={expanded.has(bucket)}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// ── Clients tab ───────────────────────────────────────────────────────────────

function ClientsTab({ chats, clients, activeChatId, previews, expanded, onToggle, onSelect }: TabProps & { clients: SidebarClient[] }) {
  const clientChats  = chats.filter((c) => c.clientId !== '');
  const generalChats = chats.filter((c) => c.clientId === '' && c.projectLabel === '');
  const activeClients = clients.filter((cl) => clientChats.some((c) => c.clientId === cl.id));
  const unknownIds = Array.from(
    new Set(clientChats.map((c) => c.clientId).filter((id) => !clients.some((cl) => cl.id === id)))
  );

  if (clientChats.length === 0 && generalChats.length === 0)
    return <p className="text-xs text-gray-400 text-center mt-8 px-4">No client chats yet.</p>;

  return (
    <>
      {activeClients.map((cl) => (
        <Section key={cl.id} sectionKey={`client:${cl.id}`} label={cl.preferredName} avatar={cl.initials}
          chats={clientChats.filter((c) => c.clientId === cl.id)} activeChatId={activeChatId}
          previews={previews} expanded={expanded.has(`client:${cl.id}`)} onToggle={onToggle} onSelect={onSelect} />
      ))}
      {unknownIds.map((id) => (
        <Section key={id} sectionKey={`client:${id}`} label="Unknown Client"
          chats={clientChats.filter((c) => c.clientId === id)} activeChatId={activeChatId}
          previews={previews} expanded={expanded.has(`client:${id}`)} onToggle={onToggle} onSelect={onSelect} />
      ))}
      {generalChats.length > 0 && (
        <Section sectionKey="client:general" label="General" chats={generalChats}
          activeChatId={activeChatId} previews={previews}
          expanded={expanded.has('client:general')} onToggle={onToggle} onSelect={onSelect} />
      )}
    </>
  );
}

// ── Projects tab ──────────────────────────────────────────────────────────────

function ProjectsTab({ chats, activeChatId, previews, expanded, onToggle, onSelect }: TabProps) {
  const projectChats = chats.filter((c) => c.clientId === '' && c.projectLabel !== '');
  const generalChats = chats.filter((c) => c.clientId === '' && c.projectLabel === '');
  const clientChats  = chats.filter((c) => c.clientId !== '');
  const labels = Array.from(new Set(projectChats.map((c) => c.projectLabel)));

  if (!projectChats.length && !generalChats.length && !clientChats.length)
    return <p className="text-xs text-gray-400 text-center mt-8 px-4">No project chats yet.</p>;

  return (
    <>
      {labels.map((label) => (
        <Section key={label} sectionKey={`project:${label}`} label={label}
          chats={projectChats.filter((c) => c.projectLabel === label)} activeChatId={activeChatId}
          previews={previews} expanded={expanded.has(`project:${label}`)} onToggle={onToggle} onSelect={onSelect} />
      ))}
      {generalChats.length > 0 && (
        <Section sectionKey="project:General" label="General" chats={generalChats}
          activeChatId={activeChatId} previews={previews}
          expanded={expanded.has('project:General')} onToggle={onToggle} onSelect={onSelect} />
      )}
      {clientChats.length > 0 && (
        <Section sectionKey="project:clients" label="Client Chats" chats={clientChats}
          activeChatId={activeChatId} previews={previews}
          expanded={expanded.has('project:clients')} onToggle={onToggle} onSelect={onSelect} />
      )}
    </>
  );
}

// ── Shared types ──────────────────────────────────────────────────────────────

interface TabProps {
  chats: Chat[];
  activeChatId: string | null;
  previews: Record<string, string>;
  expanded: Set<string>;
  onToggle: (k: string) => void;
  onSelect: (id: string) => void;
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ sectionKey, label, avatar, chats, activeChatId, previews, expanded, onToggle, onSelect }: {
  sectionKey: string; label: string; avatar?: string;
  chats: Chat[]; activeChatId: string | null; previews: Record<string, string>;
  expanded: boolean; onToggle: (k: string) => void; onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-0.5">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 transition-colors"
        onClick={() => onToggle(sectionKey)}
      >
        <FontAwesomeIcon
          icon={expanded ? faChevronDown : faChevronRight}
          className="text-gray-400 shrink-0"
          style={{ width: 10 }}
        />
        {avatar && (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold shrink-0"
            style={{ background: '#2a5f6f' }}
          >
            {avatar}
          </span>
        )}
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate flex-1 text-left">
          {label}
        </span>
        <span className="text-xs text-gray-400 shrink-0">{chats.length}</span>
      </button>

      {expanded && (
        <div>
          {chats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              preview={previews[chat.id]}
              isActive={activeChatId === chat.id}
              onClick={() => onSelect(chat.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chat row ──────────────────────────────────────────────────────────────────

function ChatRow({ chat, preview, isActive, onClick }: {
  chat: Chat; preview?: string; isActive: boolean; onClick: () => void;
}) {
  return (
    <button
      className="w-full text-left px-4 py-2.5 mb-0.5 transition-colors"
      style={isActive
        ? { background: '#e8f4f8', borderLeft: '3px solid #5fb3d0' }
        : { borderLeft: '3px solid transparent' }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#f9fafb'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      onClick={onClick}
    >
      <p className="text-sm font-medium truncate" style={{ color: isActive ? '#1e4d5c' : '#374151' }}>
        {chat.title || 'Untitled Chat'}
      </p>
      <p className="text-xs text-gray-400 truncate mt-0.5">
        {preview ?? formatDate(chat.updatedAt)}
      </p>
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}
