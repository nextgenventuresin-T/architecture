import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Eye, ClipboardCheck, ArrowUpRight } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import Select from '../ui/Select';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import { formatCurrency, formatDate } from '../../utils/format';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'all', label: 'All requests' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/**
 * Requests waiting on the Admin. Decisions update immediately through
 * `onDecide`, which the parent routes to the API layer.
 */
export default function ApprovalsQueue({ approvals = [], isLoading, onDecide }) {
  const [filter, setFilter] = useState('pending');

  const visible = useMemo(
    () => (filter === 'all' ? approvals : approvals.filter((item) => item.status === filter)),
    [approvals, filter]
  );

  return (
    <Card>
      <CardHeader
        title="Pending admin approvals"
        description="Finance, procurement and contractor requests raised for your decision"
        action={
          <>
            <Select label="Filter approvals" value={filter} onChange={(e) => setFilter(e.target.value)} options={FILTERS} className="w-[150px]" />
            <Link
              to="/admin/approvals"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              View all
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing waiting on you"
          description="Approved and rejected requests stay available under the filter above."
        />
      ) : (
        <>
          {/* Table on wide screens */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th scope="col" className="px-5 py-3 font-medium">Request</th>
                  <th scope="col" className="px-5 py-3 font-medium">Requested by</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-3 font-medium">Date</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-canvas/60">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-ink">{item.type}</p>
                      <p className="mt-0.5 text-xs text-ink-subtle">{item.project}</p>
                    </td>
                    <td className="px-5 py-3.5 text-ink-muted">{item.requestedBy}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-ink">
                      {item.amount ? formatCurrency(item.amount) : '—'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-ink-muted">{formatDate(item.date)}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={item.status} /></td>
                    <td className="px-5 py-3.5">
                      <ApprovalActions item={item} onDecide={onDecide} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stacked cards below lg, where a six-column table cannot breathe */}
          <ul className="divide-y divide-line lg:hidden">
            {visible.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{item.type}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{item.requestedBy}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">{item.project}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="tabular-nums text-ink">
                    {item.amount ? formatCurrency(item.amount) : 'No amount'}
                  </span>
                  <span className="text-ink-subtle">{formatDate(item.date)}</span>
                </div>
                <div className="mt-3">
                  <ApprovalActions item={item} onDecide={onDecide} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function ApprovalActions({ item, onDecide }) {
  if (item.status !== 'pending') {
    return (
      <div className="flex justify-end">
        <Link
          to="/admin/approvals"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-canvas"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          View
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link
        to="/admin/approvals"
        aria-label={`View ${item.type} from ${item.requestedBy}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View
      </Link>
      <button
        type="button"
        onClick={() => onDecide(item.id, 'approved')}
        aria-label={`Approve ${item.type} from ${item.requestedBy}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Approve
      </button>
      <button
        type="button"
        onClick={() => onDecide(item.id, 'rejected')}
        aria-label={`Reject ${item.type} from ${item.requestedBy}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger-soft"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Reject
      </button>
    </div>
  );
}
