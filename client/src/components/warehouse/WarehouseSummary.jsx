import { Warehouse, Package, Layers, TrendingDown, PackageX, ArrowDownToLine } from 'lucide-react';
import { formatNumber } from '../../utils/format';

/**
 * Headline stock figures above the warehouse tables. Every value comes from
 * GET /warehouse/summary, which derives them from warehouse_stock and
 * warehouse_transactions — nothing here is hardcoded.
 */
export default function WarehouseSummary({ summary, onSelectTab }) {
  const cards = [
    {
      label: 'Total warehouses',
      value: formatNumber(summary.totalWarehouses),
      icon: Warehouse,
      tone: 'text-brand-600 bg-brand-50',
      tab: 'warehouses',
    },
    {
      label: 'Materials in stock',
      value: formatNumber(summary.materialsInStock),
      icon: Package,
      tone: 'text-brand-600 bg-brand-50',
      tab: 'stock',
    },
    {
      label: 'Total stock quantity',
      value: formatNumber(summary.totalStockQuantity),
      icon: Layers,
      tone: 'text-brand-600 bg-brand-50',
      tab: 'stock',
    },
    {
      label: 'Low stock items',
      value: formatNumber(summary.lowStockItems),
      icon: TrendingDown,
      tone: 'text-amber-700 bg-amber-50',
      tab: 'stock',
    },
    {
      label: 'Out of stock items',
      value: formatNumber(summary.outOfStockItems),
      icon: PackageX,
      tone: 'text-danger bg-danger-soft',
      tab: 'stock',
    },
    {
      label: 'Movements (30 days)',
      value: formatNumber(
        summary.recentReceipts + summary.recentIssues + summary.recentTransfers + summary.recentAdjustments
      ),
      icon: ArrowDownToLine,
      tone: 'text-emerald-700 bg-emerald-50',
      hint: `${formatNumber(summary.recentReceipts)} in · ${formatNumber(summary.recentIssues)} out · ${formatNumber(summary.recentTransfers)} moved`,
      tab: 'transactions',
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const inner = (
          <>
            <div className="flex items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
                <card.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-semibold tabular-nums leading-tight text-ink">{card.value}</p>
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
            aria-label={`${card.label} — open ${card.tab}`}
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
