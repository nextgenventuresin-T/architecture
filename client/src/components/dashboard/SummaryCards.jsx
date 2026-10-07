import { Link } from 'react-router-dom';
import { Building2, MapPin, HardHat, Users, ClipboardCheck, Package, Wallet } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import { formatNumber, formatCompactCurrency } from '../../utils/format';

/**
 * Two rows with different jobs: the portfolio counts describe the organisation,
 * the attention row lists things waiting on the Admin. Keeping them visually
 * separate stops seven equal cards reading as noise.
 */
export default function SummaryCards({ summary, isLoading }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px]" />
        ))}
      </div>
    );
  }

  const portfolio = [
    { label: 'Total projects', value: formatNumber(summary.totalProjects), icon: Building2, to: '/admin/projects' },
    { label: 'Active sites', value: formatNumber(summary.activeSites), icon: MapPin, to: '/admin/projects' },
    { label: 'Active contractors', value: formatNumber(summary.activeContractors), icon: HardHat, to: '/admin/contractors' },
    { label: 'Total employees', value: formatNumber(summary.totalEmployees), icon: Users, to: '/admin/employees' },
  ];

  const attention = [
    { label: 'Pending approvals', value: formatNumber(summary.pendingApprovals), icon: ClipboardCheck, to: '/admin/approvals', hint: 'Waiting on you' },
    { label: 'Material requests', value: formatNumber(summary.materialRequests), icon: Package, to: '/admin/materials', hint: 'Open this week' },
    { label: 'Outstanding payments', value: formatCompactCurrency(summary.outstandingPayments), icon: Wallet, to: '/admin/finance', hint: 'Across 3 contractors' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {portfolio.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {attention.map((card) => (
          <MetricCard key={card.label} {...card} accent />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, to, hint, accent = false }) {
  return (
    <Link
      to={to}
      className={[
        'card-interactive group flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-card sm:p-5',
        accent ? 'border-brand-200 bg-brand-50/40 hover:border-brand-300' : 'border-line hover:border-brand-200',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-ink-muted">{label}</span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            accent ? 'bg-brand-100 text-brand-700' : 'bg-canvas text-ink-muted group-hover:text-brand-700'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </Link>
  );
}
