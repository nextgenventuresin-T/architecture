import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ShoppingCart,
  Truck,
  CheckCircle2,
  Clock,
  Package,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  MapPin,
  Building2,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { pmApi } from '../../api/pmApi';
import { formatNumber, formatDate, formatCurrency } from '../../utils/format';

export default function PmProcurementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialContractorId = searchParams.get('contractorId') || '';
  const initialSiteId = searchParams.get('siteId') || '';

  const [data, setData] = useState({ summary: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = {};
    if (initialContractorId) params.contractorId = initialContractorId;
    if (initialSiteId) params.siteId = initialSiteId;
    if (statusFilter !== 'all') params.status = statusFilter;

    pmApi
      .procurement(params)
      .then((res) => setData(res))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [initialContractorId, initialSiteId, statusFilter]);

  useEffect(load, [load]);

  const summary = data.summary || {
    totalAmount: 0,
    deliveredAmount: 0,
    inTransitCount: 0,
    pendingCount: 0,
    totalCount: 0,
  };

  const filteredItems = (data.items || []).filter((it) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      it.request_number?.toLowerCase().includes(q) ||
      it.material_name?.toLowerCase().includes(q) ||
      it.tool_name?.toLowerCase().includes(q) ||
      it.contractor_name?.toLowerCase().includes(q) ||
      it.site_name?.toLowerCase().includes(q) ||
      it.project_name?.toLowerCase().includes(q) ||
      it.vehicle_number?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title="Contractor Material Procurement"
        description="Detailed record of all materials and machinery procured by contractors across your sites, costs, delivery logistics and status."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/pm/procurement/new">
              <Button>New material / machine request</Button>
            </Link>
            <Button variant="secondary" onClick={load} isLoading={loading}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message || 'Failed to load procurement'}</Alert>}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-muted">Total Procured Value</p>
          <p className="text-xl font-bold text-ink mt-1">{formatCurrency(summary.totalAmount || 0)}</p>
          <p className="text-[11px] text-ink-subtle mt-0.5">{summary.totalCount || 0} procurement orders</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-muted">Delivered & Fulfilled</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{formatCurrency(summary.deliveredAmount || 0)}</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">Stock received on site</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-muted">In Transit / Ordered</p>
          <p className="text-xl font-bold text-sky-700 mt-1">{summary.inTransitCount || 0} orders</p>
          <p className="text-[11px] text-sky-600 mt-0.5">En route to project sites</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-muted">Pending Requests</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{summary.pendingCount || 0} orders</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Awaiting fulfillment / review</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search material, contractor, vehicle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-line bg-surface text-ink focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-line bg-surface text-ink focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="ordered">Ordered</option>
            <option value="in_transit">In Transit</option>
            <option value="received">Received</option>
          </select>
          {(initialContractorId || initialSiteId) && (
            <Button size="sm" variant="ghost" onClick={() => setSearchParams({})}>
              Clear Context
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardBody className="p-12">
            <EmptyState
              icon={ShoppingCart}
              title="No procurement orders found"
              description="No procurement orders match your current filters."
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-ink-muted font-bold uppercase tracking-wider">
                  <th className="p-3">Req # / Item</th>
                  <th className="p-3">Site & Project</th>
                  <th className="p-3">Contractor</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Rate / Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Logistics / Vehicle</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((it) => {
                  let statusTone = 'neutral';
                  if (it.status === 'received') statusTone = 'success';
                  else if (it.status === 'in_transit' || it.status === 'ordered') statusTone = 'info';
                  else if (it.status === 'requested') statusTone = 'warning';

                  const unitCost = Number(it.purchase_rate || it.estimated_rate || 0);
                  const totalCost = Number(it.total_amount || (Number(it.quantity || 0) * unitCost));

                  return (
                    <tr key={it.id} className="hover:bg-surface/50 transition">
                      <td className="p-3">
                        <span className="font-mono text-ink-subtle block">{it.request_number}</span>
                        <span className="font-bold text-sm text-ink block">
                          {it.material_name || it.tool_name || 'Item'}
                        </span>
                        {it.material_category && (
                          <span className="text-[11px] text-ink-muted">{it.material_category}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-ink block">{it.site_name || 'General Site'}</span>
                        <span className="text-[11px] text-ink-muted block">{it.project_name}</span>
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-ink">{it.contractor_name || 'Contractor'}</span>
                        {it.vendor_name && (
                          <span className="text-[11px] text-ink-muted block">Vendor: {it.vendor_name}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-bold text-ink">
                          {formatNumber(it.quantity)} {it.unit || 'units'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-ink-muted block text-[11px]">
                          @ {formatCurrency(unitCost)}
                        </span>
                        <span className="font-bold text-sm text-ink block">
                          {formatCurrency(totalCost)}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge tone={statusTone}>{it.status}</Badge>
                      </td>
                      <td className="p-3">
                        {it.vehicle_number ? (
                          <div className="space-y-0.5">
                            <span className="font-mono font-semibold text-ink flex items-center gap-1">
                              <Truck className="h-3 w-3 text-brand-600" /> {it.vehicle_number}
                            </span>
                            {it.challan_number && (
                              <span className="text-[11px] text-ink-muted block">DC: {it.challan_number}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-subtle italic">No vehicle logged</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          to={`/pm/procurement/${it.id}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline font-medium"
                        >
                          Details <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
