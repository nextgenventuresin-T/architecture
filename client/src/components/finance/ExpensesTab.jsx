import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Search, Eye, Pencil, Plus } from 'lucide-react';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Pagination from '../projects/Pagination';
import useAsync from '../../hooks/useAsync';
import { financeApi } from '../../api/financeApi';
import { projectsApi } from '../../api/projectsApi';
import { formatCurrency, formatDate } from '../../utils/format';
import {
  EXPENSE_STATUS_OPTIONS,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONE,
  EXPENSE_CATEGORY_OPTIONS,
  categoryLabel,
  EDITABLE_STATUSES,
} from '../../utils/financeOptions';

const INITIAL = {
  search: '',
  projectId: 'all',
  siteId: 'all',
  category: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
  page: 1,
};

export default function ExpensesTab({ lookups, canManage }) {
  const [filters, setFilters] = useState(INITIAL);
  const [sites, setSites] = useState([]);

  useEffect(() => {
    if (filters.projectId === 'all') {
      setSites([]);
      return undefined;
    }
    let active = true;
    projectsApi
      .detail(filters.projectId)
      .then((data) => active && setSites(data.sites ?? []))
      .catch(() => active && setSites([]));
    return () => {
      active = false;
    };
  }, [filters.projectId]);

  const load = useCallback(
    () =>
      financeApi.expenses({
        search: filters.search || undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
        category: filters.category !== 'all' ? filters.category : undefined,
        status: filters.status,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page: filters.page,
        pageSize: 10,
      }),
    [filters]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const expenses = data?.expenses ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));
  const setProject = (event) =>
    setFilters((f) => ({ ...f, projectId: event.target.value, siteId: 'all', page: 1 }));

  const dateInput =
    'h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none';

  const columns = [
    {
      key: 'expense',
      header: 'Expense',
      render: (row) => (
        <div className="min-w-0">
          <Link
            to={`/admin/finance/expenses/${row.id}`}
            className="font-medium text-ink hover:text-brand-700 hover:underline"
          >
            {row.expenseNumber}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.date)}</p>
        </div>
      ),
    },
    {
      key: 'where',
      header: 'Project / site',
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-ink-muted">{row.project.name}</p>
          {row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (row) => <span className="text-ink-muted">{categoryLabel(row.category)}</span> },
    {
      key: 'description',
      header: 'Description',
      render: (row) => <span className="line-clamp-2 text-ink-muted">{row.description}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="tabular-nums font-medium text-ink">{formatCurrency(row.amount)}</span>,
    },
    { key: 'paidBy', header: 'Paid by', render: (row) => <span className="text-ink-muted">{row.paidBy || '—'}</span> },
    {
      key: 'status',
      header: 'Payment status',
      render: (row) => (
        <Badge tone={EXPENSE_STATUS_TONE[row.status] ?? 'neutral'}>
          {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    { key: 'actions', header: 'Actions', align: 'right', render: (row) => <RowActions row={row} canManage={canManage} /> },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            type="search"
            value={filters.search}
            onChange={set('search')}
            placeholder="Search number, description, paid by…"
            aria-label="Search expenses"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
        </div>

        <Select
          label="Filter by project"
          value={filters.projectId}
          onChange={setProject}
          className="w-[180px]"
          options={[
            { value: 'all', label: 'All projects' },
            ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
          ]}
        />

        <Select
          label="Filter by site"
          value={filters.siteId}
          onChange={set('siteId')}
          className="w-[160px]"
          options={[
            { value: 'all', label: filters.projectId === 'all' ? 'All sites' : 'All sites in project' },
            ...sites.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
        />

        <Select
          label="Filter by category"
          value={filters.category}
          onChange={set('category')}
          className="w-[160px]"
          options={[{ value: 'all', label: 'All categories' }, ...EXPENSE_CATEGORY_OPTIONS]}
        />

        <Select
          label="Filter by payment status"
          value={filters.status}
          onChange={set('status')}
          className="w-[160px]"
          options={[{ value: 'all', label: 'All statuses' }, ...EXPENSE_STATUS_OPTIONS]}
        />

        <input type="date" value={filters.dateFrom} onChange={set('dateFrom')} aria-label="From date" className={dateInput} />
        <input type="date" value={filters.dateTo} onChange={set('dateTo')} aria-label="To date" className={dateInput} />

        <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
      </div>

      {data && expenses.length > 0 && (
        <p className="border-b border-line bg-canvas/40 px-5 py-2.5 text-sm text-ink-muted">
          {data.pagination.total} expenses matching these filters ·{' '}
          <span className="font-medium tabular-nums text-ink">{formatCurrency(data.filteredAmount)}</span> total
        </p>
      )}

      <DataTable
        columns={columns}
        rows={expenses}
        isLoading={isLoading}
        empty={{
          icon: Receipt,
          title: 'No expenses match these filters',
          description: 'Clear the filters, or record a new expense.',
          action: (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
              {canManage && (
                <Link to="/admin/finance/expenses/new">
                  <Button>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add expense
                  </Button>
                </Link>
              )}
            </div>
          ),
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/admin/finance/expenses/${row.id}`} className="font-medium text-ink hover:text-brand-700">
                  {row.expenseNumber}
                </Link>
                <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.date)} · {categoryLabel(row.category)}</p>
              </div>
              <Badge tone={EXPENSE_STATUS_TONE[row.status] ?? 'neutral'}>
                {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{row.description}</p>
            <p className="mt-1 text-sm font-medium tabular-nums text-ink">{formatCurrency(row.amount)}</p>
            <p className="mt-1 text-xs text-ink-subtle">
              {row.project.name}{row.site ? ` · ${row.site.name}` : ''}
            </p>
            <div className="mt-3">
              <RowActions row={row} canManage={canManage} />
            </div>
          </div>
        )}
      />

      <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}

function RowActions({ row, canManage }) {
  const base =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors';

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link
        to={`/admin/finance/expenses/${row.id}`}
        className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`}
        aria-label={`View ${row.expenseNumber}`}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View
      </Link>
      {canManage && EDITABLE_STATUSES.includes(row.status) && (
        <Link
          to={`/admin/finance/expenses/${row.id}/edit`}
          className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`}
          aria-label={`Edit ${row.expenseNumber}`}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Link>
      )}
    </div>
  );
}
