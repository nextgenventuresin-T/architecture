import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Eye, Pencil, PackageCheck, ShoppingCart, LayoutGrid, Table as TableIcon } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Select from '../../../components/ui/Select';
import ProcurementFilters from '../../../components/procurement/ProcurementFilters';
import ProcurementSummary from '../../../components/procurement/ProcurementSummary';
import ExcelTable from '../../../components/warehouse/ExcelTable';
import Pagination from '../../../components/projects/Pagination';
import useAsync from '../../../hooks/useAsync';
import { procurementApi } from '../../../api/procurementApi';
import ReceiveMovementDialog from '../../../components/procurement/ReceiveMovementDialog';
import { formatCurrency, formatNumber, formatDate } from '../../../utils/format';
import {
  PROCUREMENT_STATUS_LABELS,
  PROCUREMENT_STATUS_TONE,
  PRIORITY_LABELS,
  PRIORITY_TONE,
  PROCUREMENT_KIND_LABELS,
  procurementFlowLabel,
  PROCUREMENT_KIND_TONE,
  PROCUREMENT_KIND_OPTIONS,
  EDITABLE_STATUSES,
} from '../../../utils/procurementOptions';

const INITIAL_FILTERS = {
  search: '',
  status: 'all',
  priority: 'all',
  kind: 'all',
  projectId: 'all',
  siteId: 'all',
  supplier: 'all',
  page: 1,
};

const projectName = (row) => row.project?.name || (row.kind === 'central_purchase' ? 'Central warehouse' : '—');
const amountOf = (row) => {
  if (row.totalAmount != null && Number(row.totalAmount) > 0) return Number(row.totalAmount);
  if (row.purchaseRate != null && Number(row.purchaseRate) > 0 && Number(row.quantity) > 0) {
    return Number((Number(row.purchaseRate) * Number(row.quantity)).toFixed(2));
  }
  if (row.estimatedTotal != null && Number(row.estimatedTotal) > 0) return Number(row.estimatedTotal);
  if (row.estimatedRate != null && Number(row.estimatedRate) > 0 && Number(row.quantity) > 0) {
    return Number((Number(row.estimatedRate) * Number(row.quantity)).toFixed(2));
  }
  return 0;
};

export default function ProcurementListPage({ basePath = '/admin' }) {
  const modulePath = basePath === '/admin' ? '/admin/procurement' : basePath;
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [viewMode, setViewMode] = useState('normal');
  const [lookups, setLookups] = useState({ projects: [], suppliers: [], summary: null });
  const [receiveMovement, setReceiveMovement] = useState(null);
  const [receiveFlash, setReceiveFlash] = useState(null);
  const [receiveError, setReceiveError] = useState(null);

  const loadLookups = useCallback(() => {
    procurementApi
      .lookups()
      .then(setLookups)
      .catch(() => setLookups({ projects: [], suppliers: [], summary: null }));
  }, []);

  useEffect(loadLookups, [loadLookups]);

  const load = useCallback(
    () =>
      procurementApi.list({
        search: filters.search || undefined,
        status: filters.status,
        priority: filters.priority,
        kind: filters.kind !== 'all' ? filters.kind : undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
        supplier: filters.supplier !== 'all' ? filters.supplier : undefined,
        page: filters.page,
        pageSize: viewMode === 'table' ? 50 : 10,
      }),
    [filters.search, filters.status, filters.priority, filters.kind, filters.projectId, filters.siteId, filters.supplier, filters.page, viewMode]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const requests = data?.requests ?? [];

  // A movement-kind request that has been dispatched ('ordered') is in transit
  // and can be received by the DESTINATION contractor (or Admin/Procurement/
  // Warehouse). `canReceiveMovement` is computed server-side for this exact
  // viewer, so a source contractor is never offered Receive on their own send.
  const canReceiveRow = (row) => Boolean(row.canReceiveMovement);

  async function openReceive(row) {
    setReceiveError(null);
    try {
      const detail = await procurementApi.detail(row.id);
      if (detail?.movement && detail.movement.status === 'in_transit') {
        setReceiveMovement(detail.movement);
      } else {
        setReceiveError({ message: 'This shipment is not in transit (it may already be received).' });
      }
    } catch (caught) {
      setReceiveError({ message: 'Could not load the shipment to receive.' });
    }
  }

  const kindBadge = (row) => (
    <Badge tone={PROCUREMENT_KIND_TONE[row.kind] ?? 'neutral'} title={PROCUREMENT_KIND_LABELS[row.kind] ?? row.kind}>{procurementFlowLabel(row)}</Badge>
  );
  const statusBadge = (row) => (
    <Badge tone={PROCUREMENT_STATUS_TONE[row.status] ?? 'neutral'}>{PROCUREMENT_STATUS_LABELS[row.status] ?? row.status}</Badge>
  );

  // Columns shared by normal (DataTable) and table (ExcelTable) views.
  const columns = [
    {
      key: 'request', header: 'Reference', value: (row) => row.requestNumber,
      render: (row) => (
        <div className="min-w-0">
          <Link to={`${modulePath}/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">{row.requestNumber}</Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.createdAt)}</p>
        </div>
      ),
    },
    { key: 'kind', header: 'Type', value: (row) => procurementFlowLabel(row), render: kindBadge },
    { key: 'material', header: 'Material', value: (row) => row.material.name,
      render: (row) => (<div><p className="text-ink">{row.material.name}</p><p className="text-xs text-ink-subtle">{formatNumber(row.quantity)} {row.unit}</p></div>) },
    { key: 'source', header: 'Source', value: (row) => row.source?.name || row.supplier || '', render: (row) => <span className="text-xs text-ink-muted">{row.source?.name || row.supplier || '—'}</span> },
    { key: 'destination', header: 'Destination', value: (row) => row.destination?.name || projectName(row), render: (row) => <span className="text-xs text-ink-muted">{row.destination?.name || projectName(row)}</span> },
    { key: 'project', header: 'Project', value: (row) => row.project?.name || '', render: (row) => <span className="text-xs text-ink-subtle">{row.project?.name || '—'}</span> },
    { key: 'site', header: 'Site', value: (row) => row.site?.name || '', render: (row) => <span className="text-xs text-ink-subtle">{row.site?.name || '—'}</span> },
    { key: 'amount', header: 'Amount', align: 'right', value: (row) => amountOf(row), render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(amountOf(row))}</span> },
    { key: 'status', header: 'Status', value: (row) => row.status, render: statusBadge },
  ];

  // Normal view keeps the original, richer column set (project/site guarded).
  const normalColumns = [
    columns[0],
    columns[1],
    columns[2],
    { key: 'where', header: 'Destination', render: (row) => (
      <div className="whitespace-nowrap">
        <p className="text-ink-muted">{row.destination?.name || projectName(row)}</p>
        {row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}
      </div>
    ) },
    { key: 'total', header: 'Amount', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(amountOf(row))}</span> },
    { key: 'priority', header: 'Priority', render: (row) => <Badge tone={PRIORITY_TONE[row.priority] ?? 'neutral'}>{PRIORITY_LABELS[row.priority] ?? row.priority}</Badge> },
    { key: 'status', header: 'Status', render: (row) => (
      <div>
        {statusBadge(row)}
        {row.purchaseOrder && (
          <p className="mt-1 text-xs text-ink-subtle">{row.purchaseOrder.poNumber}</p>
        )}
      </div>
    ) },
    { key: 'actions', header: 'Actions', align: 'right', render: (row) => <RowActions row={row} modulePath={modulePath} canReceive={canReceiveRow(row)} onReceive={openReceive} /> },
  ];

  return (
    <>
      <PageHeader
        title="Procurement"
        description="Raise, approve, order and fulfil material purchases — for projects, the central warehouse and contractors."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Procurement' }]}
        actions={
          <Link to={`${modulePath}/new`}>
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add procurement request
            </Button>
          </Link>
        }
      />

      {receiveFlash && <Alert tone="positive" className="mb-4" onClose={() => setReceiveFlash(null)}>{receiveFlash}</Alert>}
      {receiveError && <Alert tone="error" className="mb-4" onClose={() => setReceiveError(null)}>{receiveError.message}</Alert>}

      {lookups.summary && (
        <ProcurementSummary
          summary={lookups.summary}
          onSelectStatus={(status) => setFilters((f) => ({ ...f, status, page: 1 }))}
        />
      )}

      {error ? (
        <>
          <Alert tone="error" title="Could not load procurement requests">{error.message}</Alert>
          <Button className="mt-4" onClick={reload}>Try again</Button>
        </>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <ProcurementFilters
                filters={filters}
                onChange={setFilters}
                projects={lookups.projects}
                suppliers={lookups.suppliers}
              />
            </div>
            <div className="flex items-end gap-2">
              <Select
                label="Type"
                value={filters.kind}
                onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value, page: 1 }))}
                className="w-[170px]"
                options={[{ value: 'all', label: 'All types' }, ...PROCUREMENT_KIND_OPTIONS]}
              />
              <div className="inline-flex overflow-hidden rounded-lg border border-line">
                <button type="button" onClick={() => setViewMode('normal')}
                  className={`inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium ${viewMode === 'normal' ? 'bg-brand-600 text-white' : 'bg-white text-ink-muted hover:bg-canvas'}`}>
                  <LayoutGrid className="h-4 w-4" /> Normal
                </button>
                <button type="button" onClick={() => setViewMode('table')}
                  className={`inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium ${viewMode === 'table' ? 'bg-brand-600 text-white' : 'bg-white text-ink-muted hover:bg-canvas'}`}>
                  <TableIcon className="h-4 w-4" /> Table
                </button>
              </div>
            </div>
          </div>

          {viewMode === 'table' ? (
            <ExcelTable columns={columns} rows={requests} initialSort={{ key: 'request', dir: 'desc' }} searchPlaceholder="Search procurement…" />
          ) : (
            <>
              <DataTable
                columns={normalColumns}
                rows={requests}
                isLoading={isLoading}
                empty={{
                  icon: ShoppingCart,
                  title: 'No procurement requests match these filters',
                  description: 'Clear the filters, or raise a new procurement request.',
                  action: <Button variant="secondary" onClick={() => setFilters(INITIAL_FILTERS)}>Clear filters</Button>,
                }}
                renderCard={(row) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`${modulePath}/${row.id}`} className="font-medium text-ink hover:text-brand-700">{row.requestNumber}</Link>
                        <p className="mt-0.5 text-xs text-ink-subtle">{row.material.name}</p>
                      </div>
                      {statusBadge(row)}
                    </div>
                    <div className="mt-2 flex items-center gap-2">{kindBadge(row)}</div>
                    <p className="mt-2 text-sm text-ink-muted">
                      {(row.source?.name || row.supplier || '—')} → {(row.destination?.name || projectName(row))}
                    </p>
                    <p className="mt-1 text-xs text-ink-subtle">{formatNumber(row.quantity)} {row.unit} · {formatCurrency(amountOf(row))}</p>
                    <div className="mt-3"><RowActions row={row} modulePath={modulePath} canReceive={canReceiveRow(row)} onReceive={openReceive} /></div>
                  </div>
                )}
              />
              <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
            </>
          )}
        </Card>
      )}

      <ReceiveMovementDialog
        movement={receiveMovement}
        onClose={() => setReceiveMovement(null)}
        onReceived={(message) => {
          setReceiveMovement(null);
          setReceiveFlash(message);
          reload();
        }}
        onError={(e) => setReceiveError(e)}
      />
    </>
  );
}

function RowActions({ row, modulePath, canReceive, onReceive }) {
  const base = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors';
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link to={`${modulePath}/${row.id}`} className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`} aria-label={`View ${row.requestNumber}`}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View
      </Link>
      {canReceive && (
        <button type="button" onClick={() => onReceive(row)} className={`${base} border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100`} aria-label={`Receive ${row.requestNumber}`}>
          <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" /> Receive
        </button>
      )}
      {EDITABLE_STATUSES.includes(row.status) && (
        <Link to={`${modulePath}/${row.id}/edit`} className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`} aria-label={`Edit ${row.requestNumber}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
        </Link>
      )}
    </div>
  );
}
