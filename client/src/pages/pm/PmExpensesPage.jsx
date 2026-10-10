import { useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Skeleton from '../../components/ui/Skeleton';
import Badge from '../../components/ui/Badge';
import { pmApi } from '../../api/pmApi';
import { toApiError } from '../../api/axiosClient';
import { formatCurrency, formatDate } from '../../utils/format';

/** Read-only expense records for the Project Manager's assigned projects, each tied to its source. */
export default function PmExpensesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    pmApi.expenses().then(setData).catch((e) => setError(toApiError(e)));
  }, []);
  return (
    <>
      <PageHeader title="Project Expenses" description="Costs booked against your assigned projects, sites and tasks. Read-only." />
      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}
      {!data && !error && <Skeleton className="h-40 w-full" />}
      {data && (
        <Card>
          <CardHeader title={`${data.total} expense record(s)`} description={`Total ${formatCurrency(data.totalAmount)}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
                <tr>
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-5 py-2.5">Expense</th>
                  <th className="px-5 py-2.5">Category</th>
                  <th className="px-5 py-2.5">Project / Site / Task</th>
                  <th className="px-5 py-2.5">Contractor</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                  <th className="px-5 py-2.5">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.expenses.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-ink-subtle">No expenses recorded for your projects yet.</td></tr>
                ) : data.expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-ink-muted">{formatDate(e.date)}</td>
                    <td className="px-5 py-2.5"><p className="text-ink">{e.expenseNumber}</p><p className="text-xs text-ink-subtle">{e.description}</p></td>
                    <td className="px-5 py-2.5"><Badge>{e.category}</Badge></td>
                    <td className="px-5 py-2.5 text-ink-muted">{[e.project, e.site, e.task].filter(Boolean).join(' · ')}</td>
                    <td className="px-5 py-2.5 text-ink-muted">{e.contractor ?? '—'}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-ink">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-2.5 text-xs text-ink-subtle">{e.reference ?? e.sourceType ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
