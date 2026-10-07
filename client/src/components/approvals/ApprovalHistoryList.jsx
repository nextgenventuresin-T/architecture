import Badge from '../ui/Badge';
import Skeleton from '../ui/Skeleton';
import { formatDateTime } from '../../utils/format';
import { ACTION_LABELS, ACTION_TONE, formatSourceStatus } from '../../utils/approvalOptions';

/**
 * The approval trail, oldest first: Submitted -> Approved, or Submitted ->
 * Rejected. Each entry shows the action, who took it, when, the comment they
 * left, and the status either side of it.
 *
 * Entries flagged `derived` were not recorded by this interface — they are
 * reconstructed from the source record (its requester and creation date, or a
 * decision taken inside the module's own screen). They are labelled as such
 * rather than presented as audit entries, because they carry no actor and no
 * comment and it would be misleading to show them as if they did.
 */
export default function ApprovalHistoryList({ history = [], isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="text-sm text-ink-muted">No history recorded for this request yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {history.map((entry, index) => (
        <li key={`${entry.action}-${entry.id}-${index}`} className="relative pl-6">
          {/* Connector line between entries, stopping at the last one. */}
          {index < history.length - 1 && (
            <span className="absolute left-[5px] top-4 h-full w-px bg-line" aria-hidden="true" />
          )}
          <span
            className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${
              entry.action === 'APPROVED'
                ? 'bg-emerald-500'
                : entry.action === 'REJECTED'
                  ? 'bg-danger'
                  : 'bg-brand-500'
            }`}
            aria-hidden="true"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ACTION_TONE[entry.action] ?? 'neutral'}>
              {ACTION_LABELS[entry.action] ?? entry.action}
            </Badge>
            <span className="text-sm text-ink">{entry.actor?.name || 'Unknown'}</span>
            {entry.actor?.role && (
              <span className="text-xs uppercase tracking-wide text-ink-subtle">{entry.actor.role}</span>
            )}
            <span className="text-xs text-ink-subtle">{formatDateTime(entry.at)}</span>
            {entry.derived && (
              <span className="rounded border border-line px-1.5 py-0.5 text-[0.7rem] text-ink-subtle">
                from record
              </span>
            )}
          </div>

          {(entry.previousStatus || entry.newStatus) && (
            <p className="mt-1 text-xs text-ink-subtle">
              {formatSourceStatus(entry.previousStatus)} → {formatSourceStatus(entry.newStatus)}
            </p>
          )}

          {entry.comment && (
            <p className="mt-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-muted">
              {entry.comment}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
