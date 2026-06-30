import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { SearchResponse } from '../types';
import {
  AiSummaryCard, HitCard, FilterChip, SearchSkeleton, FILTER_TABS,
  type FilterType,
} from './SearchView';

interface Props {
  onClose: () => void;
  /** Navigate to a result. The modal closes itself after calling this. */
  onNavigate: (type: string, id: string) => void;
}

/**
 * Workspace search as a centered command-palette style modal, opened from the
 * top-bar search icon (or Ctrl/⌘+K). Reuses the SearchView result components.
 */
export default function SearchModal({ onClose, onNavigate }: Props) {
  const [query, setQuery]         = useState('');
  const [committed, setCommitted] = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<SearchResponse | null>(null);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState<FilterType>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the input, and close on Escape.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setCommitted(trimmed);
    setLoading(true);
    setError('');
    setResult(null);
    setFilter('all');
    try {
      setResult(await api.search(trimmed));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (type: string, id: string) => {
    onNavigate(type, id);
    onClose();
  };

  const allHits = result?.hits ?? [];
  const visible = filter === 'all' ? allHits : allHits.filter((h) => h.type === filter);
  const counts  = allHits.reduce<Record<string, number>>((acc, h) => {
    acc[h.type] = (acc[h.type] ?? 0) + 1;
    return acc;
  }, {});
  const hasResults = allHits.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4"
      style={{ background: 'rgba(15, 35, 45, 0.45)', paddingTop: '10vh' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search workspace"
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '78vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Input row ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          <FontAwesomeIcon
            icon={loading ? faSpinner : faSearch}
            className={`text-gray-400 text-base ${loading ? 'animate-spin' : ''}`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(query); }}
            placeholder="Search chats, projects, clients, resources…"
            aria-label="Search query"
            className="flex-1 text-base text-gray-800 placeholder-gray-400 bg-transparent focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="text-gray-400 hover:text-gray-600 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-50"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* ── Results ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && <SearchSkeleton />}

          {!loading && !result && !error && (
            <p className="text-sm text-gray-400 text-center py-10">
              Type a search term and press <kbd className="px-1.5 py-0.5 rounded border border-gray-300 text-xs">Enter</kbd>.
              Results are limited to what you’re permitted to see.
            </p>
          )}

          {!loading && result && (
            <div className="space-y-5">
              {(result.summary || result.summaryDecision === 'BLOCK' || result.summaryDecision === 'ESCALATE') && (
                <AiSummaryCard summary={result.summary} query={committed} decision={result.summaryDecision} />
              )}

              {!hasResults && (
                <div className="text-center py-10 text-gray-400">
                  <FontAwesomeIcon icon={faSearch} className="text-3xl mb-3 text-gray-300" />
                  <p className="text-base font-medium">No results found</p>
                  <p className="text-sm mt-1">Try different keywords or check your access.</p>
                </div>
              )}

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

              {visible.length > 0 && (
                <div className="space-y-2">
                  {visible.map((hit, idx) => (
                    <HitCard
                      key={`${hit.type}-${hit.id}-${idx}`}
                      hit={hit}
                      onClick={() => handleNavigate(hit.type, hit.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
