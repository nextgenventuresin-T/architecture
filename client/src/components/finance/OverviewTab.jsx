import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody } from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import EmptyState from '../ui/EmptyState';
import { PieChart } from 'lucide-react';
import { formatCurrency, formatCompactCurrency } from '../../utils/format';
import { categoryLabel } from '../../utils/financeOptions';

/**
 * Where the money has gone. Expense split by category plus the overall budget
 * position, both read straight from the summary endpoint.
 */
export default function OverviewTab({ summary }) {
  const categories = summary.expensesByCategory ?? [];
  const largest = categories.reduce((max, row) => Math.max(max, row.total), 0);
  const utilisation =
    summary.totalProjectBudget > 0
      ? Math.round((summary.totalSpent / summary.totalProjectBudget) * 100)
      : null;

  return (
    <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Budget position" description="Across all active projects." />
        <CardBody className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {formatCompactCurrency(summary.totalSpent)}
              </span>
              <span className="text-sm text-ink-subtle">
                of {formatCompactCurrency(summary.totalProjectBudget)}
              </span>
            </div>
            {utilisation !== null && (
              <ProgressBar
                value={Math.min(utilisation, 100)}
                status={utilisation > 100 ? 'delayed' : utilisation > 85 ? 'attention' : 'on-track'}
              />
            )}
            <p className="mt-2 text-sm text-ink-muted">
              {utilisation === null
                ? 'No budget has been set on the active projects yet.'
                : `${utilisation}% of budget committed.`}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 border-t border-line pt-4">
            {[
              ['Procurement cost', summary.procurementValue],
              ['Contractor payments', summary.contractorPayments],
              ['Total spent', summary.totalSpent],
              ['Remaining budget', summary.remainingBudget],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-ink-subtle">{label}</dt>
                <dd
                  className={`mt-0.5 text-sm tabular-nums ${
                    label === 'Remaining budget' && value < 0 ? 'text-danger' : 'text-ink'
                  }`}
                >
                  {formatCurrency(value)}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Expenses by category" description="Rejected and cancelled expenses are excluded." />
        <CardBody>
          {categories.length === 0 ? (
            <EmptyState
              icon={PieChart}
              title="No expenses recorded yet"
              description="Add an expense to see the category breakdown."
              action={
                <Link to="/admin/finance/expenses/new" className="text-sm text-brand-700 hover:underline">
                  Add an expense
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {categories.map((row) => (
                <li key={row.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">{categoryLabel(row.category)}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {formatCurrency(row.total)}
                      <span className="ml-1.5 text-xs text-ink-subtle">({row.count})</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-brand-100/70">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${largest > 0 ? Math.max((row.total / largest) * 100, 2) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
