import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  MapPin,
  HardHat,
  Clock,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  Warehouse,
  Users,
  ChevronRight,
  ArrowRight,
  Calendar,
  Layers,
  FileText,
  Package,
  RefreshCw,
  CheckCircle2,
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

export default function PmDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    pmApi
      .dashboard()
      .then((res) => setData(res))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const metrics = data?.metrics || {
    projectsCount: 0,
    sitesCount: 0,
    contractorsCount: 0,
    todayWorkersCount: 0,
    totalProcuredAmount: 0,
    pendingRequirementsCount: 0,
  };

  const upcomingDeadlines = data?.upcomingDeadlines || [];
  const siteRequirements = data?.siteRequirements || [];
  const contractorsSummary = data?.contractorsSummary || [];
  const recentWorkUpdates = data?.recentWorkUpdates || [];

  return (
    <>
      <PageHeader
        title="Project Manager Workspace"
        description="Monitor handled projects, active contractors, site progress, procurement, and upcoming site deadlines."
        actions={
          <Button variant="secondary" onClick={load} isLoading={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message || 'Failed to load PM dashboard'}</Alert>}

      {/* Primary KPI Row - Identical polish to Contractor Dashboard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Building2}
          tone="text-brand-700 bg-brand-50"
          label="Handled Projects"
          value={formatNumber(metrics.projectsCount)}
          sub="Tap to view project scopes"
          onClick={() => navigate('/pm/projects')}
          cta
        />
        <StatCard
          icon={MapPin}
          tone="text-sky-700 bg-sky-50"
          label="Active Sites"
          value={formatNumber(metrics.sitesCount)}
          sub="Across assigned projects"
          onClick={() => navigate('/pm/projects')}
        />
        <StatCard
          icon={HardHat}
          tone="text-amber-700 bg-amber-50"
          label="Contractors Managed"
          value={formatNumber(metrics.contractorsCount)}
          sub="Engaged on your sites"
          onClick={() => navigate('/pm/contractors')}
          cta
        />
        <StatCard
          icon={Clock}
          tone="text-red-700 bg-red-50"
          label="Upcoming Deadlines"
          value={formatNumber(upcomingDeadlines.length)}
          sub={upcomingDeadlines[0] ? `Next: ${upcomingDeadlines[0].daysRemaining}d remaining` : 'No upcoming deadlines'}
        />
        <StatCard
          icon={ShoppingCart}
          tone="text-emerald-700 bg-emerald-50"
          label="Contractor Procurement"
          value={formatCurrency(metrics.totalProcuredAmount)}
          sub="Total procured volume"
          onClick={() => navigate('/pm/procurement')}
          cta
        />
        <StatCard
          icon={Users}
          tone="text-indigo-700 bg-indigo-50"
          label="Labour on Site Today"
          value={`${formatNumber(metrics.todayWorkersCount)} workers`}
          sub="Active attendance count"
        />
      </div>

      {/* Main Grid: Urgent Deadlines & Site Requirements */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Col (7): Upcoming Site Deadlines tracker */}
        <div className="lg:col-span-7 space-y-6">
          <Card>
            <CardHeader
              title="⏳ Upcoming Site & Project Deadlines"
              description="Keep track of target dates and identify delayed or approaching milestones."
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/pm/projects')}>
                  View all <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              }
            />
            <CardBody className="p-0">
              {upcomingDeadlines.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={CheckCircle2}
                    title="All deadlines on track"
                    description="No urgent or overdue site deadlines recorded."
                  />
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {upcomingDeadlines.map((item) => {
                    const isOverdue = item.daysRemaining < 0;
                    const isCritical = item.daysRemaining >= 0 && item.daysRemaining <= 3;
                    const isUrgent = item.daysRemaining > 3 && item.daysRemaining <= 10;

                    let badgeTone = 'neutral';
                    let badgeLabel = `${item.daysRemaining} days left`;
                    if (isOverdue) {
                      badgeTone = 'danger';
                      badgeLabel = `⚠️ ${Math.abs(item.daysRemaining)}d OVERDUE`;
                    } else if (isCritical) {
                      badgeTone = 'danger';
                      badgeLabel = `🚨 Due in ${item.daysRemaining} days`;
                    } else if (isUrgent) {
                      badgeTone = 'warning';
                      badgeLabel = `⏱️ Due in ${item.daysRemaining} days`;
                    } else {
                      badgeTone = 'success';
                    }

                    return (
                      <div
                        key={`${item.type}_${item.id}`}
                        className={`p-4 transition hover:bg-surface/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isOverdue ? 'bg-red-50/30' : isCritical ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-canvas border border-line uppercase text-ink-muted">
                              {item.type}
                            </span>
                            <span className="text-sm font-bold text-ink">
                              {item.name}
                            </span>
                            {item.projectCode && (
                              <span className="text-xs text-brand-700 font-medium">
                                ({item.projectCode})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span>Project: <strong className="text-ink">{item.projectName}</strong></span>
                            <span>Contractor: <strong className="text-ink">{item.contractorName}</strong></span>
                            <span>Phase: <strong className="text-ink">{item.currentPhase}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
                          <Badge tone={badgeTone}>{badgeLabel}</Badge>
                          <span className="text-xs text-ink-subtle">
                            Target: {formatDate(item.deadline)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Contractors Overview Card */}
          <Card>
            <CardHeader
              title="👷 Contractors Active on Your Sites"
              description="Overview of teams and deployed contractors handling your project sites."
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/pm/contractors')}>
                  Manage <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              }
            />
            <CardBody className="p-0">
              {contractorsSummary.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={HardHat}
                    title="No contractors assigned yet"
                    description="Assign contractors to project sites to monitor their teams."
                  />
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {contractorsSummary.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 transition hover:bg-surface/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-ink">{c.name}</span>
                          {c.phone && <span className="text-xs text-ink-subtle font-mono">{c.phone}</span>}
                        </div>
                        <p className="text-xs text-ink-muted">
                          Deployed on {c.siteCount} {c.siteCount === 1 ? 'site' : 'sites'}:{' '}
                          {c.sites.map((s) => `${s.name} (${s.projectName})`).join(', ')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/pm/contractors`)}
                        className="self-start sm:self-auto"
                      >
                        Details
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right Col (5): Site Requirements & Recent Work Updates */}
        <div className="lg:col-span-5 space-y-6">
          {/* Site Requirements & Pending Procurement */}
          <Card>
            <CardHeader
              title="📦 Site Requirements & Pending Needs"
              description="Material requests raised by contractors waiting for delivery or approval."
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/pm/procurement')}>
                  View all <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              }
            />
            <CardBody className="p-0">
              {siteRequirements.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Package}
                    title="No pending requirements"
                    description="Sites have all required materials allocated."
                  />
                </div>
              ) : (
                <div className="divide-y divide-line max-h-96 overflow-y-auto">
                  {siteRequirements.map((r) => (
                    <div key={r.id} className="p-3.5 hover:bg-surface/40 transition">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-xs text-ink">
                          {r.material_name || 'Material'}
                        </span>
                        <Badge tone={r.status === 'requested' ? 'warning' : 'neutral'}>
                          {r.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-ink-muted space-y-0.5">
                        <p>
                          Quantity: <strong className="text-ink">{r.quantity} {r.unit}</strong>
                          {r.total_amount && ` · ₹${formatNumber(r.total_amount)}`}
                        </p>
                        <p className="truncate">
                          Site: {r.site_name || 'General'} · By: {r.requested_by_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Recent Site Work Updates */}
          <Card>
            <CardHeader
              title="📸 Recent Site Work Updates"
              description="Latest progress submissions and photo updates from contractors."
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/pm/daily-work')}>
                  Feed <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              }
            />
            <CardBody className="p-0">
              {recentWorkUpdates.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Calendar}
                    title="No work updates yet"
                    description="Daily work updates logged by contractors will show here."
                  />
                </div>
              ) : (
                <div className="divide-y divide-line max-h-96 overflow-y-auto">
                  {recentWorkUpdates.map((dw) => (
                    <div key={dw.id} className="p-3.5 hover:bg-surface/40 transition">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-xs text-ink">
                          {dw.site_name || dw.project_name}
                        </span>
                        <span className="text-[11px] text-ink-subtle">
                          {formatDate(dw.work_date)}
                        </span>
                      </div>
                      <p className="text-xs text-ink line-clamp-2 mb-1.5">
                        {dw.work_done || 'Work performed on site.'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                        <span>Contractor: <strong>{dw.contractor_name || 'Team'}</strong></span>
                        <span>Progress: <strong>{dw.progress_percentage}%</strong></span>
                        {dw.photo_count > 0 && <span>📷 {dw.photo_count} photos</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, tone, label, value, sub, onClick, cta }) {
  const content = (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-line bg-surface p-4 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-brand-500/40 hover:shadow-sm' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        {cta && <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
      </div>
      <p className="mt-3 text-xs font-medium text-ink-muted">{label}</p>
      <p className="text-xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-ink-subtle truncate">{sub}</p>}
    </div>
  );
  return content;
}
