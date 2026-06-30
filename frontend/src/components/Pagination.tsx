import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

/**
 * Client-side pagination for in-memory lists (chats, documents, clients,
 * knowledge facts…). Returns the current page slice + controls. Pair with
 * the {@link Pagination} control below.
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp the page if the list shrinks (e.g. after a filter or delete).
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return {
    page,
    setPage,
    pageItems,
    totalPages,
    total,
    pageSize,
    start: total === 0 ? 0 : (page - 1) * pageSize + 1,
    end: Math.min(page * pageSize, total),
    canPrev: page > 1,
    canNext: page < totalPages,
    next: () => setPage((p) => Math.min(p + 1, totalPages)),
    prev: () => setPage((p) => Math.max(p - 1, 1)),
    reset: () => setPage(1),
  };
}

export type PaginationState = ReturnType<typeof usePagination>;

/** Pagination control — pass a {@link usePagination} result. Renders nothing for a single page. */
export function Pagination({ state, label = 'items', className = '' }: {
  state: Pick<PaginationState, 'page' | 'totalPages' | 'total' | 'start' | 'end' | 'canPrev' | 'canNext' | 'prev' | 'next'>;
  label?: string;
  className?: string;
}) {
  if (state.totalPages <= 1) return null;
  const btn = 'w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className={`flex items-center justify-between mt-3 text-xs text-gray-500 ${className}`}>
      <span>Showing {state.start}–{state.end} of {state.total} {label}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous page" onClick={state.prev} disabled={!state.canPrev} className={btn}>
          <FontAwesomeIcon icon={faChevronLeft} style={{ fontSize: 11 }} />
        </button>
        <span className="tabular-nums">Page {state.page} of {state.totalPages}</span>
        <button type="button" aria-label="Next page" onClick={state.next} disabled={!state.canNext} className={btn}>
          <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 11 }} />
        </button>
      </div>
    </div>
  );
}
