import { useState, useMemo } from 'react';
import {
  Layers,
  Plus,
  Package,
  Wrench,
  Users,
  DollarSign,
  Calendar,
  Clock,
  Eye,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Alert from '../ui/Alert';
import TaskFormModal from '../tasks/TaskFormModal';
import TaskDetailModal from '../tasks/TaskDetailModal';
import { tasksApi } from '../../api/tasksApi';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';

const STATUS_TONES = {
  'on-track': 'success',
  'attention': 'warning',
  'delayed': 'error',
  'completed': 'neutral',
};

const STATUS_LABELS = {
  'on-track': 'On Track',
  'attention': 'Needs Attention',
  'delayed': 'Delayed',
  'completed': 'Completed',
};

export default function TasksBudgetTab({ detail, projectId, preselectedSiteId = null, onReload }) {
  const { tasks = [], sites = [], project } = detail || {};

  const [search, setSearch] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState(preselectedSiteId || 'all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewingTaskId, setViewingTaskId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedSiteFilter !== 'all' && String(t.siteId || '') !== String(selectedSiteFilter)) {
        return false;
      }
      if (selectedStatusFilter !== 'all' && t.status !== selectedStatusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (t.name || '').toLowerCase().includes(q);
        const matchDesc = (t.description || '').toLowerCase().includes(q);
        const matchSite = (t.siteName || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchSite) return false;
      }
      return true;
    });
  }, [tasks, selectedSiteFilter, selectedStatusFilter, search]);

  // Rollups across all tasks for this project
  const totalMaterialBudget = tasks.reduce((sum, t) => sum + Number(t.materialBudget || 0), 0);
  const totalToolBudget = tasks.reduce((sum, t) => sum + Number(t.toolBudget || 0), 0);
  const totalLabourBudget = tasks.reduce((sum, t) => sum + Number(t.labourBudget || 0), 0);
  const totalMiscBudget = tasks.reduce((sum, t) => sum + Number(t.miscBudget || 0), 0);
  const totalCalculatedBudget = tasks.reduce((sum, t) => sum + Number(t.totalBudget || 0), 0);
  const completedTasksCount = tasks.filter((t) => t.status === 'completed' || Number(t.progress || 0) === 100).length;

  const handleDelete = async (taskId, taskName) => {
    if (!window.confirm(`Are you sure you want to delete task "${taskName}"? This will remove all associated budget items.`)) {
      return;
    }
    setDeletingId(taskId);
    setActionError(null);
    try {
      await tasksApi.remove(taskId);
      if (onReload) onReload();
    } catch (err) {
      setActionError(err.response?.data?.error?.message || err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {actionError && <Alert tone="error">{actionError}</Alert>}

      {/* Project Rollup Summary */}
      <Card>
        <CardHeader
          title="Manual Task-Based Planning & Budgeting"
          description={`Comprehensive task scopes and budgets for ${project?.name || 'Project'} (${project?.code || ''})`}
          action={
            <Button
              onClick={() => {
                setEditingTask(null);
                setIsCreateOpen(true);
              }}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Add Task
            </Button>
          }
        />
        <CardBody className="pt-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Total Estimated Budget</p>
              <p className="mt-1 text-2xl font-bold text-ink">{formatCurrency(totalCalculatedBudget)}</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-ink-muted">
                <span>Mat: {formatCurrency(totalMaterialBudget)}</span>
                <span>·</span>
                <span>Lab: {formatCurrency(totalLabourBudget)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Total Tasks Configured</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {tasks.length} <span className="text-sm font-normal text-ink-muted">tasks</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {tasks.reduce((sum, t) => sum + Number(t.durationDays || 0), 0)} total planned days
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Tasks Completed</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {completedTasksCount} <span className="text-sm font-normal text-ink-muted">/ {tasks.length}</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {tasks.filter((t) => t.status === 'on-track').length} currently on track
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Average Progress</p>
              <p className="mt-1 text-2xl font-bold text-brand-700">
                {tasks.length > 0
                  ? Math.round(tasks.reduce((s, t) => s + Number(t.progress || 0), 0) / tasks.length)
                  : project?.progress || 0}
                %
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-brand-600 transition-all duration-300 rounded-full"
                  style={{
                    width: `${
                      tasks.length > 0
                        ? Math.min(
                            100,
                            Math.round(tasks.reduce((s, t) => s + Number(t.progress || 0), 0) / tasks.length)
                          )
                        : project?.progress || 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Site Filter */}
          {sites.length > 0 && !preselectedSiteId && (
            <select
              value={selectedSiteFilter}
              onChange={(e) => setSelectedSiteFilter(e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
            >
              <option value="all">All Sites ({sites.length})</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="on-track">On Track</option>
            <option value="attention">Needs Attention</option>
            <option value="delayed">Delayed</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-subtle" />
          <input
            type="text"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line bg-white pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Task List Cards */}
      {filteredTasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title={tasks.length === 0 ? 'No tasks created yet' : 'No matching tasks'}
            description={
              tasks.length === 0
                ? 'Tasks replace rigid phases. Click "Add Task" above to define custom tasks (e.g. Excavation, Foundation Work, Brick Work) with detailed budgets.'
                : 'Try adjusting your site, status or search filters.'
            }
            action={
              tasks.length === 0 && (
                <Button
                  onClick={() => {
                    setEditingTask(null);
                    setIsCreateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Create First Task
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="overflow-hidden rounded-xl border border-line bg-white shadow-xs transition-shadow hover:shadow-sm"
            >
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left: Task Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-ink text-base">{task.name}</h4>
                      {task.siteName && (
                        <span className="rounded-md bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted border border-line">
                          {task.siteName}
                        </span>
                      )}
                      <Badge tone={STATUS_TONES[task.status] || 'neutral'}>
                        {STATUS_LABELS[task.status] || task.status}
                      </Badge>
                      <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                        {task.progress}% Done
                      </span>
                    </div>

                    {task.description && (
                      <p className="mt-1.5 text-xs text-ink-muted line-clamp-2 max-w-3xl">
                        {task.description}
                      </p>
                    )}

                    {/* Timeline & Duration */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-ink-subtle">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(task.startDate)} → {formatDate(task.endDate)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {task.durationDays || 0} working days
                      </span>
                      {task.uniqueWorkersCount > 0 && (
                        <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                          <Users className="h-3.5 w-3.5" />
                          {task.uniqueWorkersCount} workers logged
                        </span>
                      )}
                      {task.dailyUpdatesCount > 0 && (
                        <span className="flex items-center gap-1.5 text-brand-700 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {task.dailyUpdatesCount} updates logged
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Total Budget & Actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-[11px] text-ink-subtle">Total Task Budget</p>
                      <p className="text-lg font-bold text-ink tabular-nums">
                        {formatCurrency(task.totalBudget || 0)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setViewingTaskId(task.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Detail
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTask(task);
                          setIsCreateOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(task.id, task.name)}
                        disabled={deletingId === task.id}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        task.status === 'delayed'
                          ? 'bg-rose-500'
                          : task.status === 'attention'
                          ? 'bg-amber-500'
                          : 'bg-brand-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, task.progress || 0))}%` }}
                    />
                  </div>
                </div>

                {/* Task Budget Breakdown Badges */}
                <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4 border-t border-line/60 pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                    <div>
                      <span className="text-[11px] text-ink-subtle">Materials:</span>{' '}
                      <span className="font-semibold text-ink">{formatCurrency(task.materialBudget || 0)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <div>
                      <span className="text-[11px] text-ink-subtle">Tools/Machines:</span>{' '}
                      <span className="font-semibold text-ink">{formatCurrency(task.toolBudget || 0)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="text-[11px] text-ink-subtle">Labour:</span>{' '}
                      <span className="font-semibold text-ink">{formatCurrency(task.labourBudget || 0)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <div>
                      <span className="text-[11px] text-ink-subtle">Miscellaneous:</span>{' '}
                      <span className="font-semibold text-ink">{formatCurrency(task.miscBudget || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Create / Edit Modal */}
      {isCreateOpen && (
        <TaskFormModal
          projectId={projectId || project?.id}
          siteId={preselectedSiteId || (selectedSiteFilter !== 'all' ? selectedSiteFilter : null)}
          sites={sites}
          taskToEdit={editingTask}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingTask(null);
          }}
          onSaved={() => {
            setIsCreateOpen(false);
            setEditingTask(null);
            if (onReload) onReload();
          }}
        />
      )}

      {/* Task Detail Modal */}
      {viewingTaskId && (
        <TaskDetailModal
          taskId={viewingTaskId}
          onClose={() => setViewingTaskId(null)}
          onUpdated={() => {
            if (onReload) onReload();
          }}
          isAdmin={true}
        />
      )}
    </div>
  );
}
