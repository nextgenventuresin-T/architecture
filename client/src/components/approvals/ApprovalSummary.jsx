import { Hourglass, CheckCircle2, XCircle, Layers, UserCheck } from 'lucide-react';
import { formatNumber } from '../../utils/format';

/**
 * The five headline counts required by the brief, above the approvals table.
 * Every figure is scoped server-side to what the signed-in user may see, so
 * an HR user's "Total" is their labour queue, not the whole organisation's.
 */
export default function ApprovalSummary({ summary, onSelectFilters }) {
  const today = new Date().toISOString().slice(0, 10);

  const cards = [
    {
      key: 'pending',
      label: 'Pending approvals',
      value: formatNumber(summary.pending),
      icon: Hourglass,
      tone: 'text-amber-700 bg-amber-50',
      filters: { status: 'pending' },
    },
    {
      key: 'approvedToday',
      label: 'Approved today',
      value: formatNumber(summary.approvedToday),
      icon: CheckCircle2,
      tone: 'text-emerald-700 bg-emerald-50',
      filters: { status: 'approved', dateFrom: today, dateTo: today },
    },
    {
      key: 'rejectedToday',
      label: 'Rejected today',
      value: formatNumber(summary.rejectedToday),
      icon: XCircle,
      tone: 'text-danger bg-danger-soft',
      filters: { status: 'rejected', dateFrom: today, dateTo: today },
    },
    {
      key: 'total',
      label: 'Total approvals',
      value: formatNumber(summary.total),
      icon: Layers,
      tone: 'text-brand-600 bg-brand-50',
      filters: { status: 'all' },
    },
    {
      key: 'myPending',
      label: 'My pending approvals',
      value: formatNumber(summary.myPending),
      icon: UserCheck,
      tone: 'text-brand-600 bg-brand-50',
      filters: { status: 'pending' },
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const content = (
          <div className="flex items-center gap-2.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
              <card.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold tabular-nums leading-tight text-ink">{card.value}</p>
              <p className="truncate text-xs text-ink-subtle">{card.label}</p>
            </div>
          </div>
        );

        return onSelectFilters ? (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelectFilters(card.filters)}
            aria-label={`${card.label} — filter the queue`}
            className="card-interactive block rounded-xl border border-line bg-white px-4 py-3.5 text-left hover:bg-brand-50/40"
          >
            {content}
          </button>
        ) : (
          <div key={card.key} className="rounded-xl border border-line bg-white px-4 py-3.5">
            {content}
          </div>
        );
      })}
    </div>
  );
}
