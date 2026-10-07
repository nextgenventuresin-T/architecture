import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Eye, Warehouse, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  SlidersHorizontal, LayoutGrid, Table as TableIcon, ArrowRight,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Select from '../../../components/ui/Select';
import Pagination from '../../../components/projects/Pagination';
import ExcelTable from '../../../components/warehouse/ExcelTable';
import StockMovementDialog from '../../../components/warehouse/StockMovementDialog';
import useAsync from '../../../hooks/useAsync';
import useAuth from '../../../hooks/useAuth';
import { warehouseApi } from '../../../api/warehouseApi';
import { ROLES } from '../../../config/roles';
import { formatNumber, formatDate } from '../../../utils/format';
import {
  STOCK_STATUS_OPTIONS, STOCK_STATUS_LABELS, STOCK_STATUS_TONE,
  TRANSACTION_TYPE_OPTIONS, TRANSACTION_TYPE_LABELS, TRANSACTION_TYPE_TONE,
} from '../../../utils/warehouseOptions';

/**
 * Warehouse home, driven by a warehouse switcher rather than a warehouse list.
 * The default scope is the Central Company Warehouse; the switcher also offers
 * "Total Contractor Warehouses" and every individual contractor's warehouse
 * (pulled live from the database). Materials master lives in its own module —
 * this screen is stock and movement only. The same append-only ledger backs
 * every view, so a Central -> Contractor issue is one traceable transfer with
 * no separate "receive" step and no Finance side effect.
 */
export default function WarehouseListPage({ basePath = '/admin' }) {
  const modulePath = basePath === '/admin' ? '/admin/warehouse' : basePath;
  const { user } = useAuth();

  const [scopes, setScopes] = useState({ central: null, contractors: [] });
  const [lookups, setLookups] = useState({ warehouses: [], materials: [], projects: [], locations: [], pendingReceipts: [] });
  const [scopeValue, setScopeValue] = useState('central');
  const [viewMode, setViewMode] = useState('normal'); // 'normal' | 'table'
  const [movement, setMovement] = useState(null);
  const [flash, setFlash] = useState(null);

  const canMoveStock = [ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.PROCUREMENT].includes(user?.role);
  const canManage = [ROLES.ADMIN, ROLES.WAREHOUSE].includes(user?.role);

  const loadScopes = useCallback(() => {
    warehouseApi.scopes().then(setScopes).catch(() => setScopes({ central: null, contractors: [] }));
  }, []);
  const loadLookups = useCallback(() => {
    warehouseApi.lookups().then(setLookups).catch(() => {});
  }, []);

  useEffect(() => { loadScopes(); loadLookups(); }, [loadScopes, loadLookups]);

  const scopeOptions = useMemo(() => {
    const opts = [
      { value: 'central', label: 'Central Company Warehouse' },
      { value: 'total-contractor', label: 'Total Contractor Warehouses' },
    ];
    for (const c of scopes.contractors ?? []) {
      opts.push({ value: `contractor:${c.warehouseId}`, label: `${c.contractor?.name || c.name}` });
    }
    return opts;
  }, [scopes]);

  const selectedContractor = useMemo(() => {
    if (!scopeValue.startsWith('contractor:')) return null;
    const id = Number(scopeValue.split(':')[1]);
    return (scopes.contractors ?? []).find((c) => c.warehouseId === id) || null;
  }, [scopeValue, scopes]);

  function handleMovementSaved(message) {
    setMovement(null);
    setFlash(message);
    loadScopes();
    loadLookups();
    // Views reload themselves via their own keys; bump a nonce to force it.
    setReloadNonce((n) => n + 1);
  }
  const [reloadNonce, setReloadNonce] = useState(0);

  const movementButton =
    'inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-ink transition-colors hover:border-brand-200 hover:bg-brand-50';

  return (
    <>
      <PageHeader
        title="Warehouse"
        description="Stock and movement across the central company warehouse and every contractor warehouse."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Warehouse' }]}
        actions={
          canManage && (
            <Link to={`${modulePath}/new`}>
              <Button>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add warehouse
              </Button>
            </Link>
          )
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}

      {/* Warehouse switcher + view toggle */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Warehouse</label>
          <Select
            label="Select warehouse"
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value)}
            className="w-[280px]"
            options={scopeOptions}
          />
        </div>

        <div className="ml-auto flex items-end gap-2">
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {canMoveStock && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" className={movementButton} onClick={() => setMovement('receipt')}>
            <ArrowDownToLine className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Receive / add stock
          </button>
          <button type="button" className={movementButton} onClick={() => setMovement('issue')}>
            <ArrowUpFromLine className="h-4 w-4 text-brand-600" aria-hidden="true" />
            Issue stock
          </button>
          <button type="button" className={movementButton} onClick={() => setMovement('transfer')}>
            <ArrowLeftRight className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Transfer stock
          </button>
          <button type="button" className={movementButton} onClick={() => setMovement('adjustment')}>
            <SlidersHorizontal className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            Adjust stock
          </button>
        </div>
      )}

      {scopeValue === 'central' && (
        <CentralView key={`central-${reloadNonce}`} viewMode={viewMode} centralScope={scopes.central} modulePath={modulePath} />
      )}
      {scopeValue === 'total-contractor' && (
        <ContractorMovementsView
          key={`total-${reloadNonce}`}
          viewMode={viewMode}
          scopes={scopes}
          lookups={lookups}
          title="Total Contractor Warehouses"
        />
      )}
      {selectedContractor && (
        <ContractorWarehouseView
          key={`contractor-${selectedContractor.warehouseId}-${reloadNonce}`}
          viewMode={viewMode}
          contractorScope={selectedContractor}
          scopes={scopes}
          lookups={lookups}
        />
      )}

      {movement && (
        <StockMovementDialog
          type={movement}
          lookups={lookups}
          onClose={() => setMovement(null)}
          onSaved={handleMovementSaved}
        />
      )}
    </>
  );
}

function ViewToggle({ viewMode, onChange }) {
  const base = 'inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors';
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line">
      <button
        type="button"
        onClick={() => onChange('normal')}
        className={`${base} ${viewMode === 'normal' ? 'bg-brand-600 text-white' : 'bg-white text-ink-muted hover:bg-canvas'}`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Normal
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`${base} ${viewMode === 'table' ? 'bg-brand-600 text-white' : 'bg-white text-ink-muted hover:bg-canvas'}`}
      >
        <TableIcon className="h-4 w-4" aria-hidden="true" /> Table
      </button>
    </div>
  );
}

function StatusBadge({ status }) {
  return <Badge tone={STOCK_STATUS_TONE[status] ?? 'neutral'}>{STOCK_STATUS_LABELS[status] ?? status}</Badge>;
}

function TypeBadge({ type }) {
  return <Badge tone={TRANSACTION_TYPE_TONE[type] ?? 'neutral'}>{TRANSACTION_TYPE_LABELS[type] ?? type}</Badge>;
}

// --------------------------------------------------------------- Central view

function CentralView({ viewMode, centralScope, modulePath }) {
  const [search, setSearch] = useState('');
  const [stockStatus, setStockStatus] = useState('all');

  const load = useCallback(
    () => warehouseApi.centralOverview({
      search: search || undefined,
      stockStatus,
    }),
    [search, stockStatus]
  );
  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const items = data?.items ?? [];
  const totals = data?.totals;
  const primaryId = centralScope?.primaryId ?? null;

  const columns = [
    {
      key: 'material', header: 'Material',
      value: (r) => r.material.name,
      render: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-ink">{r.material.name}</span>
          <p className="mt-0.5 text-xs text-ink-subtle">{r.material.code}{r.material.category ? ` · ${r.material.category}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'currentStock', header: 'Current stock', align: 'right',
      value: (r) => r.currentStock,
      render: (r) => <span className="tabular-nums font-medium text-ink">{formatNumber(r.currentStock)} <span className="text-xs font-normal text-ink-subtle">{r.material.unit}</span></span>,
    },
    {
      key: 'purchasedReceived', header: 'Purchased / received', align: 'right',
      value: (r) => r.purchasedReceived,
      render: (r) => <span className="tabular-nums text-ink-muted">{formatNumber(r.purchasedReceived)}</span>,
    },
    {
      key: 'status', header: 'Status',
      value: (r) => r.stockStatus,
      render: (r) => <StatusBadge status={r.stockStatus} />,
    },
    {
      key: 'lastMovement', header: 'Last movement',
      value: (r) => r.lastMovement || '',
      render: (r) => <span className="whitespace-nowrap text-xs text-ink-subtle">{r.lastMovement ? formatDate(r.lastMovement) : '—'}</span>,
    },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Materials in stock" value={totals ? formatNumber(totals.materials) : '—'} />
        <Stat label="Current stock (units)" value={totals ? formatNumber(totals.currentStock) : '—'} />
        <Stat label="Low stock" value={totals ? formatNumber(totals.low) : '—'} tone="warning" />
        <Stat label="Out of stock" value={totals ? formatNumber(totals.out) : '—'} tone="danger" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold text-ink">Central Company Warehouse</h2>
          {viewMode === 'normal' && (
            <>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search material…"
                aria-label="Search material"
                className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:shadow-focus focus:outline-none sm:ml-auto sm:w-56"
              />
              <Select
                label="Stock status"
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value)}
                className="w-[160px]"
                options={[{ value: 'all', label: 'All statuses' }, ...STOCK_STATUS_OPTIONS]}
              />
            </>
          )}
        </div>

        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load central stock">{error.message}</Alert>
            <Button className="mt-4" onClick={reload}>Try again</Button>
          </div>
        ) : viewMode === 'table' ? (
          <ExcelTable columns={columns} rows={items} initialSort={{ key: 'material', dir: 'asc' }} searchPlaceholder="Search central stock…" />
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            isLoading={isLoading}
            getRowKey={(r) => r.material.id}
            empty={{ icon: Warehouse, title: 'No stock yet', description: 'Receive or add stock to the central warehouse to see it here.' }}
            renderCard={(r) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{r.material.name}</span>
                    <p className="mt-0.5 text-xs text-ink-subtle">{r.material.code}</p>
                  </div>
                  <StatusBadge status={r.stockStatus} />
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {formatNumber(r.currentStock)} {r.material.unit} on hand · {formatNumber(r.purchasedReceived)} received
                </p>
                <p className="mt-1 text-xs text-ink-subtle">Last movement: {r.lastMovement ? formatDate(r.lastMovement) : '—'}</p>
              </div>
            )}
          />
        )}
      </Card>

      {primaryId && <CentralHistory warehouseId={primaryId} viewMode={viewMode} modulePath={modulePath} />}
    </>
  );
}

function CentralHistory({ warehouseId, viewMode }) {
  const [page, setPage] = useState(1);
  const load = useCallback(
    () => warehouseApi.transactions({ warehouseId, page, pageSize: 10 }),
    [warehouseId, page]
  );
  const { data, isLoading } = useAsync(load, [load]);
  const rows = data?.transactions ?? [];

  const columns = [
    { key: 'date', header: 'Date', value: (r) => r.date || '', render: (r) => <span className="whitespace-nowrap text-xs text-ink-subtle">{formatDate(r.date)}</span> },
    { key: 'ref', header: 'Reference', value: (r) => r.transactionNumber, render: (r) => <span className="text-xs text-ink-muted">{r.transactionNumber}{r.reference ? ` · ${r.reference}` : ''}</span> },
    { key: 'type', header: 'Type', value: (r) => r.type, render: (r) => <TypeBadge type={r.type} /> },
    { key: 'material', header: 'Material', value: (r) => r.material.name, render: (r) => <span className="text-ink">{r.material.name}</span> },
    { key: 'qty', header: 'Quantity', align: 'right', value: (r) => r.quantity, render: (r) => <span className="tabular-nums text-ink-muted">{formatNumber(r.quantity)} {r.unit}</span> },
    {
      key: 'movement', header: 'Movement', value: (r) => r.destinationWarehouse?.name || r.warehouse?.name || '',
      render: (r) => (
        <span className="text-xs text-ink-muted">
          {r.warehouse?.name}{r.destinationWarehouse ? <> <ArrowRight className="mx-1 inline h-3 w-3" /> {r.destinationWarehouse.name}</> : null}
        </span>
      ),
    },
  ];

  return (
    <Card className="mt-4">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-base font-semibold text-ink">Stock history</h2>
        <p className="mt-0.5 text-xs text-ink-subtle">Every movement into and out of the central company warehouse.</p>
      </div>
      {viewMode === 'table' ? (
        <ExcelTable columns={columns} rows={rows} initialSort={{ key: 'date', dir: 'desc' }} searchPlaceholder="Search history…" />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={isLoading}
            getRowKey={(r) => r.id}
            empty={{ icon: Warehouse, title: 'No movements yet', description: 'Receipts, issues, transfers and adjustments appear here.' }}
            renderCard={(r) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <TypeBadge type={r.type} />
                  <span className="text-xs text-ink-subtle">{formatDate(r.date)}</span>
                </div>
                <p className="mt-2 text-sm text-ink"><span className="font-medium">{r.material.name}</span> · {formatNumber(r.quantity)} {r.unit}</p>
                <p className="mt-1 text-xs text-ink-muted">{r.warehouse?.name}{r.destinationWarehouse ? ` → ${r.destinationWarehouse.name}` : ''}</p>
              </div>
            )}
          />
          <Pagination pagination={data?.pagination} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------ Contractor movements (total)

function ContractorMovementsView({ viewMode, scopes, lookups, title, lockedContractorId = null }) {
  const [filters, setFilters] = useState({
    search: '', contractorId: 'all', materialId: 'all', projectId: 'all',
    fromWarehouseId: 'all', toWarehouseId: 'all', location: 'all', dateFrom: '', dateTo: '', page: 1,
  });
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));

  const warehouseOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'Any warehouse' }];
    (scopes.central?.warehouses ?? []).forEach((w) => opts.push({ value: String(w.id), label: 'Central Company Warehouse' }));
    (scopes.contractors ?? []).forEach((c) => opts.push({ value: String(c.warehouseId), label: c.contractor?.name || c.name }));
    return opts;
  }, [scopes]);

  const load = useCallback(
    () => warehouseApi.contractorTransactions({
      search: filters.search || undefined,
      contractorId: lockedContractorId ?? (filters.contractorId !== 'all' ? filters.contractorId : undefined),
      materialId: filters.materialId !== 'all' ? filters.materialId : undefined,
      projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
      fromWarehouseId: filters.fromWarehouseId !== 'all' ? filters.fromWarehouseId : undefined,
      toWarehouseId: filters.toWarehouseId !== 'all' ? filters.toWarehouseId : undefined,
      location: filters.location !== 'all' ? filters.location : undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page: filters.page,
      pageSize: 20,
    }),
    [filters, lockedContractorId]
  );
  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const rows = data?.transactions ?? [];

  const columns = [
    { key: 'date', header: 'Date', value: (r) => r.date || '', render: (r) => <span className="whitespace-nowrap text-xs text-ink-subtle">{formatDate(r.date)}</span> },
    {
      key: 'contractor', header: 'Contractor',
      value: (r) => r.destination?.contractor?.name || r.source?.contractor?.name || '',
      render: (r) => <span className="text-ink">{r.destination?.contractor?.name || r.source?.contractor?.name || '—'}</span>,
    },
    { key: 'material', header: 'Material', value: (r) => r.material.name, render: (r) => <span className="text-ink-muted">{r.material.name}</span> },
    { key: 'qty', header: 'Quantity', align: 'right', value: (r) => r.quantity, render: (r) => <span className="tabular-nums text-ink-muted">{formatNumber(r.quantity)} {r.unit}</span> },
    { key: 'source', header: 'Source', value: (r) => r.source?.name || '', render: (r) => <span className="text-xs text-ink-muted">{r.source?.name || '—'}</span> },
    { key: 'destination', header: 'Destination', value: (r) => r.destination?.name || '', render: (r) => <span className="text-xs text-ink-muted">{r.destination?.name || '—'}</span> },
    { key: 'project', header: 'Project', value: (r) => r.project?.name || '', render: (r) => <span className="text-xs text-ink-subtle">{r.project?.name || '—'}</span> },
    { key: 'site', header: 'Site', value: (r) => r.site?.name || '', render: (r) => <span className="text-xs text-ink-subtle">{r.site?.name || '—'}</span> },
    { key: 'reference', header: 'Reference', value: (r) => r.reference || r.transactionNumber, render: (r) => <span className="text-xs text-ink-muted">{r.transactionNumber}{r.reference ? ` · ${r.reference}` : ''}</span> },
  ];

  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-subtle">Material sent to and moved between contractors — source, destination and reference for every movement.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <input
          type="search"
          value={filters.search}
          onChange={set('search')}
          placeholder="Search reference or material…"
          aria-label="Search movements"
          className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:shadow-focus focus:outline-none sm:w-56"
        />
        {!lockedContractorId && (
          <Select label="Contractor" value={filters.contractorId} onChange={set('contractorId')} className="w-[170px]"
            options={[{ value: 'all', label: 'All contractors' }, ...(scopes.contractors ?? []).map((c) => ({ value: String(c.contractor.id), label: c.contractor.name }))]} />
        )}
        <Select label="Material" value={filters.materialId} onChange={set('materialId')} className="w-[160px]"
          options={[{ value: 'all', label: 'All materials' }, ...(lookups.materials ?? []).map((m) => ({ value: String(m.id), label: m.name }))]} />
        <Select label="Project" value={filters.projectId} onChange={set('projectId')} className="w-[160px]"
          options={[{ value: 'all', label: 'All projects' }, ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))]} />
        <Select label="From" value={filters.fromWarehouseId} onChange={set('fromWarehouseId')} className="w-[160px]" options={warehouseOptions} />
        <Select label="To" value={filters.toWarehouseId} onChange={set('toWarehouseId')} className="w-[160px]" options={warehouseOptions} />
        <Select label="Location" value={filters.location} onChange={set('location')} className="w-[150px]"
          options={[{ value: 'all', label: 'All locations' }, ...(lookups.locations ?? []).map((l) => ({ value: l, label: l }))]} />
        <label className="flex items-center gap-1 text-xs text-ink-subtle">From
          <input type="date" value={filters.dateFrom} onChange={set('dateFrom')} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-ink-subtle">To
          <input type="date" value={filters.dateTo} onChange={set('dateTo')} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" />
        </label>
        <Button variant="secondary" onClick={() => setFilters({ search: '', contractorId: 'all', materialId: 'all', projectId: 'all', fromWarehouseId: 'all', toWarehouseId: 'all', location: 'all', dateFrom: '', dateTo: '', page: 1 })}>Clear</Button>
      </div>

      {error ? (
        <div className="p-5">
          <Alert tone="error" title="Could not load movements">{error.message}</Alert>
          <Button className="mt-4" onClick={reload}>Try again</Button>
        </div>
      ) : viewMode === 'table' ? (
        <ExcelTable columns={columns} rows={rows} initialSort={{ key: 'date', dir: 'desc' }} searchPlaceholder="Search movements…" />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={isLoading}
            getRowKey={(r) => r.id}
            empty={{ icon: ArrowLeftRight, title: 'No contractor movements', description: 'Transfers to and between contractors appear here.' }}
            renderCard={(r) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{r.material.name}</span>
                  <span className="text-xs text-ink-subtle">{formatDate(r.date)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{formatNumber(r.quantity)} {r.unit}</p>
                <p className="mt-1 text-xs text-ink-muted">{r.source?.name}{r.destination ? ` → ${r.destination.name}` : ''}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">{[r.project?.name, r.site?.name].filter(Boolean).join(' · ') || '—'} · {r.transactionNumber}</p>
              </div>
            )}
          />
          <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
        </>
      )}
    </Card>
  );
}

// -------------------------------------------- Individual contractor warehouse

function ContractorWarehouseView({ viewMode, contractorScope, scopes, lookups }) {
  const warehouseId = contractorScope.warehouseId;
  const contractorId = contractorScope.contractor?.id;

  const load = useCallback(() => warehouseApi.detail(warehouseId), [warehouseId]);
  const { data, isLoading } = useAsync(load, [load]);
  const stock = (data?.stock ?? []).filter((s) => s.quantity > 0);

  const columns = [
    { key: 'material', header: 'Material', value: (r) => r.material.name, render: (r) => (
      <div className="min-w-0"><span className="font-medium text-ink">{r.material.name}</span><p className="mt-0.5 text-xs text-ink-subtle">{r.material.code}</p></div>
    ) },
    { key: 'qty', header: 'Current quantity', align: 'right', value: (r) => r.quantity, render: (r) => <span className="tabular-nums font-medium text-ink">{formatNumber(r.quantity)} <span className="text-xs font-normal text-ink-subtle">{r.unit}</span></span> },
    { key: 'project', header: 'Project', value: (r) => r.project?.name || '', render: (r) => <span className="text-xs text-ink-subtle">{r.project?.name || '—'}</span> },
    { key: 'site', header: 'Site', value: (r) => r.site?.name || '', render: (r) => <span className="text-xs text-ink-subtle">{r.site?.name || '—'}</span> },
    { key: 'status', header: 'Status', value: (r) => r.stockStatus, render: (r) => <StatusBadge status={r.stockStatus} /> },
  ];

  return (
    <>
      <Card className="mb-4">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold text-ink">{contractorScope.contractor?.name} — current stock</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">What this contractor is currently holding. Every quantity traces back to a movement in the history below.</p>
        </div>
        {viewMode === 'table' ? (
          <ExcelTable columns={columns} rows={stock} initialSort={{ key: 'material', dir: 'asc' }} searchPlaceholder="Search stock…" />
        ) : (
          <DataTable
            columns={columns}
            rows={stock}
            isLoading={isLoading}
            getRowKey={(r) => r.id}
            empty={{ icon: Warehouse, title: 'No stock held', description: 'This contractor is not currently holding any material.' }}
            renderCard={(r) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><span className="font-medium text-ink">{r.material.name}</span><p className="mt-0.5 text-xs text-ink-subtle">{r.material.code}</p></div>
                  <StatusBadge status={r.stockStatus} />
                </div>
                <p className="mt-2 text-sm text-ink-muted">{formatNumber(r.quantity)} {r.unit}{r.project ? ` · ${r.project.name}` : ''}{r.site ? ` · ${r.site.name}` : ''}</p>
              </div>
            )}
          />
        )}
      </Card>

      <ContractorMovementsView
        viewMode={viewMode}
        scopes={scopes}
        lookups={lookups}
        lockedContractorId={contractorId}
        title={`${contractorScope.contractor?.name} — movement history`}
      />
    </>
  );
}

function Stat({ label, value, tone }) {
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-amber-600' : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
