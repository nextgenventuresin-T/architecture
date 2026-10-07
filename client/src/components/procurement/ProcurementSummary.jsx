import { FileText, Hourglass, CheckCircle2, ShoppingCart, PackageCheck, IndianRupee } from 'lucide-react';
import { formatCompactCurrency, formatNumber } from '../../utils/format';

/** Headline request counts and value above the procurement table. */
export default function ProcurementSummary({ summary, onSelectStatus }) {
  const cards = [
    { label: 'Total requests', value: formatNumber(summary.total), icon: FileText, tone: 'text-brand-600 bg-brand-50', status: 'all' },
    {
      label: 'Pending approval',
      value: formatNumber(summary.pendingApproval),
      icon: Hourglass,
      tone: 'text-amber-700 bg-amber-50',
      status: 'pending_approval',
    },
    {
      label: 'Approved',
      value: formatNumber(summary.approved),
      icon: CheckCircle2,
      tone: 'text-emerald-700 bg-emerald-50',
      status: 'approved',
    },
    {
      label: 'Ordered',
      value: formatNumber(summary.ordered),
      icon: ShoppingCart,
      tone: 'text-brand-600 bg-brand-50',
      status: 'ordered',
    },
    {
      label: 'Partially / fully received',
      value: formatNumber(summary.partiallyReceived + summary.received),
      icon: PackageCheck,
      tone: 'text-emerald-700 bg-emerald-50',
      status: 'received',
    },
    {
      label: 'Estimated value',
      value: formatCompactCurrency(summary.estimatedValue),
      icon: IndianRupee,
      tone: 'text-brand-600 bg-brand-50',
      status: 'all',
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const inner = (
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

        return onSelectStatus ? (
          <button
            key={card.label}
            type="button"
            onClick={() => onSelectStatus(card.status)}
            aria-label={`${card.label} — filter the list`}
            className="card-interactive block rounded-xl border border-line bg-white px-4 py-3.5 text-left"
          >
            {inner}
          </button>
        ) : (
          <div key={card.label} className="rounded-xl border border-line bg-white px-4 py-3.5">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
