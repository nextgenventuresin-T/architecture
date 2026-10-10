import { useCallback, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import {
  Pencil, RefreshCw, Package, TrendingDown, PackageX, History,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, SlidersHorizontal,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import DataTable from '../../../components/ui/DataTable';
import EmptyState from '../../../components/ui/EmptyState';
import InfoList from '../../../components/projects/InfoList';
import Select from '../../../components/ui/Select';
import StockMovementDialog from '../../../components/warehouse/StockMovementDialog';
import useAsync from '../../../hooks/useAsync';
import useAuth from '../../../hooks/useAuth';
import { warehouseApi } from '../../../api/warehouseApi';
import { ROLES } from '../../../config/roles';
import { formatNumber, formatDate, formatCurrency } from '../../../utils/format';
import {
  WAREHOUSE_STATUS_LABELS,
  WAREHOUSE_STATUS_TONE,
  STOCK_STATUS_OPTIONS,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_TONE,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_TONE,
  transactionSign,
} from '../../../utils/warehouseOptions';

export default function WarehouseDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('stock');
  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [movement, setMovement] = useState(null);
  const [stockFilters, setStockFilters] = useState({ stockStatus: 'all', category: 'all', projectId: 'all' });
  const [lookups, setLookups] = useState({ warehouses: [], materials: [], projects: [], pendingReceipts: [] });

  // Usage overview state (site-wise consumption & current stock with received/used/balance)
  const [usageData, setUsageData] = useState({ currentStock: [], materialUsed: [], filterSites: [] });
  const [selectedSiteId, setSelectedSiteId] = useState('all');
  const [usageDateFrom, setUsageDateFrom] = useState('');
  const [usageDateTo, setUsageDateTo] = useState('');
  const [loadingUsage, setLoadingUsage] = useState(false);

  const canMoveStock = [ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.PROCUREMENT].includes(user?.role);
  const canManage = [ROLES.ADMIN, ROLES.WAREHOUSE].includes(user?.role);

  const loadUsage = useCallback(() => {
    if (!id) return;
    setLoadingUsage(true);
    const params = {};
    if (selectedSiteId !== 'all') params.siteId = selectedSiteId;
    if (usageDateFrom) params.dateFrom = usageDateFrom;
    if (usageDateTo) params.dateTo = usageDateTo;
    if (stockFilters.projectId !== 'all') params.projectId = stockFilters.projectId;

    warehouseApi
      .usageOverview(id, params)
      .then((res) => setUsageData(res || { currentStock: [], materialUsed: [], filterSites: [] }))
      .catch((err) => console.error('Error fetching usage overview:', err))
      .finally(() => setLoadingUsage(false));
  }, [id, selectedSiteId, usageDateFrom, usageDateTo, stockFilters.projectId]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const load = useCallback(
    () =>
      warehouseApi
        .detail(id, {
          stockStatus: stockFilters.stockStatus,
          category: stockFilters.category !== 'all' ? stockFilters.category : undefined,
          projectId: stockFilters.projectId !== 'all' ? stockFilters.projectId : undefined,
        })
        .then((data) => {
          // Lookups power the movement dialog; fetched alongside the detail so
          // opening a dialog never has to wait on a second round trip.
          warehouseApi.lookups().then(setLookups).catch(() => {});
          return data;
        }),
    [id, stockFilters]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);

  if (error) {
    return (
      <>
        <PageHeader
          title="Warehouse"
          breadcrumbs={[
            { label: 'Dashboard', to: '/admin' },
            { label: 'Warehouse', to: '/admin/warehouse' },
            { label: 'Not found' },
          ]}
          showBack
        />
        <Alert tone="error" title="Could not load this warehouse">{error.message}</Alert>
        <Link to="/admin/warehouse" className="mt-4 inline-block">
          <Button variant="secondary">Back to warehouses</Button>
        </Link>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        <PageHeader
          title="Loading warehouse…"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Warehouse', to: '/admin/warehouse' }]}
          showBack
        />
        <div className="space-y-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const { warehouse, stock, lowStock, outOfStock, recentTransactions } = data;

  function handleMovementSaved(message) {
    setMovement(null);
    setFlash(message);
    reload();
    loadUsage();
  }

  const setFilter = (key) => (event) =>
    setStockFilters((f) => ({ ...f, [key]: event.target.value }));

  const categories = [...new Set((lookups.materials ?? []).map((m) => m.category))].sort();

  const stockColumns = [
    {
      key: 'material',
      header: 'Material',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/admin/materials/${row.material.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.material.name}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{row.material.code} · {row.material.category}</p>
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
      header: 'Status',
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

  const txColumns = [
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
        <Badge tone={TRANSACTION_TYPE_TONE[row.type] ?? 'neutral'}>
          {TRANSACTION_TYPE_LABELS[row.type] ?? row.type}
        </Badge>
      ),
    },
    { key: 'material', header: 'Material', render: (row) => <span className="text-ink-muted">{row.material.name}</span> },
    {
      key: 'quantity',
      header: 'Quantity',
      align: 'right',
      render: (row) => (
        <span className="whitespace-nowrap tabular-nums text-ink">
          {transactionSign(row)} {formatNumber(row.quantity)}{' '}
          <span className="text-xs text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'where',
      header: 'Project / site',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-ink-muted">
          {row.project?.name ?? '—'}{row.site ? ` · ${row.site.name}` : ''}
        </span>
      ),
    },
    { key: 'by', header: 'By', render: (row) => <span className="text-xs text-ink-muted">{row.performedBy?.name ?? '—'}</span> },
  ];

  const currentStockRows = usageData.currentStock?.length > 0 ? usageData.currentStock : stock;

  const currentStockColumns = [
    {
      key: 'material',
      header: 'Material',
      render: (row) => (
        <div className="min-w-0">
          <Link
            to={`/admin/materials/${row.material_id || row.material?.id}`}
            className="font-medium text-ink hover:text-brand-700 hover:underline"
          >
            {row.name || row.material?.name}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {row.code || row.material?.code} · {row.category || row.material?.category}
          </p>
        </div>
      ),
    },
    {
      key: 'received',
      header: 'Total Received',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink">
          {formatNumber(row.received_quantity ?? row.quantity)}{' '}
          <span className="text-xs text-ink-subtle">{row.unit || row.material?.unit}</span>
        </span>
      ),
    },
    {
      key: 'used',
      header: 'Total Used',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-amber-700">
          {formatNumber(row.used_quantity ?? 0)}{' '}
          <span className="text-xs text-ink-subtle">{row.unit || row.material?.unit}</span>
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Available Balance',
      align: 'right',
      render: (row) => {
        const bal = Number(row.available_stock ?? row.quantity);
        return (
          <span className="tabular-nums font-bold text-emerald-700">
            {formatNumber(bal)}{' '}
            <span className="text-xs font-normal text-ink-subtle">{row.unit || row.material?.unit}</span>
          </span>
        );
      },
    },
    {
      key: 'value',
      header: 'Stock Value',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-medium text-ink">
          {formatCurrency(row.stock_value ?? (Number(row.quantity || 0) * Number(row.material?.defaultRate || 0)))}
        </span>
      ),
    },
  ];

  const usedColumns = [
    {
      key: 'material',
      header: 'Material Consumed',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.material_name}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">{row.material_code}</p>
        </div>
      ),
    },
    {
      key: 'quantity_used',
      header: 'Quantity Used',
      align: 'right',
      render: (row) => (
        <span className="font-semibold tabular-nums text-amber-700">
          {formatNumber(row.quantity_used)} <span className="text-xs font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Usage Date',
      render: (row) => <span className="whitespace-nowrap text-ink">{formatDate(row.work_date)}</span>,
    },
    {
      key: 'site',
      header: 'Project & Site',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.project_name || 'Project'}</p>
          <p className="text-xs text-ink-subtle">{row.site_name || 'Main Site'}</p>
        </div>
      ),
    },
    {
      key: 'phase',
      header: 'Task / Scope',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">
            {row.task_name ? `Task: ${row.task_name}` : (row.phase_name ? `Phase ${row.phase_number}: ${row.phase_name}` : 'General')}
          </p>
          <p className="text-xs text-ink-subtle">{row.subcategory}</p>
        </div>
      ),
    },
    {
      key: 'contractor',
      header: 'Contractor',
      render: (row) => <span className="font-medium text-ink">{row.contractor_name || '—'}</span>,
    },
    {
      key: 'ref',
      header: 'Ledger Ref',
      render: (row) => (
        <span className="font-mono text-xs text-ink-subtle">
          {row.transaction_number || '—'}
        </span>
      ),
    },
  ];

  const tabs = [
    { id: 'stock', label: 'Current Stock', count: currentStockRows.length },
    { id: 'used', label: 'Material Used', count: usageData.materialUsed?.length || 0 },
    { id: 'alerts', label: 'Stock Alerts', count: lowStock.length + outOfStock.length },
    { id: 'transactions', label: 'Recent Transactions', count: recentTransactions.length },
  ];

  const movementButton =
    'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink transition-colors hover:border-brand-200 hover:bg-brand-50';

  return (
    <>
      <PageHeader
        title={warehouse.name}
        description={`${warehouse.code} · ${warehouse.location} · ${formatNumber(warehouse.materialCount)} materials, ${formatNumber(warehouse.totalQuantity)} units held`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Warehouse', to: '/admin/warehouse' },
          { label: warehouse.name },
        ]}
        showBack
        actions={
          <>
            <Badge tone={WAREHOUSE_STATUS_TONE[warehouse.status] ?? 'neutral'}>
              {WAREHOUSE_STATUS_LABELS[warehouse.status] ?? warehouse.status}
            </Badge>
            <Button variant="secondary" onClick={() => { reload(); loadUsage(); }} aria-label="Refresh warehouse">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            {canManage && (
              <Link to={`/admin/warehouse/${id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Button>
              </Link>
            )}
          </>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Warehouse information" />
          <CardBody>
            <InfoList
              columns={1}
              items={[
                { label: 'Warehouse code', value: warehouse.code },
                { label: 'Location', value: warehouse.location },
                { label: 'Materials in stock', value: formatNumber(warehouse.materialCount) },
                { label: 'Total quantity', value: formatNumber(warehouse.totalQuantity) },
                { label: 'Low stock items', value: formatNumber(warehouse.lowCount) },
                { label: 'Out of stock items', value: formatNumber(warehouse.outCount) },
                { label: 'Last updated', value: formatDate(warehouse.lastUpdated) },
              ]}
            />
            {warehouse.description && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Description</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{warehouse.description}</p>
              </div>
            )}

            {canMoveStock && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                <button type="button" className={movementButton} onClick={() => setMovement('receipt')}>
                  <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Receive
                </button>
                <button type="button" className={movementButton} onClick={() => setMovement('issue')}>
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                  Issue
                </button>
                <button type="button" className={movementButton} onClick={() => setMovement('transfer')}>
                  <ArrowLeftRight className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  Transfer
                </button>
                <button type="button" className={movementButton} onClick={() => setMovement('adjustment')}>
                  <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                  Adjust
                </button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="px-5 pt-1" />

          {activeTab === 'stock' && (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
                {usageData.filterSites?.length > 0 && (
                  <Select
                    label="Filter by site"
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    className="w-[180px]"
                    options={[
                      { value: 'all', label: 'All Sites' },
                      ...usageData.filterSites.map((s) => ({ value: String(s.id), label: `${s.name} (${s.project_name})` })),
                    ]}
                  />
                )}
                <Select
                  label="Filter by category"
                  value={stockFilters.category}
                  onChange={setFilter('category')}
                  className="w-[160px]"
                  options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
                />
                <Select
                  label="Filter by project"
                  value={stockFilters.projectId}
                  onChange={setFilter('projectId')}
                  className="w-[180px]"
                  options={[
                    { value: 'all', label: 'All projects' },
                    ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
                  ]}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStockFilters({ stockStatus: 'all', category: 'all', projectId: 'all' });
                    setSelectedSiteId('all');
                  }}
                >
                  Clear filters
                </Button>
              </div>

              <DataTable
                columns={currentStockColumns}
                rows={currentStockRows}
                empty={{
                  icon: Package,
                  title: 'No stock in this warehouse',
                  description: 'Receive material into this warehouse to see it here.',
                }}
              />
            </>
          )}

          {activeTab === 'used' && (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
                {usageData.filterSites?.length > 0 && (
                  <Select
                    label="Filter by site"
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    className="w-[180px]"
                    options={[
                      { value: 'all', label: 'All Sites' },
                      ...usageData.filterSites.map((s) => ({ value: String(s.id), label: `${s.name} (${s.project_name})` })),
                    ]}
                  />
                )}
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span>Date:</span>
                  <input
                    type="date"
                    value={usageDateFrom}
                    onChange={(e) => setUsageDateFrom(e.target.value)}
                    className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={usageDateTo}
                    onChange={(e) => setUsageDateTo(e.target.value)}
                    className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                  />
                </div>
                {(selectedSiteId !== 'all' || usageDateFrom || usageDateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedSiteId('all');
                      setUsageDateFrom('');
                      setUsageDateTo('');
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <DataTable
                columns={usedColumns}
                rows={usageData.materialUsed || []}
                empty={{
                  icon: Package,
                  title: 'No material usage recorded',
                  description: 'Materials consumed via daily work updates will be itemized here.',
                }}
              />
            </>
          )}

          {activeTab === 'alerts' && (
            <div className="divide-y divide-line">
              <AlertSection
                title="Low stock"
                description="At or below the reorder point set on the material."
                icon={TrendingDown}
                rows={lowStock}
                tone="warning"
              />
              <AlertSection
                title="Out of stock"
                description="Nothing left in this warehouse."
                icon={PackageX}
                rows={outOfStock}
                tone="danger"
              />
            </div>
          )}

          {activeTab === 'transactions' && (
            <>
              <DataTable
                columns={txColumns}
                rows={recentTransactions}
                empty={{
                  icon: History,
                  title: 'No movements yet',
                  description: 'Receipts, issues, transfers and adjustments appear here.',
                }}
              />
              {recentTransactions.length > 0 && (
                <div className="border-t border-line px-5 py-3.5 text-sm">
                  <Link to="/admin/warehouse" className="text-brand-700 hover:underline">
                    View the full transaction history
                  </Link>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {movement && (
        <StockMovementDialog
          type={movement}
          lookups={lookups}
          defaults={{ warehouse_id: String(warehouse.id) }}
          onClose={() => setMovement(null)}
          onSaved={handleMovementSaved}
        />
      )}
    </>
  );
}

function AlertSection({ title, description, icon: Icon, rows, tone }) {
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone === 'danger' ? 'text-danger' : 'text-amber-600'}`} aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        <Badge tone={tone}>{rows.length}</Badge>
      </div>
      <p className="mb-3 text-xs text-ink-subtle">{description}</p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-canvas/50 px-4 py-3 text-sm text-ink-muted">
          Nothing here — good.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-canvas/50 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="text-ink">{row.material.name}</span>
                <span className="ml-1.5 text-xs text-ink-subtle">{row.material.code}</span>
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                {formatNumber(row.quantity)} / {formatNumber(row.minStock)} {row.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
