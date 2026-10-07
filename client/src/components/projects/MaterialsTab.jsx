import { useState, useEffect, useMemo } from 'react';
import { Package, ArrowDownRight, ArrowUpRight, Scale, Filter, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import TextField from '../ui/TextField';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { projectsApi } from '../../api/projectsApi';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';

/**
 * Project / Site Material Tracking:
 * - Summary KPI: Total Received -> Total Used -> Current Balance
 * - Dual switchable views:
 *   A. Materials Received / Sent (Movement & Allocation)
 *   B. Materials Used (Phase & Subcategory Daily Work Consumption)
 * - Complete filtering by Material, Phase, Contractor, Site, and Date.
 */
export default function MaterialsTab({ detail, projectId: propProjectId, siteId: propSiteId }) {
  const projectId = propProjectId || detail?.project?.id || detail?.id;
  const initialSiteId = propSiteId || '';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    summary: { totalReceived: 0, totalUsed: 0, balance: 0, usedCost: 0 },
    received: [],
    used: [],
  });

  const [viewMode, setViewMode] = useState('used'); // 'used' or 'received'
  const [materialFilter, setMaterialFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [contractorFilter, setContractorFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState(initialSiteId);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchTracking = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const params = {};
      if (siteFilter) params.siteId = siteFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await projectsApi.materialsTracking(projectId, params);
      setData(res || { summary: { totalReceived: 0, totalUsed: 0, balance: 0, usedCost: 0 }, received: [], used: [] });
    } catch (err) {
      console.error('Failed to load materials tracking:', err);
      // Fallback from detail if available
      if (detail?.materials) {
        const received = detail.materials.map((m) => ({
          material_name: m.material_name,
          material_code: m.material_code || '—',
          category: m.category,
          quantity: m.quantity,
          unit: m.unit,
          source_warehouse_name: m.supplier || 'Main Store',
          destination_warehouse_name: 'Site Store',
          contractor_name: m.contractor_name || '—',
          site_name: m.site_name || '',
          transaction_date: m.received_date,
          reference: m.reference || 'PO Delivery',
        }));
        const totalReceived = received.reduce((s, r) => s + Number(r.quantity || 0), 0);
        const totalUsed = detail.materials.reduce((s, r) => s + Number(r.used_quantity || 0), 0);
        setData({
          summary: {
            totalReceived,
            totalUsed,
            balance: totalReceived - totalUsed,
            usedCost: detail.materials.reduce((s, r) => s + Number(r.total_cost || 0), 0),
          },
          received,
          used: [],
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, [projectId, siteFilter, dateFrom, dateTo]);

  // Unique filter lists
  const availablePhases = useMemo(() => {
    const set = new Set();
    data.used.forEach((u) => {
      if (u.phase_name) set.add(u.phase_name);
    });
    return Array.from(set).sort();
  }, [data.used]);

  const availableContractors = useMemo(() => {
    const set = new Set();
    data.received.forEach((r) => { if (r.contractor_name) set.add(r.contractor_name); });
    data.used.forEach((u) => { if (u.contractor_name) set.add(u.contractor_name); });
    return Array.from(set).sort();
  }, [data.received, data.used]);

  const availableMaterials = useMemo(() => {
    const set = new Set();
    data.received.forEach((r) => { if (r.material_name) set.add(r.material_name); });
    data.used.forEach((u) => { if (u.material_name) set.add(u.material_name); });
    return Array.from(set).sort();
  }, [data.received, data.used]);

  // Filtered rows
  const filteredReceived = useMemo(() => {
    return data.received.filter((row) => {
      if (materialFilter && !row.material_name?.toLowerCase().includes(materialFilter.toLowerCase())) return false;
      if (contractorFilter && row.contractor_name !== contractorFilter) return false;
      return true;
    });
  }, [data.received, materialFilter, contractorFilter]);

  const filteredUsed = useMemo(() => {
    return data.used.filter((row) => {
      if (materialFilter && !row.material_name?.toLowerCase().includes(materialFilter.toLowerCase())) return false;
      if (phaseFilter && row.phase_name !== phaseFilter) return false;
      if (contractorFilter && row.contractor_name !== contractorFilter) return false;
      return true;
    });
  }, [data.used, materialFilter, phaseFilter, contractorFilter]);

  const receivedColumns = [
    {
      key: 'material',
      header: 'Material / Tool',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.material_name}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {row.material_code && `${row.material_code} · `}
            {row.category}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity Sent / Received',
      align: 'right',
      render: (row) => (
        <span className="font-semibold tabular-nums text-ink">
          {formatNumber(row.quantity)} <span className="text-xs font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (row) => <span className="text-ink-muted">{row.source_warehouse_name || 'Central Store'}</span>,
    },
    {
      key: 'destination',
      header: 'Destination / Contractor',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.destination_warehouse_name || row.contractor_name || 'Site Warehouse'}</p>
          {row.site_name && <p className="text-xs text-ink-subtle">Site: {row.site_name}</p>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Received Date',
      render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.transaction_date)}</span>,
    },
    {
      key: 'reference',
      header: 'Ref / Transaction',
      render: (row) => (
        <span className="font-mono text-xs text-ink-subtle">
          {row.transaction_number || row.reference || '—'}
        </span>
      ),
    },
  ];

  const usedColumns = [
    {
      key: 'material',
      header: 'Material Consumed',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.material_name}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {row.material_code && `${row.material_code} · `}
            {row.category || 'Site Consumable'}
          </p>
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
      key: 'contractor',
      header: 'Contractor',
      render: (row) => <span className="font-medium text-ink">{row.contractor_name || 'Direct / General'}</span>,
    },
    {
      key: 'phase_site',
      header: 'Task / Work Item',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">
            {row.task_name ? `Task: ${row.task_name}` : (row.phase_name || 'General Construction')}
          </p>
          <p className="text-xs text-ink-subtle">
            {row.subcategory_name ? row.subcategory_name : 'Daily Work'}
            {row.site_name ? ` · ${row.site_name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Current Stock Balance',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">
          {formatNumber(row.remaining_quantity)} {row.unit}
        </span>
      ),
    },
    {
      key: 'verification',
      header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.verified_by_engineer ? (
            <Badge tone="positive">
              <CheckCircle2 className="mr-1 h-3 w-3 inline" />
              Verified
            </Badge>
          ) : (
            <Badge tone="neutral">Logged via Work Update</Badge>
          )}
        </div>
      ),
    },
  ];

  const resetFilters = () => {
    setMaterialFilter('');
    setPhaseFilter('');
    setContractorFilter('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-6">
      {/* KPI Headline: Received -> Used -> Balance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Total Received</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ArrowDownRight className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-ink">
              {loading ? '…' : formatNumber(data.summary?.totalReceived || 0)}
            </span>
            <span className="text-xs text-ink-subtle">units across all items</span>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">Total stock delivered to project / site</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Total Used / Consumed</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <ArrowUpRight className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-amber-700">
              {loading ? '…' : formatNumber(data.summary?.totalUsed || 0)}
            </span>
            <span className="text-xs text-ink-subtle">units consumed</span>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            Value: {formatCurrency(data.summary?.usedCost || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Current Stock Balance</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Scale className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-emerald-700">
              {loading ? '…' : formatNumber(data.summary?.balance || 0)}
            </span>
            <span className="text-xs text-ink-subtle">units available</span>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">Received − Consumed = Available Balance</p>
        </div>

        <div className="rounded-2xl border border-line bg-canvas-subtle/50 p-5 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Single Ledger Rule</span>
              <Badge tone="positive">Verified</Badge>
            </div>
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">
              Material Sent ≠ Material Used ≠ Current Balance. Consumption is tracked through warehouse ledgers & daily work updates.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={fetchTracking} className="mt-2 w-full">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh Ledger Data
          </Button>
        </div>
      </div>

      {/* Main Table Card with Dual Switcher & Filters */}
      <Card>
        <CardHeader
          title={
            <div className="flex flex-wrap items-center gap-3">
              <span>Material Consumption & Movement Ledger</span>
              <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('used')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    viewMode === 'used'
                      ? 'bg-white text-brand shadow-sm font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Materials Used ({data.used.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('received')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    viewMode === 'received'
                      ? 'bg-white text-brand shadow-sm font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Materials Received / Sent ({data.received.length})
                </button>
              </div>
            </div>
          }
          description={
            viewMode === 'used'
              ? 'Itemized daily consumption by phase, contractor, and site, deducted from contractor warehouse inventory.'
              : 'Audit log of materials dispatched and received at site warehouses.'
          }
        />

        {/* Filter Controls */}
        <div className="border-b border-line bg-canvas-subtle/40 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-56">
              <TextField
                placeholder="Filter by material name…"
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                size="sm"
              />
            </div>

            {viewMode === 'used' && availablePhases.length > 0 && (
              <div className="w-48">
                <Select
                  value={phaseFilter}
                  onChange={(e) => setPhaseFilter(e.target.value)}
                  size="sm"
                >
                  <option value="">All Phases</option>
                  {availablePhases.map((phase) => (
                    <option key={phase} value={phase}>{phase}</option>
                  ))}
                </Select>
              </div>
            )}

            {availableContractors.length > 0 && (
              <div className="w-48">
                <Select
                  value={contractorFilter}
                  onChange={(e) => setContractorFilter(e.target.value)}
                  size="sm"
                >
                  <option value="">All Contractors</option>
                  {availableContractors.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
            )}

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

            {(materialFilter || phaseFilter || contractorFilter || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Table content */}
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : viewMode === 'used' ? (
          <DataTable
            columns={usedColumns}
            rows={filteredUsed}
            empty={{
              icon: Package,
              title: 'No material usage recorded yet',
              description: 'When contractors submit daily work updates with material usage, consumption records appear here.',
            }}
          />
        ) : (
          <DataTable
            columns={receivedColumns}
            rows={filteredReceived}
            empty={{
              icon: Package,
              title: 'No material shipments recorded',
              description: 'Stock received or dispatched to this project’s sites will appear here.',
            }}
          />
        )}
      </Card>
    </div>
  );
}
