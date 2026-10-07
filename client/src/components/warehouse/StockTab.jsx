import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Search } from 'lucide-react';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Pagination from '../projects/Pagination';
import useAsync from '../../hooks/useAsync';
import { warehouseApi } from '../../api/warehouseApi';
import { formatNumber, formatDate } from '../../utils/format';
import { STOCK_STATUS_OPTIONS, STOCK_STATUS_LABELS, STOCK_STATUS_TONE } from '../../utils/warehouseOptions';

const INITIAL = {
  search: '',
  warehouseId: 'all',
  materialId: 'all',
  category: 'all',
  projectId: 'all',
  stockStatus: 'all',
  page: 1,
};

/**
 * Current stock across warehouses. Material name, code, category, unit and the
 * reorder point all come from the Interface 6 catalogue via the API — this
 * screen holds no material master of its own.
 */
export default function StockTab({ lookups }) {
  const [filters, setFilters] = useState(INITIAL);

  const load = useCallback(
    () =>
      warehouseApi.stock({
        search: filters.search || undefined,
        warehouseId: filters.warehouseId !== 'all' ? filters.warehouseId : undefined,
        materialId: filters.materialId !== 'all' ? filters.materialId : undefined,
        category: filters.category !== 'all' ? filters.category : undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        stockStatus: filters.stockStatus,
        page: filters.page,
        pageSize: 20,
      }),
    [filters]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const rows = data?.stock ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));

  const categories = [...new Set((lookups.materials ?? []).map((m) => m.category))].sort();

  const columns = [
    {
      key: 'material',
      header: 'Material',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/admin/materials/${row.material.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.material.name}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {row.material.code} · {row.material.category}
          </p>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      render: (row) => (
        <Link to={`/admin/warehouse/${row.warehouse.id}`} className="text-ink-muted hover:text-brand-700">
          {row.warehouse.name}
        </Link>
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
        <span className="tabular-nums font-medium text-ink">
          {formatNumber(row.quantity)} <span className="text-xs font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'min',
      header: 'Min stock',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.minStock)}</span>,
    },
    {
      key: 'status',
      header: 'Stock status',
      render: (row) => (
        <Badge tone={STOCK_STATUS_TONE[row.stockStatus] ?? 'neutral'}>
          {STOCK_STATUS_LABELS[row.stockStatus] ?? row.stockStatus}
        </Badge>
      ),
    },
    {
      key: 'updated',
      header: 'Last updated',
      render: (row) => <span className="whitespace-nowrap text-xs text-ink-subtle">{formatDate(row.lastUpdated)}</span>,
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
            placeholder="Search material, code, warehouse…"
            aria-label="Search stock"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
        </div>

        <Select
          label="Filter by warehouse"
          value={filters.warehouseId}
          onChange={set('warehouseId')}
          className="w-[180px]"
          options={[
            { value: 'all', label: 'All warehouses' },
            ...(lookups.warehouses ?? []).map((w) => ({ value: String(w.id), label: w.name })),
          ]}
        />

        <Select
          label="Filter by material"
          value={filters.materialId}
          onChange={set('materialId')}
          className="w-[180px]"
          options={[
            { value: 'all', label: 'All materials' },
            ...(lookups.materials ?? []).map((m) => ({ value: String(m.id), label: m.name })),
          ]}
        />

        <Select
          label="Filter by category"
          value={filters.category}
          onChange={set('category')}
          className="w-[160px]"
          options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
        />

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
          label="Filter by stock status"
          value={filters.stockStatus}
          onChange={set('stockStatus')}
          className="w-[160px]"
          options={[{ value: 'all', label: 'All stock' }, ...STOCK_STATUS_OPTIONS]}
        />

        <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        empty={{
          icon: Package,
          title: 'No stock matches these filters',
          description: 'Clear the filters, or receive material into a warehouse.',
          action: <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>,
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{row.material.name}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">{row.material.code} · {row.warehouse.name}</p>
              </div>
              <Badge tone={STOCK_STATUS_TONE[row.stockStatus] ?? 'neutral'}>
                {STOCK_STATUS_LABELS[row.stockStatus] ?? row.stockStatus}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {formatNumber(row.quantity)} {row.unit}
              {row.minStock > 0 ? ` · min ${formatNumber(row.minStock)}` : ''}
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
