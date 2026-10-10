import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Warehouse,
  Package,
  Layers,
  MapPin,
  Building2,
  Search,
  Filter,
  RefreshCw,
  TrendingDown,
  ArrowDownToLine,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { pmApi } from '../../api/pmApi';
import { projectsApi } from '../../api/projectsApi';
import { formatNumber } from '../../utils/format';

export default function PmSiteWarehousePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  const initialSiteId = searchParams.get('siteId') || '';

  const [data, setData] = useState({ stock: [], summary: {} });
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    projectsApi.list({ pageSize: 100 }).then((res) => setProjects(res.projects || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = {};
    if (selectedProjectId) params.projectId = selectedProjectId;
    if (selectedSiteId) params.siteId = selectedSiteId;

    pmApi
      .siteWarehouse(params)
      .then((res) => setData(res))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [selectedProjectId, selectedSiteId]);

  useEffect(load, [load]);

  const stockItems = data.stock || [];
  const filtered = stockItems.filter((it) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      it.materialName?.toLowerCase().includes(q) ||
      it.materialCategory?.toLowerCase().includes(q) ||
      it.siteName?.toLowerCase().includes(q) ||
      it.projectName?.toLowerCase().includes(q) ||
      it.contractorName?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title="Site Warehouse & Material Inventory"
        description="Warehouse-grade view of materials received, consumed on site, and current available stock across your sites."
        actions={
          <Button variant="secondary" onClick={load} isLoading={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message || 'Failed to load site warehouse'}</Alert>}

      {/* Filter and Search Bar */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface p-4 rounded-2xl border border-line">
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1">Project</label>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedSiteId('');
            }}
            className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-canvas text-ink focus:outline-none focus:border-brand-500"
          >
            <option value="">All Handled Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1">Search Material / Site</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
            <input
              type="text"
              placeholder="e.g. Cement, Sand, Site A..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-line bg-canvas text-ink focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div className="flex items-end gap-2">
          {(selectedProjectId || selectedSiteId || search) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectedProjectId('');
                setSelectedSiteId('');
                setSearch('');
                setSearchParams({});
              }}
            >
              Reset Filters
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody className="p-12">
            <EmptyState
              icon={Warehouse}
              title="No site warehouse stock found"
              description="No material deliveries have been recorded yet for the selected project sites."
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-ink-muted font-bold uppercase tracking-wider">
                  <th className="p-3">Site Location</th>
                  <th className="p-3">Material & Category</th>
                  <th className="p-3">Managing Contractor</th>
                  <th className="p-3 text-right">Total Received</th>
                  <th className="p-3 text-right">Consumed / Used</th>
                  <th className="p-3 text-right">Available on Site</th>
                  <th className="p-3 text-center">Stock Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((it, idx) => {
                  const isLow = it.availableStock <= 0;
                  const isHealthy = it.availableStock > 0;

                  return (
                    <tr key={`${it.siteId}_${it.materialId}_${idx}`} className="hover:bg-surface/50 transition">
                      <td className="p-3">
                        <span className="font-bold text-sm text-ink block">{it.siteName}</span>
                        <span className="text-[11px] text-ink-muted block">{it.projectName}</span>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-sm text-ink block">{it.materialName}</span>
                        <span className="text-[11px] text-ink-muted block">
                          {it.materialCategory} ({it.unit})
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-ink">{it.contractorName}</span>
                      </td>
                      <td className="p-3 text-right font-medium text-ink">
                        {formatNumber(it.receivedQuantity)} {it.unit}
                      </td>
                      <td className="p-3 text-right font-medium text-amber-700">
                        {formatNumber(it.consumedQuantity)} {it.unit}
                      </td>
                      <td className="p-3 text-right font-bold text-sm text-emerald-700">
                        {formatNumber(it.availableStock)} {it.unit}
                      </td>
                      <td className="p-3 text-center">
                        <Badge tone={isHealthy ? 'success' : 'danger'}>
                          {isHealthy ? 'In Stock' : 'Depleted'}
                        </Badge>
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
