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
                  {(() => {
                    const util = task.budgetUtilization || {
                      materials: { budgeted: task.materialBudget || 0, actual: 0, remaining: task.materialBudget || 0, utilization: 0, isExceeded: false },
                      tools: { budgeted: task.toolBudget || 0, actual: 0, remaining: task.toolBudget || 0, utilization: 0, isExceeded: false },
                      labour: { budgeted: task.labourBudget || 0, actual: 0, remaining: task.labourBudget || 0, utilization: 0, isExceeded: false },
                      misc: { budgeted: task.miscBudget || 0, actual: 0, remaining: task.miscBudget || 0, utilization: 0, isExceeded: false },
                      total: {
                        budgeted: task.totalBudget || 0,
                        approvedAdditional: task.approvedAdditionalBudget || 0,
                        effectiveBudget: (task.totalBudget || 0) + (task.approvedAdditionalBudget || 0),
                        pendingExcess: task.pendingExcessBudget || 0,
                        actual: 0,
                        remaining: task.totalBudget || 0,
                        utilization: 0,
                        isExceeded: false,
                        exceededAmount: 0,
                      },
                    };

                    return (
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <p className="text-[11px] text-ink-subtle">Budget vs Actual</p>
                            {util.total.pendingExcess > 0 ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                ⚠️ +{formatCurrency(util.total.pendingExcess)} Pending
                              </span>
                            ) : util.total.isExceeded ? (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                ⚠️ Over Budget
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-baseline justify-end gap-1.5">
                            <span className="text-sm font-semibold text-ink-muted">
                              {formatCurrency(util.total.actual)}
                            </span>
                            <span className="text-xs text-ink-subtle">/</span>
                            <span className="text-base font-bold text-ink tabular-nums">
                              {formatCurrency(util.total.effectiveBudget)}
                            </span>
                          </div>
                          <p className="text-[10px] text-ink-subtle">
                            {util.total.remaining > 0 ? `₹${formatNumber(util.total.remaining)} remaining` : 'Fully utilized'}{' '}
                            · <span className="font-semibold text-brand-700">{util.total.utilization}% used</span>
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
                    );
                  })()}
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

                {/* Task Budget Breakdown: 5 Categories (Materials, Tools, Labour, Misc, Total) */}
                {(() => {
                  const util = task.budgetUtilization || {
                    materials: { budgeted: task.materialBudget || 0, actual: 0, remaining: task.materialBudget || 0, utilization: 0, isExceeded: false },
                    tools: { budgeted: task.toolBudget || 0, actual: 0, remaining: task.toolBudget || 0, utilization: 0, isExceeded: false },
                    labour: { budgeted: task.labourBudget || 0, actual: 0, remaining: task.labourBudget || 0, utilization: 0, isExceeded: false },
                    misc: { budgeted: task.miscBudget || 0, actual: 0, remaining: task.miscBudget || 0, utilization: 0, isExceeded: false },
                    total: {
                      budgeted: task.totalBudget || 0,
                      approvedAdditional: task.approvedAdditionalBudget || 0,
                      effectiveBudget: (task.totalBudget || 0) + (task.approvedAdditionalBudget || 0),
                      pendingExcess: task.pendingExcessBudget || 0,
                      actual: 0,
                      remaining: task.totalBudget || 0,
                      utilization: 0,
                      isExceeded: false,
                      exceededAmount: 0,
                    },
                  };

                  return (
                    <div className="mt-4 border-t border-line/60 pt-3 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {/* 1. Materials */}
                        <div className={`rounded-lg border p-2.5 ${util.materials.isExceeded ? 'border-rose-200 bg-rose-50/40' : 'border-line bg-canvas/40'}`}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-semibold text-xs text-ink">
                              <Package className="h-3.5 w-3.5 text-brand-600 shrink-0" /> Materials
                            </span>
                            <span className={`text-[10px] font-bold rounded px-1.5 py-0.2 ${util.materials.isExceeded ? 'bg-rose-100 text-rose-700' : 'bg-brand-50 text-brand-700'}`}>
                              {util.materials.utilization}%
                            </span>
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px]">
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Budgeted</span>
                              <span className="font-medium text-ink">{formatCurrency(util.materials.budgeted)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Used / Actual</span>
                              <span className="font-semibold text-brand-700">{formatCurrency(util.materials.actual)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Remaining</span>
                              <span className={`font-semibold ${util.materials.remaining <= 0 && util.materials.isExceeded ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {formatCurrency(util.materials.remaining)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Machines / Tools */}
                        <div className={`rounded-lg border p-2.5 ${util.tools.isExceeded ? 'border-rose-200 bg-rose-50/40' : 'border-line bg-canvas/40'}`}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-semibold text-xs text-ink">
                              <Wrench className="h-3.5 w-3.5 text-amber-600 shrink-0" /> Machines / Tools
                            </span>
                            <span className={`text-[10px] font-bold rounded px-1.5 py-0.2 ${util.tools.isExceeded ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                              {util.tools.utilization}%
                            </span>
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px]">
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Budgeted</span>
                              <span className="font-medium text-ink">{formatCurrency(util.tools.budgeted)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Used / Actual</span>
                              <span className="font-semibold text-amber-700">{formatCurrency(util.tools.actual)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Remaining</span>
                              <span className={`font-semibold ${util.tools.remaining <= 0 && util.tools.isExceeded ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {formatCurrency(util.tools.remaining)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 3. Labour */}
                        <div className={`rounded-lg border p-2.5 ${util.labour.isExceeded ? 'border-rose-200 bg-rose-50/40' : 'border-line bg-canvas/40'}`}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-semibold text-xs text-ink">
                              <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Labour
                            </span>
                            <span className={`text-[10px] font-bold rounded px-1.5 py-0.2 ${util.labour.isExceeded ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {util.labour.utilization}%
                            </span>
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px]">
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Budgeted</span>
                              <span className="font-medium text-ink">{formatCurrency(util.labour.budgeted)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Used / Actual</span>
                              <span className="font-semibold text-emerald-700">{formatCurrency(util.labour.actual)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Remaining</span>
                              <span className={`font-semibold ${util.labour.remaining <= 0 && util.labour.isExceeded ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {formatCurrency(util.labour.remaining)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 4. Miscellaneous */}
                        <div className={`rounded-lg border p-2.5 ${util.misc.isExceeded ? 'border-rose-200 bg-rose-50/40' : 'border-line bg-canvas/40'}`}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-semibold text-xs text-ink">
                              <DollarSign className="h-3.5 w-3.5 text-indigo-600 shrink-0" /> Miscellaneous
                            </span>
                            <span className={`text-[10px] font-bold rounded px-1.5 py-0.2 ${util.misc.isExceeded ? 'bg-rose-100 text-rose-700' : 'bg-indigo-50 text-indigo-700'}`}>
                              {util.misc.utilization}%
                            </span>
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px]">
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Budgeted</span>
                              <span className="font-medium text-ink">{formatCurrency(util.misc.budgeted)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Used / Actual</span>
                              <span className="font-semibold text-indigo-700">{formatCurrency(util.misc.actual)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-ink-subtle">Remaining</span>
                              <span className={`font-semibold ${util.misc.remaining <= 0 && util.misc.isExceeded ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {formatCurrency(util.misc.remaining)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 5. Task Total Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2 text-xs border border-line/60">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink">Task Total:</span>
                          <span className="text-ink-muted">Budget: <strong className="text-ink">{formatCurrency(util.total.effectiveBudget)}</strong></span>
                          {util.total.approvedAdditional > 0 && (
                            <span className="text-[10px] text-emerald-700 font-semibold">({formatCurrency(util.total.budgeted)} base + {formatCurrency(util.total.approvedAdditional)} approved addl)</span>
                          )}
                          <span className="text-ink-subtle">|</span>
                          <span className="text-ink-muted">Actual Used: <strong className="text-brand-800">{formatCurrency(util.total.actual)}</strong></span>
                          <span className="text-ink-subtle">|</span>
                          <span className="text-ink-muted">Remaining: <strong className={util.total.remaining > 0 ? "text-emerald-700" : "text-ink-muted"}>{formatCurrency(util.total.remaining)}</strong></span>
                          <span className="text-ink-subtle">|</span>
                          <span className="font-bold text-brand-700">Utilization: {util.total.utilization}%</span>
                        </div>
                        {util.total.pendingExcess > 0 ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                            ⚠️ Over Budget by +{formatCurrency(util.total.pendingExcess)} (Pending Admin Approval)
                          </span>
                        ) : util.total.isExceeded ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                            ⚠️ Over Budget by +{formatCurrency(util.total.exceededAmount)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
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
