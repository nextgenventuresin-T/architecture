import { Wallet, Receipt, HardHat, ShoppingCart, CheckCircle2, Hourglass, AlertCircle, Users } from 'lucide-react';
import { formatCompactCurrency } from '../../utils/format';

/**
 * Headline financial figures. Every value comes from GET /finance/summary,
 * which derives them from projects.estimated_budget, expenses,
 * contractor_payments, procurement_requests and labour_records — nothing
 * here is hardcoded.
 */
export default function FinanceSummary({ summary, onSelectTab }) {
  const cards = [
    {
      label: 'Total project budget',
      value: formatCompactCurrency(summary.totalProjectBudget),
      icon: Wallet,
      tone: 'text-brand-600 bg-brand-50',
      hint: `${summary.counts.projects} active projects`,
      tab: 'projects',
    },
    {
      label: 'Total expenses',
      value: formatCompactCurrency(summary.totalExpenses),
      icon: Receipt,
      tone: 'text-brand-600 bg-brand-50',
      hint: `${summary.counts.expenses} recorded`,
      tab: 'expenses',
    },
    {
      label: 'Contractor payments',
      value: formatCompactCurrency(summary.contractorPayments),
      icon: HardHat,
      tone: 'text-amber-700 bg-amber-50',
      hint: `of ${formatCompactCurrency(summary.contractorContractValue)} contracted`,
      tab: 'contractor-payments',
    },
    {
      label: 'Procurement value',
      value: formatCompactCurrency(summary.procurementValue),
      icon: ShoppingCart,
      tone: 'text-brand-600 bg-brand-50',
      hint: `${formatCompactCurrency(summary.procurementReceivedValue)} received`,
      tab: 'procurement',
    },
    {
      label: 'Labour cost',
      value: formatCompactCurrency(summary.labourCost),
      icon: Users,
      tone: 'text-amber-700 bg-amber-50',
      hint: `${summary.counts.labourRecords} attendance records`,
    },
    {
      label: 'Paid amount',
      value: formatCompactCurrency(summary.paidAmount),
      icon: CheckCircle2,
      tone: 'text-emerald-700 bg-emerald-50',
      hint: 'Paid expenses + contractor payments',
      tab: 'payments',
    },
    {
      label: 'Pending payments',
      value: formatCompactCurrency(summary.pendingPayments),
      icon: Hourglass,
      tone: 'text-amber-700 bg-amber-50',
      hint: `${summary.counts.pendingExpenses} awaiting approval`,
      tab: 'payments',
    },
    {
      label: 'Outstanding amount',
      value: formatCompactCurrency(summary.outstandingAmount),
      icon: AlertCircle,
      tone: 'text-danger bg-danger-soft',
      hint: 'Contract value not yet paid',
      tab: 'contractor-payments',
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-8">
      {cards.map((card) => {
        const inner = (
          <>
            <div className="flex items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
                <card.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold tabular-nums leading-tight text-ink">{card.value}</p>
                <p className="truncate text-xs text-ink-subtle">{card.label}</p>
              </div>
            </div>
            {card.hint && <p className="mt-2 truncate text-[0.7rem] text-ink-subtle">{card.hint}</p>}
          </>
        );

        return onSelectTab && card.tab ? (
          <button
            key={card.label}
            type="button"
            onClick={() => onSelectTab(card.tab)}
            aria-label={`${card.label} — open ${card.tab.replace('-', ' ')}`}
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
