import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  MapPin,
  HardHat,
  Clock,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  ExternalLink,
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

export default function PmProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    pmApi
      .projects()
      .then((res) => setProjects(res.projects || []))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = projects.filter((p) => {
    const matchesSearch =
      !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <PageHeader
        title="Handled Projects & Sites"
        description="Comprehensive view of all projects and site locations under your management scope."
        actions={
          <Button variant="secondary" onClick={load} isLoading={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message || 'Failed to load projects'}</Alert>}

      {/* Filter toolbar */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search projects, client, code..."
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
            <option value="on-track">On Track</option>
            <option value="delayed">Delayed</option>
            <option value="attention">Attention</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody className="p-12">
            <EmptyState
              icon={Building2}
              title="No projects found"
              description="No projects match your current search or filter criteria."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {filtered.map((p) => {
            let statusTone = 'neutral';
            if (p.status === 'on-track') statusTone = 'success';
            else if (p.status === 'delayed') statusTone = 'danger';
            else if (p.status === 'attention') statusTone = 'warning';

            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="border-b border-line p-5 bg-canvas/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-brand-100 text-brand-800 font-bold">
                        {p.code}
                      </span>
                      <h3 className="text-base font-bold text-ink">{p.name}</h3>
                      <Badge tone={statusTone}>{p.status}</Badge>
                    </div>
                    <div className="text-xs text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
                      {p.client_name && <span>Client: <strong className="text-ink">{p.client_name}</strong></span>}
                      {p.location && <span>Location: <strong className="text-ink">{p.location}</strong></span>}
                      {p.expected_completion && (
                        <span>Deadline: <strong className="text-ink">{formatDate(p.expected_completion)}</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-ink-muted">Overall Progress</p>
                      <p className="text-base font-bold text-brand-700">{p.progress || 0}%</p>
                    </div>
                    <div className="w-24 bg-line rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-brand-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, p.progress || 0))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Sites section inside project */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-sky-600" />
                      Sites under this project ({p.sites?.length || 0})
                    </h4>
                  </div>

                  {(!p.sites || p.sites.length === 0) ? (
                    <p className="text-xs text-ink-subtle italic py-2">No individual sites configured under this project.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {p.sites.map((site) => (
                        <div
                          key={site.id}
                          className="rounded-xl border border-line bg-surface p-3.5 hover:border-brand-500/40 transition space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-ink">{site.name}</span>
                            <Badge tone={site.status === 'active' ? 'success' : 'neutral'}>
                              {site.status}
                            </Badge>
                          </div>

                          <div className="text-xs text-ink-muted space-y-1">
                            <p className="flex items-center justify-between">
                              <span>Contractor:</span>
                              <strong className="text-ink">{site.contractor_name || 'Unassigned'}</strong>
                            </p>
                            <p className="flex items-center justify-between">
                              <span>Progress:</span>
                              <strong className="text-brand-700">{site.progress || 0}%</strong>
                            </p>
                          </div>

                          <div className="pt-2 border-t border-line/60 flex items-center justify-between text-xs">
                            <button
                              onClick={() => navigate(`/pm/daily-work?projectId=${p.id}&siteId=${site.id}`)}
                              className="text-brand-700 hover:underline font-medium text-[11px]"
                            >
                              Work Updates →
                            </button>
                            <button
                              onClick={() => navigate(`/pm/site-warehouse?projectId=${p.id}&siteId=${site.id}`)}
                              className="text-brand-700 hover:underline font-medium text-[11px]"
                            >
                              Site Stock →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
