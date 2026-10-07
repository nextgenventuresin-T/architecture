import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { HardHat, Search } from 'lucide-react';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Pagination from '../projects/Pagination';
import useAsync from '../../hooks/useAsync';
import { financeApi } from '../../api/financeApi';
import { formatCurrency, formatDate } from '../../utils/format';
import { EXPENSE_STATUS_LABELS, EXPENSE_STATUS_TONE, EXPENSE_STATUS_OPTIONS } from '../../utils/financeOptions';

const INITIAL = { search: '', projectId: 'all', contractorId: 'all', status: 'all', page: 1 };

/**
 * Contractor payments read from the existing `contractor_payments` table that
 * Interfaces 3/4 already populate. Finance shows and filters them; it does not
 * define a second contractor payment system.
 */
export default function ContractorPaymentsTab({ lookups }) {
  const [filters, setFilters] = useState(INITIAL);

  const load = useCallback(
    () =>
      financeApi.contractorPayments({
        search: filters.search || undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        contractorId: filters.contractorId !== 'all' ? filters.contractorId : undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        page: filters.page,
        pageSize: 10,
      }),
    [filters]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const payments = data?.payments ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));

  const columns = [
    {
      key: 'contractor',
      header: 'Contractor',
      render: (row) => (
        <div className="min-w-0">
          <Link
            to={`/admin/contractors/${row.contractor.id}`}
            className="font-medium text-ink hover:text-brand-700 hover:underline"
          >
            {row.contractor.name}
          </Link>
          {row.contractor.contactPerson && (
            <p className="mt-0.5 text-xs text-ink-subtle">{row.contractor.contactPerson}</p>
          )}
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
    {
      key: 'reference',
      header: 'Payment reference',
      render: (row) => <span className="text-ink-muted">{row.paymentReference || '—'}</span>,
    },
    {
      key: 'contract',
      header: 'Contract value',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.contractValue)}</span>,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      render: (row) => <span className="tabular-nums font-medium text-ink">{formatCurrency(row.paidAmount)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      render: (row) => (
        <span className={`tabular-nums ${row.outstanding > 0 ? 'text-danger' : 'text-ink-muted'}`}>
          {formatCurrency(row.outstanding)}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Payment date',
      render: (row) => <span className="whitespace-nowrap text-xs text-ink-subtle">{formatDate(row.paymentDate)}</span>,
    },
    {
      key: 'status',
      header: 'Payment status',
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
            placeholder="Search contractor, project, reference…"
            aria-label="Search contractor payments"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
        </div>

        <Select
          label="Filter by project"
          value={filters.projectId}
          onChange={set('projectId')}
          className="w-[180px]"
          options={[
            { value: 'all', label: 'All projects' },
            ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
          ]}
        />

        <Select
          label="Filter by contractor"
          value={filters.contractorId}
          onChange={set('contractorId')}
          className="w-[190px]"
          options={[
            { value: 'all', label: 'All contractors' },
            ...(lookups.contractors ?? []).map((c) => ({ value: String(c.id), label: c.name })),
          ]}
        />

        <Select
          label="Filter by payment status"
          value={filters.status}
          onChange={set('status')}
          className="w-[170px]"
          options={[{ value: 'all', label: 'All statuses' }, ...EXPENSE_STATUS_OPTIONS]}
        />

        <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
      </div>

      {data && payments.length > 0 && (
        <p className="border-b border-line bg-canvas/40 px-5 py-2.5 text-sm text-ink-muted">
          Contracted <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.contractValue)}</span> ·
          paid <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.paidAmount)}</span> ·
          outstanding <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.outstanding)}</span>
        </p>
      )}

      <DataTable
        columns={columns}
        rows={payments}
        isLoading={isLoading}
        empty={{
          icon: HardHat,
          title: 'No contractor payments match these filters',
          description: 'Contractor payments are raised against a project from the Contractors module.',
          action: <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>,
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{row.contractor.name}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">{row.project.name}</p>
              </div>
              <Badge tone={EXPENSE_STATUS_TONE[row.status] ?? 'neutral'}>
                {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {formatCurrency(row.paidAmount)} paid of {formatCurrency(row.contractValue)}
            </p>
            {row.outstanding > 0 && (
              <p className="mt-1 text-xs text-danger">{formatCurrency(row.outstanding)} outstanding</p>
            )}
          </div>
        )}
      />

      <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}
