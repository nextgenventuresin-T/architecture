import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  MapPin,
  Calendar,
  Layers,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  FileCheck,
  AlertCircle,
  Eye,
  Users,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { projectsApi } from '../../api/projectsApi';
import { formatDate } from '../../utils/format';
import TaskDetailModal from '../../components/tasks/TaskDetailModal';

const TASK_STATUS_TONES = {
  'on-track': 'success',
  'attention': 'warning',
  'delayed': 'error',
  'completed': 'neutral',
};

const TASK_STATUS_LABELS = {
  'on-track': 'On Track',
  'attention': 'Needs Attention',
  'delayed': 'Delayed',
  'completed': 'Completed',
};

export default function ContractorProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState('all');
  const [viewingTaskId, setViewingTaskId] = useState(null);
  const [initialModalTab, setInitialModalTab] = useState('overview');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.list({ pageSize: 50 });
      const list = data.projects || [];
      setProjects(list);
      if (list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      setError(new Error(msg));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(null);
      return;
    }
    setDetailLoading(true);
    projectsApi
      .detail(selectedProjectId)
      .then((data) => {
        setProjectDetail(data);
      })
      .catch((err) => {
        console.error('Failed to load project detail:', err);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedProjectId]);

  return (
    <>
      <PageHeader
        title="Assigned Projects & Tasks"
        description="View project timelines, assigned sites, and task execution scopes."
        actions={
          <button
            type="button"
            onClick={() => navigate('/contractor/daily-work')}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 transition-colors"
          >
            <FileCheck className="h-4 w-4" />
            Submit Daily Work
          </button>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No projects assigned"
            description="You have not been assigned to any active projects or sites yet. Assignments will appear here once designated by Admin."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Project Selector List */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle px-1">
              Your Assigned Projects ({projects.length})
            </h3>
            <div className="space-y-2">
              {projects.map((p) => {
                const isSelected = p.id === selectedProjectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all shadow-xs ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
                        : 'border-line bg-white hover:border-brand-200 hover:bg-canvas/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
                          {p.code}
                        </span>
                        <h4 className="font-semibold text-ink text-sm truncate mt-0.5">{p.name}</h4>
                      </div>
                      <Badge tone={p.status === 'delayed' ? 'error' : p.status === 'completed' ? 'success' : 'neutral'}>
                        {p.status || 'Active'}
                      </Badge>
                    </div>

                    <p className="mt-2 text-xs text-ink-muted flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-ink-subtle" />
                      {p.location}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full bg-brand-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, p.progress || 0))}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-ink tabular-nums">{p.progress || 0}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Project Phase & Site Details */}
          <div className="lg:col-span-8 space-y-6">
            {detailLoading || !projectDetail ? (
              <div className="space-y-4">
                <Skeleton className="h-40" />
                <Skeleton className="h-64" />
              </div>
            ) : (
              <>
                {/* Project Header Card */}
                <Card>
                  <CardBody className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                            {projectDetail.project.code}
                          </span>
                          <Badge tone={projectDetail.project.status === 'delayed' ? 'error' : 'neutral'}>
                            {projectDetail.project.status || 'Active'}
                          </Badge>
                        </div>
                        <h2 className="mt-2 text-xl font-bold text-ink">{projectDetail.project.name}</h2>
                        <p className="text-xs text-ink-muted mt-1 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-ink-subtle" />
                          {projectDetail.project.location}
                          {projectDetail.project.client?.name && ` · Client: ${projectDetail.project.client.name}`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/contractor/daily-work?projectId=${projectDetail.project.id}`)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-800 shadow-xs transition-colors"
                      >
                        <FileCheck className="h-4 w-4" />
                        Log Work
                      </button>
                    </div>

                    {projectDetail.project.description && (
                      <p className="text-xs text-ink-muted bg-canvas/60 rounded-lg p-3 border border-line">
                        {projectDetail.project.description}
                      </p>
                    )}

                    {/* Timeline & Progress KPIs */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-line pt-4">
                      <div>
                        <p className="text-[11px] font-medium text-ink-subtle">Start Date</p>
                        <p className="mt-0.5 text-xs font-semibold text-ink">
                          {formatDate(projectDetail.project.startDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-ink-subtle">Expected Completion</p>
                        <p className="mt-0.5 text-xs font-semibold text-ink">
                          {formatDate(projectDetail.project.expectedCompletion)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-ink-subtle">Duration</p>
                        <p className="mt-0.5 text-xs font-semibold text-ink">
                          {projectDetail.project.expectedDurationMonths || 0} months
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-ink-subtle">Overall Progress</p>
                        <p className="mt-0.5 text-xs font-semibold text-brand-700">
                          {projectDetail.project.progress || 0}%
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Site-Wise Task Execution Scopes (Manual Tasks) */}
                <Card>
                  <CardHeader
                    title="Assigned Sites & Task Execution Scope"
                    description="Admin-assigned sites and active manual tasks for your team (Foundation, Brick Work, etc.)"
                    action={
                      projectDetail.sites && projectDetail.sites.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-ink-subtle">Filter Site:</span>
                          <select
                            value={selectedSiteId}
                            onChange={(e) => setSelectedSiteId(e.target.value)}
                            className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-ink focus:border-brand-500"
                          >
                            <option value="all">All Sites ({projectDetail.sites.length})</option>
                            {projectDetail.sites.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null
                    }
                  />
                  <CardBody className="pt-0 space-y-4">
                    {/* Site Pills if multiple */}
                    {projectDetail.sites && projectDetail.sites.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {projectDetail.sites.map((site) => {
                          const siteTasks = (projectDetail.tasks || []).filter(
                            (t) => String(t.siteId || '') === String(site.id)
                          );
                          const isSelected = selectedSiteId === String(site.id);
                          return (
                            <div
                              key={site.id}
                              onClick={() => setSelectedSiteId(isSelected ? 'all' : String(site.id))}
                              className={`cursor-pointer rounded-xl border p-3.5 space-y-2 transition-all ${
                                isSelected
                                  ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500'
                                  : 'border-line bg-canvas/30 hover:border-brand-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <h5 className="font-semibold text-xs text-ink">{site.name}</h5>
                                <Badge tone={site.status === 'completed' ? 'success' : 'neutral'}>
                                  {site.status || 'Active'}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-ink-subtle flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {site.address || site.location || 'Project Site'}
                              </p>
                              <div className="flex items-center justify-between pt-1 border-t border-line/60 text-[11px]">
                                <span className="text-ink-muted">{siteTasks.length} tasks defined</span>
                                <span className="font-semibold text-ink">{site.progress || 0}% complete</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Task List under selected site or all */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                          Active Tasks for Your Crew
                        </h4>
                        <span className="text-xs text-ink-muted">
                          {
                            (projectDetail.tasks || []).filter(
                              (t) => selectedSiteId === 'all' || String(t.siteId || '') === String(selectedSiteId)
                            ).length
                          }{' '}
                          Tasks
                        </span>
                      </div>

                      {(() => {
                        const activeTasks = (projectDetail.tasks || []).filter(
                          (t) => selectedSiteId === 'all' || String(t.siteId || '') === String(selectedSiteId)
                        );

                        if (activeTasks.length === 0) {
                          return (
                            <div className="rounded-xl border border-dashed border-line bg-canvas/40 p-6 text-center">
                              <Layers className="mx-auto h-8 w-8 text-ink-subtle mb-2" />
                              <p className="text-xs font-medium text-ink">No tasks defined for this site scope yet.</p>
                              <p className="text-[11px] text-ink-subtle mt-0.5">
                                Tasks will appear here once configured by the Project Admin.
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            {activeTasks.map((task) => (
                              <div
                                key={task.id}
                                className="overflow-hidden rounded-xl border border-line bg-white shadow-xs p-4 space-y-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-bold text-ink text-sm">{task.name}</h4>
                                      {task.siteName && (
                                        <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-muted border border-line">
                                          {task.siteName}
                                        </span>
                                      )}
                                      <Badge tone={TASK_STATUS_TONES[task.status] || 'neutral'}>
                                        {TASK_STATUS_LABELS[task.status] || task.status}
                                      </Badge>
                                      <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">
                                        {task.progress}%
                                      </span>
                                    </div>

                                    {task.description && (
                                      <p className="mt-1 text-xs text-ink-muted line-clamp-2">
                                        {task.description}
                                      </p>
                                    )}

                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-subtle">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(task.startDate)} → {formatDate(task.endDate)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {task.durationDays || 0} days
                                      </span>
                                      {task.dailyUpdatesCount > 0 && (
                                        <span className="text-brand-700 font-medium">
                                          {task.dailyUpdatesCount} updates logged
                                        </span>
                                      )}
                                      {task.uniqueWorkersCount > 0 && (
                                        <span className="text-emerald-700 font-medium">
                                          {task.uniqueWorkersCount} workers logged
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setViewingTaskId(task.id);
                                        setInitialModalTab('overview');
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-canvas transition-colors shadow-xs"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      View Scope
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setViewingTaskId(task.id);
                                        setInitialModalTab('labour');
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 transition-colors shadow-xs"
                                    >
                                      <Users className="h-3.5 w-3.5 text-brand-600" />
                                      Assign Workers
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        navigate(
                                          `/contractor/daily-work?projectId=${projectDetail.project.id}&siteId=${
                                            task.siteId || ''
                                          }&taskId=${task.id}`
                                        )
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 transition-colors shadow-xs"
                                    >
                                      <FileCheck className="h-3.5 w-3.5" />
                                      Log Work
                                    </button>
                                  </div>
                                </div>

                                {/* Progress bar */}
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                                  <div
                                    className="h-full bg-brand-600 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, Math.max(0, task.progress || 0))}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </CardBody>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {viewingTaskId && (
        <TaskDetailModal
          taskId={viewingTaskId}
          onClose={() => setViewingTaskId(null)}
          isAdmin={false}
        />
      )}
    </>
  );
}
