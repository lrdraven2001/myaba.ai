import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faSpinner, faTimes, faUser, faProjectDiagram,
  faFileAlt, faFolderOpen, faCommentDots, faRobot,
  faExclamationCircle, faShieldAlt, faLock, faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { ACLXDecision, SearchHit, SearchHitType, SearchResponse } from '../types';

// ── Hit-type metadata ─────────────────────────────────────────────────────────

const TYPE_META: Record<SearchHitType, {
  label: string;
  icon: typeof faSearch;
  bg: string;
  text: string;
}> = {
  client:   { label: 'Client',   icon: faUser,          bg: '#e0f2fe', text: '#0369a1' },
  project:  { label: 'Project',  icon: faProjectDiagram, bg: '#ede9fe', text: '#6d28d9' },
  resource: { label: 'Resource', icon: faFileAlt,        bg: '#dcfce7', text: '#166534' },
  template: { label: 'Template', icon: faFolderOpen,     bg: '#fef9c3', text: '#854d0e' },
  chat:     { label: 'Chat',     icon: faCommentDots,    bg: '#f3f4f6', text: '#374151' },
};

export type FilterType = SearchHitType | 'all';

export const FILTER_TABS: { id: FilterType; label: string }[] = [
  { id: 'all',      label: 'All'       },
  { id: 'chat',     label: 'Chats'     },
  { id: 'project',  label: 'Projects'  },
  { id: 'client',   label: 'Clients'   },
  { id: 'resource', label: 'Resources' },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (type: string, id: string) => void;
}

// ── Main view ──────────────────────────────────────────────────────────────────

export default function SearchView({ onNavigate }: Props) {
  const [query, setQuery]           = useState('');
  const [committed, setCommitted]   = useState(''); // last searched term
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<SearchResponse | null>(null);
  const [error, setError]           = useState('');
  const [filter, setFilter]         = useState<FilterType>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setCommitted(trimmed);
    setLoading(true);
    setError('');
    setResult(null);
    setFilter('all');
    try {
      const res = await api.search(trimmed);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') runSearch(query);
  };

  const handleClear = () => {
    setQuery('');
    setResult(null);
    setError('');
    setCommitted('');
    inputRef.current?.focus();
  };

  // Filter hits
  const allHits  = result?.hits ?? [];
  const visible  = filter === 'all' ? allHits : allHits.filter((h) => h.type === filter);

  // Count per type
  const counts = allHits.reduce<Record<string, number>>((acc, h) => {
    acc[h.type] = (acc[h.type] ?? 0) + 1;
    return acc;
  }, {});

  const hasResults = allHits.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

      {/* ── Search bar header ───────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div>
          {/* Input */}
          <div className="relative flex items-center">
            <FontAwesomeIcon
              icon={loading ? faSpinner : faSearch}
              className={`absolute left-4 text-gray-400 text-sm ${loading ? 'animate-spin' : ''}`}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search chats, projects, clients, resources…"
              className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 transition-colors bg-white"
            />
            {query && (
              <button
                onClick={handleClear}
                className="absolute right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="text-sm" />
              </button>
            )}
          </div>

          {/* Search button */}
          <div className="mt-3">
            <button
              onClick={() => runSearch(query)}
              disabled={!query.trim() || loading}
              className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: '#2a5f6f' }}
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="space-y-5">


          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && <SearchSkeleton />}

          {/* Results */}
          {!loading && result && (
            <>
              {/* AI summary — shown only when ACLX permits */}
              {(result.summary || result.summaryDecision === 'BLOCK' || result.summaryDecision === 'ESCALATE') && (
                <AiSummaryCard
                  summary={result.summary}
                  query={committed}
                  decision={result.summaryDecision}
                />
              )}

              {/* No results */}
              {!hasResults && (
                <div className="text-center py-12 text-gray-400">
                  <FontAwesomeIcon icon={faSearch} className="text-4xl mb-3 text-gray-300" />
                  <p className="text-base font-medium">No results found</p>
                  <p className="text-sm mt-1">
                    Try different keywords, or check you have access to the content you're looking for.
                  </p>
                </div>
              )}

              {/* Filter tabs */}
              {hasResults && (
                <div className="flex gap-1.5 flex-wrap">
                  {FILTER_TABS.map(({ id, label }) => {
                    const count = id === 'all' ? allHits.length : (counts[id] ?? 0);
                    if (count === 0 && id !== 'all') return null;
                    return (
                      <FilterChip
                        key={id}
                        label={label}
                        count={count}
                        active={filter === id}
                        onClick={() => setFilter(id)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Hit cards */}
              {visible.length > 0 && (
                <div className="space-y-2">
                  {visible.map((hit, idx) => (
                    <HitCard
                      key={`${hit.type}-${hit.id}-${idx}`}
                      hit={hit}
                      onClick={() => onNavigate(hit.type, hit.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI summary card ───────────────────────────────────────────────────────────

export function AiSummaryCard({
  summary, query, decision,
}: {
  summary: string;
  query: string;
  decision: ACLXDecision | null;
}) {
  // BLOCK / ESCALATE — no summary text is shown; surface a compliance notice instead
  if (decision === 'BLOCK') {
    return (
      <div className="rounded-xl border p-4 flex gap-3 bg-red-50 border-red-200">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-red-100">
          <FontAwesomeIcon icon={faLock} className="text-red-600 text-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">
            Summary Blocked · ACLX
          </p>
          <p className="text-sm text-red-600 leading-relaxed">
            The AI-generated summary was blocked by the ACLX compliance policy. Individual
            results below are still available based on your access permissions.
          </p>
        </div>
      </div>
    );
  }

  if (decision === 'ESCALATE') {
    return (
      <div className="rounded-xl border p-4 flex gap-3 bg-amber-50 border-amber-200">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-amber-100">
          <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 text-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            Summary Pending Review · ACLX
          </p>
          <p className="text-sm text-amber-700 leading-relaxed">
            The AI-generated summary has been flagged for human review and is not yet available.
            Individual results below remain accessible based on your permissions.
          </p>
        </div>
      </div>
    );
  }

  // ALLOW / REDACT — show the (potentially redacted) summary text
  if (!summary) return null;

  return (
    <div
      className="rounded-xl border p-4 flex gap-3"
      style={{ background: '#f0f9fb', borderColor: '#b2dce8' }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: '#2a5f6f' }}
      >
        <FontAwesomeIcon icon={faRobot} className="text-white text-sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
            AI Summary · "{query}"
          </p>
          {decision === 'REDACT' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
              <FontAwesomeIcon icon={faShieldAlt} className="text-xs" />
              PHI redacted
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}

// ── Hit card ──────────────────────────────────────────────────────────────────

export function HitCard({ hit, onClick }: { hit: SearchHit; onClick: () => void }) {
  const meta = TYPE_META[hit.type] ?? TYPE_META.resource;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-teal-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: meta.bg }}
        >
          <FontAwesomeIcon icon={meta.icon} style={{ color: meta.text, fontSize: 13 }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900 truncate group-hover:text-teal-700 transition-colors">
              {hit.title}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
              style={{ background: meta.bg, color: meta.text }}
            >
              {meta.label}
            </span>
          </div>
          {hit.snippet && (
            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
              {hit.snippet}
            </p>
          )}
        </div>

        <FontAwesomeIcon
          icon={faSearch}
          className="text-gray-300 group-hover:text-teal-400 transition-colors text-xs shrink-0 mt-1.5"
        />
      </div>
    </button>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────

export function FilterChip({
  label, count, active, onClick,
}: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors"
      style={
        active
          ? { background: '#2a5f6f', color: 'white', borderColor: '#2a5f6f' }
          : { background: 'white', color: '#6b7280', borderColor: '#d1d5db' }
      }
    >
      {label}
      <span
        className="px-1.5 py-0.5 rounded-full text-xs font-bold"
        style={active ? { background: 'rgba(255,255,255,0.25)' } : { background: '#f3f4f6' }}
      >
        {count}
      </span>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="py-12 text-gray-400">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: '#e8f4f8' }}
      >
        <FontAwesomeIcon icon={faSearch} style={{ fontSize: 24, color: '#2a5f6f' }} />
      </div>
      <h2 className="text-base font-semibold text-gray-700 mb-1">Search your workspace</h2>
      <p className="text-sm leading-relaxed mb-4" style={{ maxWidth: 420 }}>
        Find chats, projects, clients, and resources in one place.
        Results are filtered to what you're permitted to see.
      </p>
      <div className="flex flex-wrap gap-2">
        {(['Chats', 'Projects', 'Clients', 'Resources'] as const).map((label) => (
          <span
            key={label}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-500"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function SearchSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {/* AI summary skeleton */}
      <div className="rounded-xl h-20 bg-gray-100" />
      {/* Hit skeletons */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-100 rounded w-1/3" />
            <div className="h-3 bg-gray-100 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
