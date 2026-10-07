import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page stepper for the project list. Hidden when everything fits on one page. */
export default function Pagination({ pagination, onChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, pageSize } = pagination;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const button = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
      <p className="text-sm text-ink-muted">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={button} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </button>
        <span className="text-sm tabular-nums text-ink-muted">Page {page} of {totalPages}</span>
        <button type="button" className={button} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
