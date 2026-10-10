import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Warehouse,
  Users,
  Truck,
  Building2,
  MapPin,
  Clock,
  TrendingUp,
  ChevronRight,
  AlertTriangle,
  Calendar,
  Layers,
  FileCheck,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { materialMovementApi } from '../../api/materialMovementApi';
import { projectsApi } from '../../api/projectsApi';
import { hrApi } from '../../api/hrApi';
import { formatNumber, formatDate } from '../../utils/format';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ContractorDashboardPage() {
  const navigate = useNavigate();
  const [stock, setStock] = useState({ items: [], materialCount: 0, totalQuantity: 0 });
  const [incoming, setIncoming] = useState([]);
  const [workersToday, setWorkersToday] = useState(null);
  const [projectsData, setProjectsData] = useState({ projects: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      materialMovementApi.stock().then(setStock).catch(() => setStock({ items: [], materialCount: 0, totalQuantity: 0 })),
      materialMovementApi.incoming().then(setIncoming).catch(() => setIncoming([])),
      hrApi.attendance?.list?.({ date: todayISO(), status: 'present', pageSize: 200 })
        .then((d) => setWorkersToday((d.attendance ?? d.records ?? d.rows ?? []).length))
        .catch(() => setWorkersToday(null)),
      projectsApi.list({ pageSize: 50 }).then(setProjectsData).catch(() => setProjectsData({ projects: [], total: 0 })),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const projects = projectsData.projects || [];
  const assignedProjectsCount = projects.length;
  const assignedSitesCount = projects.reduce((s, p) => s + Number(p.siteCount || 0), 0);
  const inProgressCount = projects.filter((p) => ['on-track', 'attention', 'delayed'].includes(p.status)).length;
  const overallProgress = assignedProjectsCount > 0
    ? Math.round(projects.reduce((s, p) => s + Number(p.progress || 0), 0) / assignedProjectsCount)
    : 0;

  const upcomingDeadlines = projects
    .filter((p) => p.expectedCompletion && p.status !== 'completed')
    .sort((a, b) => new Date(a.expectedCompletion) - new Date(b.expectedCompletion))
    .slice(0, 4);

  const arrivingCount = incoming.length;

  return (
    <>
      <PageHeader
        title="Contractor Dashboard"
        description="Assigned projects, sites, task progress, and material movements at a glance."
      />

      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      {/* Primary Project & Site KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          tone="text-brand-700 bg-brand-50"
          label="Assigned Projects"
          value={formatNumber(assignedProjectsCount)}
          sub="Tap to view project & task scopes"
          onClick={() => navigate('/contractor/projects')}
          cta
        />
        <StatCard
          icon={MapPin}
          tone="text-sky-700 bg-sky-50"
          label="Assigned Sites"
          value={formatNumber(assignedSitesCount)}
          sub="Across all active projects"
          onClick={() => navigate('/contractor/projects')}
        />
        <StatCard
          icon={TrendingUp}
          tone="text-emerald-700 bg-emerald-50"
          label="Overall Progress"
          value={`${overallProgress}%`}
          sub={`${formatNumber(inProgressCount)} projects in progress`}
          onClick={() => navigate('/contractor/projects')}
        />
        <StatCard
          icon={Clock}
          tone="text-amber-700 bg-amber-50"
          label="Upcoming Deadlines"
          value={formatNumber(upcomingDeadlines.length)}
          sub={upcomingDeadlines[0] ? `Next: ${formatDate(upcomingDeadlines[0].expectedCompletion)}` : 'No upcoming deadlines'}
        />
      </div>

      {/* Operational Stats: Warehouse, Attendance, In-Transit */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Warehouse}
          tone="text-indigo-700 bg-indigo-50"
          label="Site Warehouse Stock"
          value={`${formatNumber(stock.materialCount)} materials`}
          sub={`${formatNumber(stock.totalQuantity)} units on hand`}
          onClick={() => navigate('/contractor/site-warehouse')}
          cta
        />
        <StatCard
          icon={Users}
          tone="text-emerald-700 bg-emerald-50"
          label="Workers On-Site Today"
          value={workersToday == null ? '—' : formatNumber(workersToday)}
          sub={workersToday == null ? 'Attendance not recorded' : 'Marked present today'}
        />
        <StatCard
          icon={Truck}
          tone="text-amber-700 bg-amber-50"
          label="Arriving Shipments"
          value={formatNumber(arrivingCount)}
          sub={arrivingCount ? 'Tap to receive incoming material' : 'No shipments in transit'}
          onClick={() => navigate('/contractor/procurement')}
          cta
        />
      </div>

      {/* Quick Action Bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/contractor/daily-work')}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-800 transition-colors"
        >
          <FileCheck className="h-4 w-4" />
          Log Daily Work Update
        </button>
        <button
          type="button"
          onClick={() => navigate('/contractor/projects')}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas transition-colors"
        >
          <Layers className="h-4 w-4 text-brand-600" />
          View Projects & Tasks
        </button>
        <button
          type="button"
          onClick={() => navigate('/contractor/site-warehouse')}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas transition-colors"
        >
          <Warehouse className="h-4 w-4 text-indigo-600" />
          Site Warehouse Stock
        </button>
      </div>

      {/* Projects & Deadlines Overview */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Assigned Projects Progress */}
        <Card>
          <CardHeader
            title="Assigned Projects"
            description="Task-based execution and progress tracking"
            action={
              <button
                type="button"
                onClick={() => navigate('/contractor/projects')}
                className="text-xs font-semibold text-brand-700 hover:text-brand-900"
              >
                View all →
              </button>
            }
          />
          <CardBody className="pt-0">
            {projects.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">No projects assigned to your account yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {projects.slice(0, 5).map((p) => (
                  <li
                    key={p.id}
                    onClick={() => navigate('/contractor/projects')}
                    className="flex items-center justify-between py-3 cursor-pointer hover:bg-canvas/50 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-ink truncate">{p.name}</p>
                        <span className="text-xs text-ink-subtle">{p.code}</span>
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {p.location} · {p.siteCount || 0} site{p.siteCount === 1 ? '' : 's'}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full bg-brand-600 rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, p.progress || 0))}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-ink tabular-nums">{p.progress || 0}%</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-ink-subtle shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Upcoming Deadlines & Attention Items */}
        <Card>
          <CardHeader
            title="Upcoming Deadlines"
            description="Target completion schedules for assigned projects"
          />
          <CardBody className="pt-0">
            {upcomingDeadlines.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">No upcoming deadlines recorded.</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcomingDeadlines.map((p) => {
                  const daysLeft = Math.ceil(
                    (new Date(p.expectedCompletion) - new Date()) / (1000 * 60 * 60 * 24)
                  );
                  const isOverdue = daysLeft < 0;

                  return (
                    <li key={p.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0 pr-3">
                        <p className="font-medium text-sm text-ink truncate">{p.name}</p>
                        <p className="text-xs text-ink-subtle mt-0.5 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-ink-muted" />
                          Expected: {formatDate(p.expectedCompletion)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {isOverdue ? (
                          <Badge tone="error">
                            Overdue by {Math.abs(daysLeft)}d
                          </Badge>
                        ) : daysLeft <= 14 ? (
                          <Badge tone="warning">
                            {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            {daysLeft} days left
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Arriving Shipments details if any */}
      {arrivingCount > 0 && (
        <Card className="mt-6">
          <CardHeader title="Incoming Shipments Arriving Today" description="Shipments in transit to your site" />
          <CardBody className="pt-0">
            <ul className="divide-y divide-line">
              {incoming.map((mv) => (
                <li key={mv.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {mv.material?.name} · {formatNumber(mv.sentQuantity)} {mv.unit}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      From {mv.source?.contractorName || mv.source?.warehouseName}
                      {mv.vehicleNumber ? ` · Vehicle ${mv.vehicleNumber}` : ''}
                      {mv.procurement?.requestNumber ? ` · ${mv.procurement.requestNumber}` : ''}
                    </p>
                  </div>
                  {mv.procurement?.id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/contractor/procurement/${mv.procurement.id}`)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Receive <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}

function StatCard({ icon: Icon, tone, label, value, sub, onClick, cta }) {
  const clickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`rounded-xl border border-line bg-white p-5 text-left transition-colors shadow-xs ${
        clickable ? 'hover:border-brand-300 hover:bg-canvas/50 cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight text-ink tabular-nums">{value}</p>
          <p className="truncate text-xs font-medium text-ink-subtle">{label}</p>
        </div>
      </div>
      <p className="mt-2.5 text-xs text-ink-subtle">
        {sub}{cta && clickable ? ' →' : ''}
      </p>
    </button>
  );
}
