import { Wallet } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import DataTable from '../ui/DataTable';
import ProgressBar from '../ui/ProgressBar';
import { formatCurrency, formatDate } from '../../utils/format';
import { EXPENSE_CATEGORY_LABELS, labelFor } from '../../utils/projectOptions';

/** Budget, expenses, material cost and contractor position for the project. */
export default function FinanceTab({ detail }) {
  const { financials, expenses = [] } = detail;
  if (!financials) {
    return (
      <div className="py-8 text-center text-sm text-ink-muted italic">
        Financial overview is restricted or unavailable for this user.
      </div>
    );
  }
  const spentShare = financials.budget ? Math.round((financials.spent / financials.budget) * 100) : 0;
  const largest = Math.max(1, ...(financials.byCategory || []).map((c) => c.total));

  const columns = [
    {
      key: 'description',
      header: 'Expense',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.description}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {labelFor(EXPENSE_CATEGORY_LABELS, row.category)}{row.site_name ? ` · ${row.site_name}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.expense_date)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.amount)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Money label="Estimated budget" value={financials.budget} />
        <Money label="Spent to date" value={financials.spent} />
        <Money label="Remaining" value={financials.remaining} tone={financials.remaining < 0 ? 'danger' : 'default'} />
        <Money label="Contractor outstanding" value={financials.contractorOutstanding} tone={financials.contractorOutstanding > 0 ? 'danger' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Expenses" description={`${expenses.length} recorded entries`} />
          <DataTable
            columns={columns}
            rows={expenses}
            empty={{ icon: Wallet, title: 'No expenses recorded', description: 'Costs booked against this project will appear here.' }}
          />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Budget usage" description={`${spentShare}% committed`} />
            <CardBody>
              <ProgressBar value={Math.min(100, spentShare)} status={spentShare > 100 ? 'delayed' : 'on-track'} />
              <dl className="mt-4 space-y-2.5 text-sm">
                <Row label="Material consumed" value={financials.materialConsumptionCost ?? 0} />
                <Row label="Material purchases" value={financials.materialCost} />
                <Row label="Contract value" value={financials.contractValue} />
                <Row label="Paid to contractors" value={financials.contractorPaid} />
                <Row label="Labour cost" value={financials.labourCost} />
              </dl>
              <div className="mt-4 rounded-xl border border-line bg-canvas-subtle p-3 text-[11px] text-ink-subtle">
                <span className="font-semibold text-ink">Formula: </span>
                Material Consumed + Labour + Contractor Payments + Other = Spent to date
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Spend by category" />
            <CardBody className="space-y-3.5">
              {financials.byCategory.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing booked yet.</p>
              ) : (
                financials.byCategory.map((row) => (
                  <div key={row.category}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink">{labelFor(EXPENSE_CATEGORY_LABELS, row.category)}</span>
                      <span className="shrink-0 tabular-nums text-ink-muted">{formatCurrency(row.total)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-brand-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(row.total / largest) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Money({ label, value, tone = 'default' }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`mt-2 font-display text-xl font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{formatCurrency(value)}</dd>
    </div>
  );
}
