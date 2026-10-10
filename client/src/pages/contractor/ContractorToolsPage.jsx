import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wrench,
  Search,
  CheckCircle2,
  AlertCircle,
  Truck,
  Plus,
  ArrowRight,
  Filter,
  Layers,
  Calendar,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import ToolUnitsPanel from '../../components/tools/ToolUnitsPanel';
import { toolApi } from '../../api/toolApi';

export default function ContractorToolsPage() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await toolApi.list({
        search: search.trim() || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        pageSize: 100,
      });
      setTools(data.tools ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const uniqueTypes = Array.from(new Set(tools.map((t) => t.type).filter(Boolean)));

  return (
    <>
      <PageHeader
        title="Tools & Machinery"
        description="Explore available tools, machinery and equipment available for allocation to your projects and sites."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/contractor/procurement/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Request Equipment / Tool
              </Button>
            </Link>
            <Link to="/contractor/daily-work?tab=form">
              <Button variant="secondary" className="gap-2">
                <Wrench className="h-4 w-4" />
                Log Tool in Daily Work
              </Button>
            </Link>
          </div>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      {/* Quick stats and filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools by name, code, type..."
              className="w-full rounded-xl border border-line bg-white pl-9 pr-4 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All Tool Types</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-ink-muted">Total: {tools.length} equipment items</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : tools.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={Wrench}
                title="No tools or machines found"
                description="No equipment matches your search filter or none are currently registered in the catalogue."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="border-b border-line bg-canvas-subtle text-xs font-semibold uppercase text-ink-subtle">
                  <tr>
                    <th className="px-5 py-3">Tool / Machine Name</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Description / Specs</th>
                    <th className="px-5 py-3">Serials available</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tools.map((t) => (
                    <tr key={t.id} className="hover:bg-canvas transition-colors">
                      <td className="px-5 py-4 font-medium text-ink">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-ink-muted" />
                          <span className="font-semibold text-ink">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-ink-muted">
                        <span className="inline-block rounded-md bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted border border-line">
                          {t.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-ink-muted max-w-sm truncate" title={t.description}>
                        {t.description || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={Number(t.availableQuantity) > 0 ? 'positive' : 'warning'}>
                          {t.availableQuantity ?? 0} of {t.totalQuantity ?? 0} available
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/contractor/daily-work?tab=form&toolId=${t.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-canvas transition-colors"
                            title="Log usage in today's daily work update"
                          >
                            <Calendar className="h-3 w-3 text-ink-muted" />
                            Log Daily Use
                          </Link>
                          <Link
                            to={`/contractor/procurement/new?toolId=${t.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
                            title="Request tool procurement or dispatch"
                          >
                            <Plus className="h-3 w-3" />
                            Request
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <ToolUnitsPanel tools={tools} mode="contractor" />
    </>
  );
}
