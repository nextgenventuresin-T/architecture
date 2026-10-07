import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Search } from 'lucide-react';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Pagination from '../projects/Pagination';
import useAsync from '../../hooks/useAsync';
import { financeApi } from '../../api/financeApi';
import { formatCurrency, formatNumber } from '../../utils/format';
import { PROCUREMENT_STATUS_LABELS, PROCUREMENT_STATUS_TONE } from '../../utils/procurementOptions';

const INITIAL = { search: '', projectId: 'all', supplier: 'all', page: 1 };

/**
 * The financial side of Interface 7. Estimated, ordered and received value per
 * request, read from procurement_requests and procurement_receipts. Finance
 * only reads here — procurement itself stays the single place requests are
 * raised and progressed.
 */
export default function ProcurementCostsTab({ lookups }) {
  const [filters, setFilters] = useState(INITIAL);

  const load = useCallback(
    () =>
      financeApi.procurement({
        search: filters.search || undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        supplier: filters.supplier !== 'all' ? filters.supplier : undefined,
        page: filters.page,
        pageSize: 10,
      }),
    [filters]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const rows = data?.procurement ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));

  const columns = [
    {
      key: 'request',
      header: 'Request / PO',
      render: (row) => (
        <div className="min-w-0">
          <Link
            to={`/admin/procurement/${row.id}`}
            className="font-medium text-ink hover:text-brand-700 hover:underline"
          >
            {row.poNumber || row.requestNumber}
          </Link>
          {row.poNumber && <p className="mt-0.5 text-xs text-ink-subtle">{row.requestNumber}</p>}
        </div>
      ),
    },
    {
      key: 'material',
      header: 'Material',
      render: (row) => (
        <div>
          <p className="text-ink">{row.material.name}</p>
          <p className="text-xs text-ink-subtle">
            {formatNumber(row.orderedQuantity ?? row.quantity)} {row.unit}
          </p>
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
    { key: 'supplier', header: 'Supplier', render: (row) => <span className="text-ink-muted">{row.supplier || '—'}</span> },
    {
      key: 'estimated',
      header: 'Estimated',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.estimatedAmount)}</span>,
    },
    {
      key: 'ordered',
      header: 'Ordered',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink">
          {row.orderedQuantity === null ? '—' : formatCurrency(row.orderedAmount)}
        </span>
      ),
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-emerald-700">
          {row.receivedAmount > 0 ? formatCurrency(row.receivedAmount) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={PROCUREMENT_STATUS_TONE[row.status] ?? 'neutral'}>
          {PROCUREMENT_STATUS_LABELS[row.status] ?? row.status}
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
            placeholder="Search request #, PO #, material, supplier…"
            aria-label="Search procurement costs"
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
          label="Filter by supplier"
          value={filters.supplier}
          onChange={set('supplier')}
          className="w-[180px]"
          options={[
            { value: 'all', label: 'All suppliers' },
            ...(lookups.suppliers ?? []).map((s) => ({ value: s, label: s })),
          ]}
        />

        <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
      </div>

      {data && rows.length > 0 && (
        <p className="border-b border-line bg-canvas/40 px-5 py-2.5 text-sm text-ink-muted">
          Estimated <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.estimated)}</span> ·
          ordered <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.ordered)}</span> ·
          received <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.received)}</span>
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        empty={{
          icon: ShoppingCart,
          title: 'No procurement costs match these filters',
          description: 'Cancelled and rejected requests are excluded from the financial view.',
          action: <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>,
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/admin/procurement/${row.id}`} className="font-medium text-ink hover:text-brand-700">
                  {row.poNumber || row.requestNumber}
                </Link>
                <p className="mt-0.5 text-xs text-ink-subtle">{row.material.name}</p>
              </div>
              <Badge tone={PROCUREMENT_STATUS_TONE[row.status] ?? 'neutral'}>
                {PROCUREMENT_STATUS_LABELS[row.status] ?? row.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{row.project.name}{row.site ? ` · ${row.site.name}` : ''}</p>
            <p className="mt-1 text-sm tabular-nums text-ink">
              {formatCurrency(row.orderedAmount || row.estimatedAmount)}
              {row.receivedAmount > 0 && (
                <span className="ml-1.5 text-xs text-emerald-700">{formatCurrency(row.receivedAmount)} received</span>
              )}
            </p>
          </div>
        )}
      />

      <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}
