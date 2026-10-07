import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Search } from 'lucide-react';
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
  PAYMENT_TYPE_OPTIONS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_TONE,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONE,
} from '../../utils/financeOptions';

const INITIAL = {
  search: '', type: 'all', projectId: 'all', siteId: 'all', status: 'all',
  dateFrom: '', dateTo: '', page: 1,
};

/**
 * One feed across expenses, contractor payments and procurement. The API
 * builds it with a UNION over the three source tables rather than a payments
 * table of its own, so this view can never disagree with the module a payment
 * came from.
 */
export default function PaymentsTab({ lookups }) {
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
    return () => { active = false; };
  }, [filters.projectId]);

  const load = useCallback(
    () =>
      financeApi.payments({
        search: filters.search || undefined,
        type: filters.type,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page: filters.page,
        pageSize: 15,
      }),
    [filters]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const payments = data?.payments ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));
  const setProject = (event) =>
    setFilters((f) => ({ ...f, projectId: event.target.value, siteId: 'all', page: 1 }));

  const dateInput =
    'h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none';

  const columns = [
    {
      key: 'reference',
      header: 'Payment reference',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.reference}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.date)}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge tone={PAYMENT_TYPE_TONE[row.type] ?? 'neutral'}>
          {PAYMENT_TYPE_LABELS[row.type] ?? row.type}
        </Badge>
      ),
    },
    {
      key: 'where',
      header: 'Project / site',
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-ink-muted">{row.project?.name ?? '—'}</p>
          {row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}
        </div>
      ),
    },
    {
      key: 'party',
      header: 'Contractor / supplier',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-ink-muted">{row.party}</p>
          {row.detail && <p className="truncate text-xs text-ink-subtle">{row.detail}</p>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="tabular-nums font-medium text-ink">{formatCurrency(row.amount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={EXPENSE_STATUS_TONE[row.status] ?? 'neutral'}>
          {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
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
            placeholder="Search reference, contractor, supplier…"
            aria-label="Search payments"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
        </div>

        <Select
          label="Filter by type"
          value={filters.type}
          onChange={set('type')}
          className="w-[190px]"
          options={[{ value: 'all', label: 'All payment types' }, ...PAYMENT_TYPE_OPTIONS]}
        />

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

        <input type="date" value={filters.dateFrom} onChange={set('dateFrom')} aria-label="From date" className={dateInput} />
        <input type="date" value={filters.dateTo} onChange={set('dateTo')} aria-label="To date" className={dateInput} />

        <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
      </div>

      {data && payments.length > 0 && (
        <p className="border-b border-line bg-canvas/40 px-5 py-2.5 text-sm text-ink-muted">
          {data.pagination.total} payments ·{' '}
          <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totalAmount)}</span> total
        </p>
      )}

      <DataTable
        columns={columns}
        rows={payments}
        isLoading={isLoading}
        getRowKey={(row) => row.key}
        empty={{
          icon: CreditCard,
          title: 'No payments match these filters',
          description: 'Expenses, contractor payments and procurement orders all appear here.',
          action: <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>,
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{row.reference}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.date)} · {row.party}</p>
              </div>
              <Badge tone={PAYMENT_TYPE_TONE[row.type] ?? 'neutral'}>
                {PAYMENT_TYPE_LABELS[row.type] ?? row.type}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-medium tabular-nums text-ink">{formatCurrency(row.amount)}</p>
            <p className="mt-1 text-xs text-ink-subtle">{row.project?.name ?? '—'}</p>
          </div>
        )}
      />

      <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}
