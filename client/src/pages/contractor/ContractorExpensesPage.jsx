import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, FileText, Download, AlertCircle, Package } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { SelectField, InputField } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Skeleton from '../../components/ui/Skeleton';
import { financeApi } from '../../api/financeApi';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONE,
  categoryLabel,
  CONTRACTOR_EXPENSE_CATEGORY_OPTIONS,
} from '../../utils/financeOptions';

export default function ContractorExpensesPage() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [filteredAmount, setFilteredAmount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await financeApi.expenses({
        pageSize: 50,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search.trim() || undefined,
      });
      setExpenses(data.expenses ?? []);
      setFilteredAmount(data.filteredAmount ?? 0);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const totalCount = expenses.length;
  const pendingCount = expenses.filter((e) => e.status === 'pending').length;
  const approvedCount = expenses.filter((e) => ['approved', 'paid'].includes(e.status)).length;

  return (
    <>
      <PageHeader
        title="Daily Expenses & Material Usage"
        description="Track site expenses and record material/tool consumption from your warehouse inventory."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate('/contractor/expenses/new?type=expense')}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Cash Expense
            </Button>
            <Button
              onClick={() => navigate('/contractor/expenses/new?type=material')}
              className="gap-1.5"
            >
              <Package className="h-4 w-4" />
              Record Material Usage
            </Button>
          </div>
        }
      />

      {/* Notice about Unified Daily Work */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-sky-900">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-sky-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">Notice:</span> Daily site operational expenses (Labour, Material, and Miscellaneous Site Cash) are now recorded directly via <strong>Daily Work Updates</strong> under each assigned Task.
          </div>
        </div>
        <Link
          to="/contractor/daily-work"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900 bg-white border border-sky-200 px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap"
        >
          Go to Daily Work Updates &rarr;
        </Link>
      </div>

      {error && (
        <Alert tone="error" className="mb-4">
          {error.message || 'Failed to load expenses.'}
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-ink-subtle">Total Listed Amount</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatCurrency(filteredAmount)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{formatNumber(totalCount)} records</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-amber-700">Pending Approvals</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{formatNumber(pendingCount)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">Awaiting Admin / Finance review</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Approved / Settled</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatNumber(approvedCount)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">Approved or Paid</p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="mb-6">
        <CardBody className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <InputField
              label="Search"
              placeholder="Search description, party, ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SelectField
              label="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Categories' },
                ...CONTRACTOR_EXPENSE_CATEGORY_OPTIONS,
              ]}
            />
            <SelectField
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'paid', label: 'Paid' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader
          title="Expense History"
          description="Every expense you submit appears in the Admin Finance review queue."
          actions={
            <Button variant="ghost" size="sm" onClick={load} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          }
        />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-12 text-center text-ink-subtle">
              <FileText className="mx-auto mb-2 h-8 w-8 text-ink-subtle opacity-50" />
              <p>No daily expenses or material usage recorded yet.</p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => navigate('/contractor/expenses/new?type=material')}
                  className="gap-1.5"
                >
                  <Package className="h-4 w-4" />
                  Record Material Usage
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/contractor/expenses/new?type=expense')}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add Cash Expense
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Expense #</th>
                    <th className="px-4 py-3">Project / Site</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Item / Payee</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Receipt / Bill</th>
                    <th className="px-4 py-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-canvas/50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                        {formatDate(e.date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                        {e.expenseNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{e.project?.name || '—'}</div>
                        {e.site && <div className="text-xs text-ink-subtle">{e.site.name}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {e.category === 'Material Consumption' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded text-xs">
                            <Package className="h-3 w-3 shrink-0" />
                            Material Consumption
                          </span>
                        ) : (
                          <span className="font-medium text-ink">{categoryLabel(e.category)}</span>
                        )}
                        {e.requiresProjectHeadApproval && (
                          <span className="mt-0.5 block text-[10px] text-amber-700">
                            *Requires Project Head approval
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {e.category === 'Material Consumption' ? (
                          <div>
                            <span className="font-medium text-ink">{e.partyName || '—'}</span>
                            <span className="text-[11px] text-ink-subtle block">Contractor Inventory</span>
                          </div>
                        ) : (
                          e.partyName || e.paidBy || '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge tone={EXPENSE_STATUS_TONE[e.status] ?? 'neutral'}>
                          {EXPENSE_STATUS_LABELS[e.status] ?? e.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {e.billFile ? (
                          <a
                            href={financeApi.billUrl(e.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {e.billFile.name || 'View Bill'}
                          </a>
                        ) : (
                          <span className="text-xs text-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-ink-muted" title={e.notes || e.description}>
                        {e.notes || e.description || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
