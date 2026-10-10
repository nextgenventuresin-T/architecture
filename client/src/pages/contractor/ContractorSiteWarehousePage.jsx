import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Warehouse,
  Package,
  Search,
  Building2,
  MapPin,
  ArrowUpRight,
  ArrowDownLeft,
  Truck,
  Plus,
  RefreshCw,
  Scale,
  CalendarCheck,
  CheckCircle2,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import DataTable from '../../components/ui/DataTable';
import { warehouseApi } from '../../api/warehouseApi';
import { financeApi } from '../../api/financeApi';
import { formatNumber, formatDate, formatCurrency } from '../../utils/format';

/**
 * Contractor Site Warehouse:
 * - Dual Views:
 *   A. Current Available Stock (Material, Received, Used, Balance, Stock Value)
 *   B. Material Used / Consumed (Material, Quantity Used, Usage Date, Project, Site, Phase)
 * - Headline KPI: Total Received -> Total Used -> Current Balance
 * - Site-wise & Project-wise filtering
 */
export default function ContractorSiteWarehousePage() {
  const navigate = useNavigate();

  const [warehouseInfo, setWarehouseInfo] = useState(null);
  const [usageData, setUsageData] = useState({ currentStock: [], materialUsed: [], filterSites: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('available'); // 'available' or 'used'
  const [search, setSearch] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 1. Initial resolution of contractor warehouse
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First resolve the contractor's warehouse
      const invData = await financeApi.contractorInventory();
      const wh = invData?.warehouse;
      setWarehouseInfo(wh || null);

      if (wh?.id) {
        const params = {};
        if (selectedSiteId !== 'all') params.siteId = selectedSiteId;
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;

        const overview = await warehouseApi.usageOverview(wh.id, params);
        setUsageData(overview || { currentStock: [], materialUsed: [], filterSites: [] });
      }
    } catch (err) {
      console.error('Failed to load contractor warehouse overview:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute summary KPI numbers
  const summary = useMemo(() => {
    const received = usageData.currentStock.reduce((sum, item) => sum + Number(item.totalReceived ?? item.received_quantity ?? 0), 0);
    const used = usageData.currentStock.reduce((sum, item) => sum + Number(item.totalUsed ?? item.used_quantity ?? 0), 0);
    const balance = usageData.currentStock.reduce((sum, item) => sum + Number(item.availableBalance ?? item.available_stock ?? 0), 0);
    const totalValue = usageData.currentStock.reduce((sum, item) => sum + Number(item.stockValue ?? item.stock_value ?? 0), 0);
    return { received, used, balance, totalValue };
  }, [usageData.currentStock]);

  // Filtered rows for Tab A: Available Stock
  const filteredAvailable = useMemo(() => {
    return usageData.currentStock.filter((item) => {
      const q = search.trim().toLowerCase();
      if (q && !item.name?.toLowerCase().includes(q) && !(item.code || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [usageData.currentStock, search]);

  // Filtered rows for Tab B: Used Stock
  const filteredUsed = useMemo(() => {
    return usageData.materialUsed.filter((item) => {
      const q = search.trim().toLowerCase();
      const matName = (item.materialName || item.material_name || '').toLowerCase();
      const matCode = (item.materialCode || item.material_code || '').toLowerCase();
      if (q && !matName.includes(q) && !matCode.includes(q)) {
        return false;
      }
      return true;
    });
  }, [usageData.materialUsed, search]);

  const availableColumns = [
    {
      key: 'material',
      header: 'Material / Tool',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink text-xs">{row.name}</p>
          <p className="mt-0.5 text-[11px] text-ink-subtle">
            {row.code} · <Badge tone="neutral" className="text-[10px] py-0 px-1.5">{row.category || 'General'}</Badge>
          </p>
        </div>
      ),
    },
    {
      key: 'received',
      header: 'Total Received',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-medium text-ink">
          {formatNumber(row.totalReceived ?? row.received_quantity)}{' '}
          <span className="text-[11px] font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'used',
      header: 'Consumed / Used',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-medium text-amber-700">
          {formatNumber(row.totalUsed ?? row.used_quantity)}{' '}
          <span className="text-[11px] font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Available Stock Balance',
      align: 'right',
      render: (row) => {
        const bal = Number(row.availableBalance ?? row.available_stock ?? 0);
        return (
          <span className={`tabular-nums font-bold text-sm ${bal > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {formatNumber(bal)}{' '}
            <span className="text-xs font-normal text-ink-subtle">{row.unit}</span>
          </span>
        );
      },
    },
    {
      key: 'value',
      header: 'Inventory Value',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-xs text-ink-muted">
          {formatCurrency(row.stockValue ?? row.stock_value)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <button
          type="button"
          onClick={() =>
            navigate(
              `/contractor/material-movements?materialId=${row.materialId || row.material_id}`
            )
          }
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] font-medium text-ink hover:bg-canvas transition-colors"
        >
          <ArrowUpRight className="h-3 w-3 text-brand-600" />
          Transfer
        </button>
      ),
    },
  ];

  const usedColumns = [
    {
      key: 'material',
      header: 'Material Consumed',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink text-xs">{row.materialName || row.material_name}</p>
          <p className="mt-0.5 text-[11px] text-ink-subtle">{row.materialCode || row.material_code}</p>
        </div>
      ),
    },
    {
      key: 'quantity_used',
      header: 'Quantity Used',
      align: 'right',
      render: (row) => (
        <span className="font-semibold tabular-nums text-amber-700">
          {formatNumber(row.quantityUsed ?? row.quantity_used)}{' '}
          <span className="text-xs font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Usage Date',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-ink">
          {formatDate(row.date || row.work_date)}
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Project & Site',
      render: (row) => (
        <div>
          <p className="font-medium text-ink text-xs">{row.projectName || row.project_name || 'Project'}</p>
          <p className="text-[11px] text-ink-subtle">{row.siteName || row.site_name || 'All Sites / General'}</p>
        </div>
      ),
    },
    {
      key: 'phase',
      header: 'Task / Scope',
      render: (row) => (
        <div>
          <p className="font-medium text-ink text-xs">
            {row.taskName || row.task_name ? `Task: ${row.taskName || row.task_name}` : (row.phaseTitle || row.phase_name || 'General')}
          </p>
          <p className="text-[11px] text-ink-subtle">{row.subcategory || '—'}</p>
        </div>
      ),
    },
    {
      key: 'ref',
      header: 'Ledger Ref',
      render: (row) => (
        <span className="font-mono text-xs text-ink-subtle">
          {row.transactionNumber || row.transaction_number || '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={warehouseInfo?.name || 'Contractor Site Warehouse'}
        description={`Warehouse Code: ${warehouseInfo?.code || 'WH-SITE'} · Single inventory ledger linked to Daily Work Updates`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-medium text-ink hover:bg-canvas transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/contractor/daily-work')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-2xs hover:bg-amber-100 transition-colors"
            >
              <CalendarCheck className="h-3.5 w-3.5 text-amber-700" />
              Record Usage in Daily Work
            </button>
            <button
              type="button"
              onClick={() => navigate('/contractor/procurement/new')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Request Material
            </button>
          </div>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      {/* KPI Headline Summary: Received -> Used -> Balance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
        <div className="rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Total Stock Received</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Truck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {loading ? '…' : formatNumber(summary.received)}
          </p>
          <p className="mt-1 text-[11px] text-ink-subtle">Dispatched to your warehouse</p>
        </div>

        <div className="rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Total Material Used</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {loading ? '…' : formatNumber(summary.used)}
          </p>
          <p className="mt-1 text-[11px] text-ink-subtle">Consumed in daily work updates</p>
        </div>

        <div className="rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Current Available Balance</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
            {loading ? '…' : formatNumber(summary.balance)}
          </p>
          <p className="mt-1 text-[11px] text-ink-subtle">Available for immediate on-site use</p>
        </div>

        <div className="rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Available Stock Value</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink-subtle">
              <Package className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {loading ? '…' : formatCurrency(summary.totalValue)}
          </p>
          <p className="mt-1 text-[11px] text-ink-subtle">{usageData.currentStock.length} materials tracked</p>
        </div>
      </div>

      {/* Main Card with Dual Tabs & Filters */}
      <Card>
        <CardHeader
          title={
            <div className="flex flex-wrap items-center gap-3">
              <span>Contractor Inventory Ledger</span>
              <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('available')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    activeTab === 'available'
                      ? 'bg-white text-brand shadow-sm font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Current Available ({usageData.currentStock.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('used')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    activeTab === 'used'
                      ? 'bg-white text-brand shadow-sm font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Material Used ({usageData.materialUsed.length})
                </button>
              </div>
            </div>
          }
          description={
            activeTab === 'available'
              ? 'Stock physically available in your site warehouse ready for daily work consumption.'
              : 'Permanent audit trail of materials deducted during daily work update submissions.'
          }
        />

        {/* Filter Controls */}
        <div className="border-b border-line bg-canvas-subtle/40 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-subtle" />
                <input
                  type="text"
                  placeholder="Search material name or code…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-line bg-white pl-8 pr-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                />
              </div>

              {usageData.filterSites?.length > 0 && (
                <select
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                >
                  <option value="all">All Assigned Sites ({usageData.filterSites.length})</option>
                  {usageData.filterSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.project_name})
                    </option>
                  ))}
                </select>
              )}

              {activeTab === 'used' && (
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span>Date:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                  />
                </div>
              )}

              {(search || selectedSiteId !== 'all' || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setSelectedSiteId('all');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-xs"
                >
                  Clear Filters
                </Button>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate('/contractor/material-movements')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900"
            >
              Transfer Shipments / Movements →
            </button>
          </div>
        </div>

        {/* Content Table */}
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : activeTab === 'available' ? (
          <DataTable
            columns={availableColumns}
            rows={filteredAvailable}
            empty={{
              icon: Warehouse,
              title: 'No materials available in warehouse',
              description: 'Stock received from transfers or procurement receipts will appear here.',
            }}
          />
        ) : (
          <DataTable
            columns={usedColumns}
            rows={filteredUsed}
            empty={{
              icon: Package,
              title: 'No materials consumed yet',
              description: 'When you log material usage in Daily Work Updates, records will appear here.',
            }}
          />
        )}
      </Card>
    </>
  );
}
