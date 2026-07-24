import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faChevronDown, faChevronRight, faChevronLeft,
  faSearch, faTimes, faTrash,
} from '@fortawesome/free-solid-svg-icons';
import type { Chat } from '../../types';
import { usePagination, Pagination } from '../Pagination';

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
  onDeleteChat?: (id: string) => void;
}

// ── Time bucket helpers ───────────────────────────────────────────────────────

function timeBucket(iso: string): 'last5' | 'lastweek' | 'older' {
  try {
    const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
    if (days <= 5)  return 'last5';
    if (days <= 14) return 'lastweek';
    return 'older';
  } catch { return 'older'; }
}

const BUCKET_LABELS: Record<string, string> = {
  last5:    'Last 5 days',
  lastweek: 'Last week',
  older:    'Older',
};
const BUCKET_ORDER = ['last5', 'lastweek', 'older'];

/** Scope label/color for a chat — General, Client, or Project. */
function chatScope(chat: Chat): { label: string; color: string } {
  if (chat.clientId)     return { label: 'Client',  color: '#1E88FF' };
  if (chat.projectLabel) return { label: 'Project', color: '#F5A623' };
  return { label: 'General', color: '#6b7280' };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatSidebar({
  chats,
  clients,
  activeChatId,
  previews = {},
  onSelectChat,
  onNewChat,
  onDeleteChat,
}: Props) {
  const [activeTab, setActiveTab]   = useState<Tab>('recents');
  const [collapsed, setCollapsed]   = useState(true); // minimized on first load
  const [searching, setSearching]   = useState(false);
  const [query, setQuery]           = useState('');
  const searchRef                   = useRef<HTMLInputElement>(null);

  // Which section keys are expanded (e.g. "today", "client:c-001", "project:Q3")
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['last5', 'lastweek', 'older']));

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

        {/* New chat — only when inside an active chat, not on landing page */}
        {activeChatId && (
          <button
            onClick={onNewChat}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: '#EEF7EA', border: '1.5px solid #55C943', color: '#3F9B2F' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#D6F0CC')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#EEF7EA')}
            title="New chat"
          >
            <FontAwesomeIcon icon={faPlus} className="text-xs" />
          </button>
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

        {/* Search icon — always visible */}
        <button
          onClick={() => setSearching((s) => !s)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          style={{ color: searching ? '#3F9B2F' : '#A8B4BF' }}
          title={searching ? 'Close search' : 'Search chats'}
        >
          <FontAwesomeIcon icon={searching ? faTimes : faSearch} className="text-xs" />
        </button>

        {/* New chat box — only shown when a chat is active (landing page handles it otherwise) */}
        {activeChatId && !searching && (
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-colors"
            style={{ background: '#EEF7EA', border: '1.5px solid #55C943', color: '#3F9B2F' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#D6F0CC')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#EEF7EA')}
            onClick={onNewChat}
            title="New chat"
          >
            <FontAwesomeIcon icon={faPlus} className="text-xs" />
          </button>
        )}

        {/* Input box — a real search field once search is active; when idle it's a
            "New chat" click-target. Clicking the idle box starts a new chat (so the
            "New chat…" label matches what clicking it does); search is the magnifier
            icon, which flips this into an editable search field. */}
        <div
          className={`flex-1 flex items-center rounded-lg px-2.5 py-1.5 transition-colors ${searching ? '' : 'cursor-pointer'}`}
          style={{
            background: searching ? '#f0faf0' : '#F4F7F9',
            border: searching ? '1.5px solid #55C943' : '1.5px solid #DCE7EE',
          }}
          onClick={() => { if (!searching) onNewChat(); }}
        >
          <input
            ref={searchRef}
            type="text"
            value={query}
            readOnly={!searching}
            onChange={(e) => { setSearching(true); setQuery(e.target.value); }}
            placeholder={searching ? 'Search chats…' : 'New chat…'}
            className={`flex-1 bg-transparent text-sm outline-none min-w-0 ${searching ? '' : 'pointer-events-none'}`}
            style={{ color: '#1E3347' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch();
              if (e.key === 'Enter' && !query.trim()) { closeSearch(); onNewChat(); }
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 shrink-0 ml-1">
              <FontAwesomeIcon icon={faTimes} style={{ fontSize: 10 }} />
            </button>
          )}
        </div>
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
                onDelete={onDeleteChat}
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
                {t === 'recents' ? 'All' : t === 'clients' ? 'Clients' : 'Projects'}
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
                    onDelete={onDeleteChat}
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
                    onDelete={onDeleteChat}
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
                    onDelete={onDeleteChat}
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

function RecentsTab({ chats, activeChatId, previews, expanded, onToggle, onSelect, onDelete }: TabProps) {
  const sorted = [...chats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const pg = usePagination(sorted, 20);
  // Group the current page by date bucket (Last 5 days / Last week / Older).
  const grouped = new Map<string, Chat[]>();
  for (const chat of pg.pageItems) {
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
          onDelete={onDelete}
        />
      ))}
      <div className="px-3"><Pagination state={pg} label="chats" /></div>
    </>
  );
}

// ── Clients tab ───────────────────────────────────────────────────────────────

function ClientsTab({ chats, clients, activeChatId, previews, expanded, onToggle, onSelect, onDelete }: TabProps & { clients: SidebarClient[] }) {
  // Clients tab shows only client-scoped chats — no general or project chats.
  const clientChats  = chats.filter((c) => c.clientId !== '');
  const activeClients = clients.filter((cl) => clientChats.some((c) => c.clientId === cl.id));
  const unknownIds = Array.from(
    new Set(clientChats.map((c) => c.clientId).filter((id) => !clients.some((cl) => cl.id === id)))
  );

  if (clientChats.length === 0)
    return <p className="text-xs text-gray-400 text-center mt-8 px-4">No client chats yet.</p>;

  return (
    <>
      {activeClients.map((cl) => (
        <Section key={cl.id} sectionKey={`client:${cl.id}`} label={cl.preferredName} avatar={cl.initials}
          chats={clientChats.filter((c) => c.clientId === cl.id)} activeChatId={activeChatId}
          previews={previews} expanded={expanded.has(`client:${cl.id}`)} onToggle={onToggle}
          onSelect={onSelect} onDelete={onDelete} />
      ))}
      {unknownIds.map((id) => (
        <Section key={id} sectionKey={`client:${id}`} label="Unknown Client"
          chats={clientChats.filter((c) => c.clientId === id)} activeChatId={activeChatId}
          previews={previews} expanded={expanded.has(`client:${id}`)} onToggle={onToggle}
          onSelect={onSelect} onDelete={onDelete} />
      ))}
    </>
  );
}

// ── Projects tab ──────────────────────────────────────────────────────────────

function ProjectsTab({ chats, activeChatId, previews, expanded, onToggle, onSelect, onDelete }: TabProps) {
  // Projects tab shows only project-scoped chats — no general or client chats.
  const projectChats = chats.filter((c) => c.clientId === '' && c.projectLabel !== '');
  const labels = Array.from(new Set(projectChats.map((c) => c.projectLabel)));

  if (!projectChats.length)
    return <p className="text-xs text-gray-400 text-center mt-8 px-4">No project chats yet.</p>;

  return (
    <>
      {labels.map((label) => (
        <Section key={label} sectionKey={`project:${label}`} label={label}
          chats={projectChats.filter((c) => c.projectLabel === label)} activeChatId={activeChatId}
          previews={previews} expanded={expanded.has(`project:${label}`)} onToggle={onToggle}
          onSelect={onSelect} onDelete={onDelete} />
      ))}
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
  onDelete?: (id: string) => void;
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ sectionKey, label, avatar, chats, activeChatId, previews, expanded, onToggle, onSelect, onDelete }: {
  sectionKey: string; label: string; avatar?: string;
  chats: Chat[]; activeChatId: string | null; previews: Record<string, string>;
  expanded: boolean; onToggle: (k: string) => void; onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
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
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chat row ──────────────────────────────────────────────────────────────────

function ChatRow({ chat, preview, isActive, onClick, onDelete }: {
  chat: Chat; preview?: string; isActive: boolean; onClick: () => void;
  onDelete?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative mb-0.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className="w-full text-left px-4 py-2.5 transition-colors pr-8"
        style={isActive
          ? { background: '#e8f4f8', borderLeft: '3px solid #5fb3d0' }
          : { borderLeft: '3px solid transparent', background: hovered ? '#f9fafb' : 'transparent' }}
        onClick={onClick}
      >
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate flex-1" style={{ color: isActive ? '#1e4d5c' : '#374151' }}>
            {chat.title || 'Untitled Chat'}
          </p>
          {(() => { const s = chatScope(chat); return (
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
              style={{ background: `${s.color}1A`, color: s.color }}>{s.label}</span>
          ); })()}
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">
          {preview ?? formatDate(chat.updatedAt)}
        </p>
      </button>

      {/* Delete button — appears on hover */}
      {onDelete && hovered && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: '#9ca3af' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fee2e2'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent'; }}
          onClick={(e) => { e.stopPropagation(); onDelete(chat.id); }}
          title="Delete chat"
        >
          <FontAwesomeIcon icon={faTrash} style={{ fontSize: 10 }} />
        </button>
      )}
    </div>
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
