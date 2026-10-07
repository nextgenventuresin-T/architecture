import { useCallback, useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Pagination from '../projects/Pagination';
import useAsync from '../../hooks/useAsync';
import { warehouseApi } from '../../api/warehouseApi';
import { projectsApi } from '../../api/projectsApi';
import { formatNumber, formatDate } from '../../utils/format';
import {
  TRANSACTION_TYPE_OPTIONS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_TONE,
  transactionSign,
} from '../../utils/warehouseOptions';

const INITIAL = {
  search: '',
  type: 'all',
  warehouseId: 'all',
  materialId: 'all',
  projectId: 'all',
  siteId: 'all',
  dateFrom: '',
  dateTo: '',
  page: 1,
};

/** Every receipt, issue, transfer and adjustment, newest first. */
export default function TransactionsTab({ lookups }) {
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
      warehouseApi.transactions({
        search: filters.search || undefined,
        type: filters.type,
        warehouseId: filters.warehouseId !== 'all' ? filters.warehouseId : undefined,
        materialId: filters.materialId !== 'all' ? filters.materialId : undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page: filters.page,
        pageSize: 15,
      }),
    [filters]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const rows = data?.transactions ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));
  const setProject = (event) =>
    setFilters((f) => ({ ...f, projectId: event.target.value, siteId: 'all', page: 1 }));

  const dateInput =
    'h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none';

  const columns = [
    {
      key: 'txn',
      header: 'Transaction',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.transactionNumber}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.date)}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <div>
          <Badge tone={TRANSACTION_TYPE_TONE[row.type] ?? 'neutral'}>
            {TRANSACTION_TYPE_LABELS[row.type] ?? row.type}
          </Badge>
          {row.adjustmentType && <p className="mt-1 text-xs capitalize text-ink-subtle">{row.adjustmentType}</p>}
        </div>
      ),
    },
    {
      key: 'material',
      header: 'Material',
      render: (row) => (
        <div>
          <p className="text-ink">{row.material.name}</p>
          <p className="text-xs text-ink-subtle">{row.material.code}</p>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-ink-muted">{row.warehouse.name}</p>
          {row.destinationWarehouse && (
            <p className="text-xs text-ink-subtle">→ {row.destinationWarehouse.name}</p>
          )}
        </div>
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
      key: 'quantity',
      header: 'Quantity',
      align: 'right',
      render: (row) => (
        <span className="whitespace-nowrap tabular-nums font-medium text-ink">
          {transactionSign(row)} {formatNumber(row.quantity)}{' '}
          <span className="text-xs font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (row) => (
        <div className="min-w-0">
          {row.procurement ? (
            <span className="text-xs text-brand-700">
              {row.procurement.poNumber || row.procurement.requestNumber}
            </span>
          ) : (
            <span className="text-xs text-ink-muted">{row.reference || '—'}</span>
          )}
          {row.reason && <p className="truncate text-xs text-ink-subtle">{row.reason}</p>}
        </div>
      ),
    },
    {
      key: 'by',
      header: 'Performed by',
      render: (row) => <span className="whitespace-nowrap text-xs text-ink-muted">{row.performedBy?.name ?? '—'}</span>,
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
            placeholder="Search transaction #, material, reference…"
            aria-label="Search transactions"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
        </div>

        <Select
          label="Filter by type"
          value={filters.type}
          onChange={set('type')}
          className="w-[150px]"
          options={[{ value: 'all', label: 'All types' }, ...TRANSACTION_TYPE_OPTIONS]}
        />

        <Select
          label="Filter by warehouse"
          value={filters.warehouseId}
          onChange={set('warehouseId')}
          className="w-[170px]"
          options={[
            { value: 'all', label: 'All warehouses' },
            ...(lookups.warehouses ?? []).map((w) => ({ value: String(w.id), label: w.name })),
          ]}
        />

        <Select
          label="Filter by material"
          value={filters.materialId}
          onChange={set('materialId')}
          className="w-[170px]"
          options={[
            { value: 'all', label: 'All materials' },
            ...(lookups.materials ?? []).map((m) => ({ value: String(m.id), label: m.name })),
          ]}
        />

        <Select
          label="Filter by project"
          value={filters.projectId}
          onChange={setProject}
          className="w-[170px]"
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

        <input
          type="date"
          value={filters.dateFrom}
          onChange={set('dateFrom')}
          aria-label="From date"
          className={dateInput}
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={set('dateTo')}
          aria-label="To date"
          className={dateInput}
        />

        <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        empty={{
          icon: History,
          title: 'No transactions match these filters',
          description: 'Clear the filters, or record a stock movement.',
          action: <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>,
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{row.transactionNumber}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.date)} · {row.material.name}</p>
              </div>
              <Badge tone={TRANSACTION_TYPE_TONE[row.type] ?? 'neutral'}>
                {TRANSACTION_TYPE_LABELS[row.type] ?? row.type}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {transactionSign(row)} {formatNumber(row.quantity)} {row.unit} · {row.warehouse.name}
              {row.destinationWarehouse ? ` → ${row.destinationWarehouse.name}` : ''}
            </p>
            {row.project && (
              <p className="mt-1 text-xs text-ink-subtle">
                {row.project.name}{row.site ? ` · ${row.site.name}` : ''}
              </p>
            )}
          </div>
        )}
      />

      <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}
