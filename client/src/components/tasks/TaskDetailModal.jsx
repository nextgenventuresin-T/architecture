import { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
  Wrench,
  Users,
  DollarSign,
  FileCheck,
  Plus,
  Trash2,
  Building2,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Card, CardHeader, CardBody } from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import Skeleton from '../ui/Skeleton';
import Alert from '../ui/Alert';
import { tasksApi } from '../../api/tasksApi';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import AssignWorkerModal from './AssignWorkerModal';
import QuickAddWorkerModal from './QuickAddWorkerModal';
import TaskFormModal from './TaskFormModal';
import SubtasksPanel, { SubtaskSummaryTable } from './SubtasksPanel';

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

export default function TaskDetailModal({ taskId, onClose: closeModal, onUpdated: notifyParent, isAdmin = false, initialTab = 'overview' }) {
  // The parent page reloads behind a skeleton, which would unmount this modal mid-work
  // (e.g. while adding several subtasks). Refresh our own view now; tell the parent once, on close.
  const changedRef = useRef(false);
  const onUpdated = notifyParent ? () => { changedRef.current = true; } : null;
  const onClose = () => {
    closeModal();
    if (changedRef.current && notifyParent) notifyParent();
  };
  const [taskData, setTaskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  // Worker log modal / inline form state
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [workerForm, setWorkerForm] = useState({
    workerName: '',
    workerCode: '',
    labourType: 'General Labour',
    workDate: new Date().toISOString().slice(0, 10),
    hoursWorked: 8,
    dailyWage: 600,
    workPerformed: '',
  });
  const [loggingWorker, setLoggingWorker] = useState(false);
  const [workerSuccess, setWorkerSuccess] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [workerSubtaskId, setWorkerSubtaskId] = useState('');

  // Subtask planning (Admin) and progress (Admin / assigned contractor)
  const [subtaskForm, setSubtaskForm] = useState({ open: false, initial: null });
  const [deletingSubtaskId, setDeletingSubtaskId] = useState(null);

  const handleDeleteSubtask = async (st) => {
    if (!window.confirm(`Delete subtask "${st.name}"? Its planned budget is removed from the main task.`)) return;
    setDeletingSubtaskId(st.id);
    setError(null);
    try {
      await tasksApi.removeSubtask(taskId, st.id);
      await fetchDetail();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setDeletingSubtaskId(null);
    }
  };

  const handleSubtaskProgress = async (st, value) => {
    setError(null);
    try {
      await tasksApi.updateSubtask(taskId, st.id, {
        progress: value,
        ...(value >= 100 ? { status: 'completed' } : st.status === 'completed' ? { status: 'on-track' } : {}),
      });
      await fetchDetail();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    }
  };

  const fetchDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await tasksApi.detail(taskId);
      setTaskData(data);
    } catch (err) {
      console.error('Failed to load task details:', err);
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [taskId]);

  const handleUnassignWorker = async (assignmentId, workerName) => {
    if (!window.confirm(`Are you sure you want to unassign ${workerName} from this task?`)) return;
    try {
      await tasksApi.unassignWorker(taskId, assignmentId);
      fetchDetail();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to unassign worker:', err);
      alert('Failed to unassign worker: ' + (err.response?.data?.error?.message || err.message));
    }
  };

  const handleAddWorker = async (e) => {
    e.preventDefault();
    if (!workerForm.workerName.trim()) return;
    setLoggingWorker(true);
    setWorkerSuccess(null);
    try {
      await tasksApi.logWorker(taskId, {
        worker_name: workerForm.workerName.trim(),
        worker_code: workerForm.workerCode.trim() || null,
        labour_type: workerForm.labourType,
        work_date: workerForm.workDate,
        hours_worked: Number(workerForm.hoursWorked || 8),
        daily_wage: Number(workerForm.dailyWage || 0),
        work_performed: workerForm.workPerformed.trim() || null,
        subtask_id: workerSubtaskId ? Number(workerSubtaskId) : null,
      });
      setWorkerSuccess('Worker hours logged successfully!');
      setWorkerForm({
        workerName: '',
        workerCode: '',
        labourType: 'General Labour',
        workDate: new Date().toISOString().slice(0, 10),
        hoursWorked: 8,
        dailyWage: 600,
        workPerformed: '',
      });
      setShowAddWorker(false);
      await fetchDetail();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setLoggingWorker(false);
    }
  };

  if (!taskId) return null;

  const task = taskData?.task || taskData;
  const materials = taskData?.materials || task?.materials || [];
  const tools = taskData?.tools || task?.tools || [];
  const labour = taskData?.labour || task?.labour || [];
  const misc = taskData?.misc || task?.misc || [];
  const dailyWork = taskData?.dailyWork || task?.dailyWorkUpdates || taskData?.dailyWorkUpdates || [];
  const workerLogs = taskData?.workerLogs || task?.workerLogs || [];
  const materialUsageList = taskData?.materialUsageList || task?.materialUsageList || [];
  const assignedWorkers = taskData?.assignedWorkers || task?.assignedWorkers || [];
  const actualLabourCost = taskData?.actualLabourCost ?? task?.actuals?.actualLabourCost ?? 0;
  const totalActualExpenses = taskData?.totalActualExpenses ?? task?.actuals?.totalActualExpenses ?? 0;

  const util = taskData?.budgetUtilization || task?.budgetUtilization || {
    materials: { budgeted: Number(task?.material_budget || task?.materialBudget || 0), actual: 0, remaining: Number(task?.material_budget || 0), utilization: 0, isExceeded: false, exceededAmount: 0 },
    tools: { budgeted: Number(task?.tool_budget || task?.toolBudget || 0), actual: 0, remaining: Number(task?.tool_budget || 0), utilization: 0, isExceeded: false, exceededAmount: 0 },
    labour: { budgeted: Number(task?.labour_budget || task?.labourBudget || 0), actual: 0, remaining: Number(task?.labour_budget || 0), utilization: 0, isExceeded: false, exceededAmount: 0 },
    misc: { budgeted: Number(task?.misc_budget || task?.miscBudget || 0), actual: 0, remaining: Number(task?.misc_budget || 0), utilization: 0, isExceeded: false, exceededAmount: 0 },
    total: {
      budgeted: Number(task?.total_budget || task?.totalBudget || 0),
      approvedAdditional: Number(task?.approved_additional_budget || task?.approvedAdditionalBudget || 0),
      effectiveBudget: Number(task?.total_budget || 0) + Number(task?.approved_additional_budget || 0),
      pendingExcess: Number(task?.pending_excess_budget || task?.pendingExcessBudget || 0),
      actual: 0,
      remaining: Number(task?.total_budget || 0),
      utilization: 0,
      isExceeded: false,
      exceededAmount: 0,
      excessReason: task?.excess_reason || task?.excessReason || null,
    },
  };
  const budgetApprovals = taskData?.budgetApprovals || task?.budgetApprovals || [];
  const subtasks = taskData?.subtasks || task?.subtasks || [];
  const hasSubtasks = subtasks.length > 0;
  const SubtaskChip = ({ name }) => (name
    ? <span className="ml-1 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{name}</span>
    : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 sm:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-ink">{task?.name || 'Task Details'}</h3>
                {task?.status && (
                  <Badge tone={STATUS_TONES[task.status] || 'neutral'}>
                    {STATUS_LABELS[task.status] || task.status}
                  </Badge>
                )}
                {task?.progress != null && (
                  <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                    {task.progress}% Complete
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {task?.project_name || task?.projectName || 'Project'} ({task?.project_code || task?.projectCode || ''}) {(task?.site_name || task?.siteName) ? `· Site: ${task.site_name || task.siteName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && <Alert tone="error">{error}</Alert>}
          {workerSuccess && <Alert tone="success">{workerSuccess}</Alert>}

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-64" />
            </div>
          ) : !task ? (
            <div className="py-8 text-center text-ink-muted">Task information not available.</div>
          ) : (
            <>
              {/* Progress & Quick Stats Card */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
                  <p className="text-[11px] font-medium text-ink-subtle">Total Budget</p>
                  <p className="mt-1 text-xl font-bold text-ink">{formatCurrency(task.total_budget || 0)}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    {hasSubtasks ? `Admin allocated · incl. ${subtasks.length} subtask${subtasks.length === 1 ? '' : 's'}` : 'Admin allocated'}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
                  <p className="text-[11px] font-medium text-ink-subtle">Labour Incurred</p>
                  <p className="mt-1 text-xl font-bold text-brand-700">{formatCurrency(actualLabourCost)}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    {workerLogs.length} worker logs
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
                  <p className="text-[11px] font-medium text-ink-subtle">Dates & Duration</p>
                  <p className="mt-1 text-sm font-bold text-ink">
                    {task.duration_days || 0} <span className="text-xs font-normal text-ink-muted">days</span>
                  </p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    {formatDate(task.start_date || task.planned_start)} → {formatDate(task.end_date || task.planned_end)}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
                  <p className="text-[11px] font-medium text-ink-subtle">Current Progress</p>
                  <div className="mt-1 flex items-baseline justify-between">
                    <p className="text-xl font-bold text-ink">{task.progress || 0}%</p>
                    <span className="text-[11px] text-ink-muted">
                      {hasSubtasks ? `from ${subtasks.length} subtasks` : `${dailyWork.length} updates`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full bg-brand-600 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, task.progress || 0))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-line gap-2 overflow-x-auto text-xs font-medium">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'subtasks', label: 'Subtasks', count: subtasks.length },
                  { id: 'materials', label: 'Materials', count: materials.length },
                  { id: 'tools', label: 'Tools & Machines', count: tools.length },
                  { id: 'labour', label: 'Labour & Workers', count: workerLogs.length },
                  { id: 'daily-work', label: 'Daily Work Updates', count: dailyWork.length },
                  { id: 'expenses', label: 'Expenses & Costs' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`whitespace-nowrap pb-2.5 px-3 border-b-2 transition-colors ${
                      activeTab === t.id
                        ? 'border-brand-600 font-semibold text-brand-700'
                        : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    {t.label} {t.count !== undefined ? `(${t.count})` : ''}
                  </button>
                ))}
              </div>

              {/* Tab: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {task.description && (
                    <div className="rounded-xl border border-line bg-canvas/30 p-4">
                      <h4 className="text-xs font-semibold text-ink-subtle uppercase">Scope & Description</h4>
                      <p className="mt-1 text-xs text-ink whitespace-pre-wrap">{task.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-line p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-ink uppercase tracking-wider">Planning Specifications</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-line/60">
                          <span className="text-ink-muted">Project:</span>
                          <span className="font-semibold text-ink">{task.project_name} ({task.project_code})</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-line/60">
                          <span className="text-ink-muted">Assigned Site:</span>
                          <span className="font-semibold text-ink">{task.site_name || 'All Sites'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-line/60">
                          <span className="text-ink-muted">Contractor:</span>
                          <span className="font-semibold text-ink">{task.contractor_name || 'Unassigned'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-line/60">
                          <span className="text-ink-muted">Estimated Duration:</span>
                          <span className="font-semibold text-ink">{task.duration_days || 0} Days</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-ink-muted">Created By:</span>
                          <span className="font-semibold text-ink">{task.created_by_name || 'Admin'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-line p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-ink uppercase tracking-wider">Approved Budget Summary</h4>
                        {util.total.pendingExcess > 0 ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            ⚠️ +{formatCurrency(util.total.pendingExcess)} Pending Admin Approval
                          </span>
                        ) : util.total.isExceeded ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            ⚠️ Over Budget
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Within Budget
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-line/60">
                          <span className="text-ink-muted">Base Task Budget:</span>
                          <span className="font-semibold text-ink">{formatCurrency(util.total.budgeted)}</span>
                        </div>
                        {util.total.approvedAdditional > 0 && (
                          <div className="flex justify-between py-1 border-b border-line/60 text-emerald-700 font-medium">
                            <span>Approved Additional:</span>
                            <span>+{formatCurrency(util.total.approvedAdditional)}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-1 border-b border-line/60">
                          <span className="text-ink-muted">Total Effective Budget:</span>
                          <span className="font-bold text-ink">{formatCurrency(util.total.effectiveBudget)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-line/60">
                          <span className="text-ink-muted">Actual Amount Used:</span>
                          <span className="font-bold text-brand-700">{formatCurrency(util.total.actual)}</span>
                        </div>
                        <div className="flex justify-between py-1.5 bg-canvas/60 px-2 rounded-lg font-bold text-sm">
                          <span className="text-ink">Remaining Amount:</span>
                          <span className={util.total.remaining > 0 ? "text-emerald-700" : "text-rose-700"}>
                            {formatCurrency(util.total.remaining)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 1. TASK BUDGET VS ACTUAL UTILIZATION TABLE */}
                  <div className="rounded-xl border border-line bg-white overflow-hidden space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                          Task Budget vs Actual Utilization
                        </h4>
                        <p className="text-[11px] text-ink-subtle">
                          Live real-time calculations from contractor updates, procurement, usage, wages, and expenses
                        </p>
                      </div>
                      <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 border border-brand-200">
                        Overall Utilization: {util.total.utilization}%
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-line">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-canvas text-ink-muted uppercase font-medium">
                          <tr>
                            <th className="py-2.5 px-3">Budget Category</th>
                            <th className="py-2.5 px-3 text-right">Estimated / Budgeted</th>
                            <th className="py-2.5 px-3 text-right">Actual / Used</th>
                            <th className="py-2.5 px-3 text-right">Remaining Amount</th>
                            <th className="py-2.5 px-3 text-right">Utilization %</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {/* Materials */}
                          <tr className={util.materials.isExceeded ? "bg-rose-50/30" : "hover:bg-canvas/30"}>
                            <td className="py-2.5 px-3 font-semibold text-ink flex items-center gap-2">
                              <Package className="h-4 w-4 text-brand-600 shrink-0" />
                              Materials
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium tabular-nums text-ink">
                              {formatCurrency(util.materials.budgeted)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-brand-700">
                              {formatCurrency(util.materials.actual)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-700">
                              {formatCurrency(util.materials.remaining)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">
                              {util.materials.utilization}%
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {util.materials.isExceeded ? (
                                <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  Exceeded (+{formatCurrency(util.materials.exceededAmount)})
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  On Track
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Machines / Tools */}
                          <tr className={util.tools.isExceeded ? "bg-rose-50/30" : "hover:bg-canvas/30"}>
                            <td className="py-2.5 px-3 font-semibold text-ink flex items-center gap-2">
                              <Wrench className="h-4 w-4 text-amber-600 shrink-0" />
                              Machines & Tools
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium tabular-nums text-ink">
                              {formatCurrency(util.tools.budgeted)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-amber-700">
                              {formatCurrency(util.tools.actual)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-700">
                              {formatCurrency(util.tools.remaining)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">
                              {util.tools.utilization}%
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {util.tools.isExceeded ? (
                                <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  Exceeded (+{formatCurrency(util.tools.exceededAmount)})
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  On Track
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Labour */}
                          <tr className={util.labour.isExceeded ? "bg-rose-50/30" : "hover:bg-canvas/30"}>
                            <td className="py-2.5 px-3 font-semibold text-ink flex items-center gap-2">
                              <Users className="h-4 w-4 text-emerald-600 shrink-0" />
                              Labour
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium tabular-nums text-ink">
                              {formatCurrency(util.labour.budgeted)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-emerald-700">
                              {formatCurrency(util.labour.actual)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-700">
                              {formatCurrency(util.labour.remaining)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">
                              {util.labour.utilization}%
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {util.labour.isExceeded ? (
                                <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  Exceeded (+{formatCurrency(util.labour.exceededAmount)})
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  On Track
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Miscellaneous */}
                          <tr className={util.misc.isExceeded ? "bg-rose-50/30" : "hover:bg-canvas/30"}>
                            <td className="py-2.5 px-3 font-semibold text-ink flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-indigo-600 shrink-0" />
                              Miscellaneous
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium tabular-nums text-ink">
                              {formatCurrency(util.misc.budgeted)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-indigo-700">
                              {formatCurrency(util.misc.actual)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-700">
                              {formatCurrency(util.misc.remaining)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">
                              {util.misc.utilization}%
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {util.misc.isExceeded ? (
                                <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  Exceeded (+{formatCurrency(util.misc.exceededAmount)})
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  On Track
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Task Total */}
                          <tr className="bg-canvas font-bold border-t-2 border-line">
                            <td className="py-3 px-3 text-ink font-bold flex items-center gap-2">
                              <Layers className="h-4 w-4 text-ink shrink-0" />
                              Task Total
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-ink">
                              {formatCurrency(util.total.effectiveBudget)}
                              {util.total.approvedAdditional > 0 && (
                                <div className="text-[10px] text-emerald-700 font-normal">
                                  ({formatCurrency(util.total.budgeted)} + {formatCurrency(util.total.approvedAdditional)} addl)
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-brand-800 font-bold">
                              {formatCurrency(util.total.actual)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-emerald-700 font-bold">
                              {formatCurrency(util.total.remaining)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-brand-800 font-bold">
                              {util.total.utilization}%
                            </td>
                            <td className="py-3 px-3 text-center">
                              {util.total.pendingExcess > 0 ? (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  Pending Approval (+{formatCurrency(util.total.pendingExcess)})
                                </span>
                              ) : util.total.isExceeded ? (
                                <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                  Over Budget (+{formatCurrency(util.total.exceededAmount)})
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                  Within Budget
                                </span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {hasSubtasks && (
                    <div className="rounded-xl border border-line bg-white p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Subtask Breakdown</h4>
                          <p className="text-[11px] text-ink-subtle">
                            Subtask totals are already included in the task figures above — not added twice.
                          </p>
                        </div>
                        <Button variant="secondary" size="xs" onClick={() => setActiveTab('subtasks')}>
                          View subtask details
                        </Button>
                      </div>
                      <SubtaskSummaryTable subtasks={subtasks} onOpen={() => setActiveTab('subtasks')} />
                    </div>
                  )}

                  {/* 2. AUDIT TRAIL: BUDGET APPROVALS & CHANGES */}
                  {budgetApprovals.length > 0 && (
                    <div className="rounded-xl border border-line bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-brand-700" />
                          <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                            Budget Approvals & Excess Requests Audit Trail ({budgetApprovals.length})
                          </h4>
                        </div>
                        <span className="text-[11px] text-ink-subtle">
                          Original approved budget stays unchanged; approved additional tracked separately
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas text-ink-muted uppercase font-medium">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Category</th>
                              <th className="py-2.5 px-3 text-right">Requested Excess</th>
                              <th className="py-2.5 px-3">Mandatory Reason</th>
                              <th className="py-2.5 px-3">Requested By</th>
                              <th className="py-2.5 px-3 text-center">Status</th>
                              <th className="py-2.5 px-3">Decision Note</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {budgetApprovals.map((ba) => (
                              <tr key={ba.id} className="hover:bg-canvas/30">
                                <td className="py-2.5 px-3 text-ink-muted whitespace-nowrap">
                                  {formatDate(ba.createdAt)}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-ink">
                                  <div>{ba.category || 'Task Total'}<SubtaskChip name={ba.subtaskName} /></div>
                                  {ba.category === 'labour' && (ba.originalPlannedWorkers > 0 || ba.additionalWorkers > 0) && (
                                    <div className="text-[10px] text-ink-muted font-normal">
                                      Plan: {ba.originalPlannedWorkers} | Addl: +{ba.additionalWorkers} worker(s)
                                      {ba.revisedLabourBudget > 0 && ` | Revised: ₹${ba.revisedLabourBudget.toLocaleString('en-IN')}`}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-rose-700 tabular-nums">
                                  +{formatCurrency(ba.requestedExcess)}
                                </td>
                                <td className="py-2.5 px-3 text-ink max-w-xs break-words">
                                  {ba.reason}
                                </td>
                                <td className="py-2.5 px-3 text-ink-muted">
                                  {ba.requestedByName || 'Contractor'}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span
                                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                      ba.status === 'approved'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : ba.status === 'rejected'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {ba.status ? ba.status.toUpperCase() : 'PENDING'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-ink-muted max-w-xs truncate">
                                  {ba.decidedByName ? (
                                    <div>
                                      <span className="font-medium text-ink">Decided by {ba.decidedByName}</span>
                                      {ba.decidedAt && <span className="text-[10px] block">on {formatDate(ba.decidedAt)}</span>}
                                      {ba.decisionNote && <span className="text-[10px] text-ink-muted italic block">"{ba.decisionNote}"</span>}
                                    </div>
                                  ) : ba.decisionNote ? (
                                    ba.decisionNote
                                  ) : ba.status === 'pending' ? (
                                    'Pending Admin review'
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Subtasks */}
              {activeTab === 'subtasks' && (
                <SubtasksPanel
                  task={{ ...task, subtasks, directScope: taskData?.directScope || task?.directScope, consolidation: taskData?.consolidation || task?.consolidation }}
                  isAdmin={isAdmin}
                  onAdd={() => setSubtaskForm({ open: true, initial: null })}
                  onEdit={(st) => setSubtaskForm({ open: true, initial: st })}
                  onDelete={handleDeleteSubtask}
                  onProgressSave={handleSubtaskProgress}
                  deletingId={deletingSubtaskId}
                />
              )}

              {/* Tab: Materials */}
              {activeTab === 'materials' && (
                <div className="space-y-6">
                  {/* Budgeted Materials */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">
                      {hasSubtasks ? 'Main Task Direct Materials' : 'Budgeted Materials'} ({materials.length})
                    </h4>
                    {hasSubtasks && (
                      <p className="mb-2 text-[11px] text-ink-muted">
                        Materials planned inside subtasks are listed per subtask on the{' '}
                        <button type="button" className="text-brand-700 underline" onClick={() => setActiveTab('subtasks')}>Subtasks</button> tab.
                      </p>
                    )}
                    {materials.length === 0 ? (
                      <p className="text-xs text-ink-muted italic">No materials budgeted for this task.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas text-ink-muted uppercase font-medium">
                            <tr>
                              <th className="py-2.5 px-3">Material</th>
                              <th className="py-2.5 px-3 text-right">Planned Qty</th>
                              <th className="py-2.5 px-3 text-right">Procured</th>
                              <th className="py-2.5 px-3 text-right">Used</th>
                              <th className="py-2.5 px-3 text-right">Remaining</th>
                              <th className="py-2.5 px-3 text-center">Excess</th>
                              <th className="py-2.5 px-3 text-right">Total Budget</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {materials.map((m) => {
                              const name = m.materialName || m.material_name;
                              const code = m.materialCode || m.material_code;
                              const unit = m.unit || m.material_unit || 'units';
                              const origPlanned = m.originalPlanned != null ? m.originalPlanned : (m.quantity || 0);
                              const approvedAdd = Number(m.approvedAdditional || 0);
                              const revised = m.revisedApproved != null ? m.revisedApproved : origPlanned;
                              const procured = Number(m.procured || 0);
                              const used = Number(m.used || 0);
                              const remaining = m.remaining != null ? m.remaining : Math.max(0, revised - used);
                              const excess = Number(m.excess || 0);
                              const cost = m.totalCost != null ? m.totalCost : m.total_cost || 0;
                              const pending = Number(m.pendingApprovals || 0);

                              return (
                                <tr key={m.id} className="hover:bg-canvas/40">
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-ink flex items-center gap-1.5">
                                      {name}
                                      {pending > 0 && (
                                        <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800">
                                          {pending} {unit} pending
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-ink-subtle">{code || '—'}</div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">
                                    <span className="font-medium text-ink">{revised} {unit}</span>
                                    {approvedAdd > 0 && (
                                      <div className="text-[10px] text-emerald-700">
                                        ({origPlanned} orig + {approvedAdd} addl)
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-medium tabular-nums text-ink">
                                    {procured} {unit}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-medium tabular-nums text-brand-700">
                                    {used} {unit}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-700">
                                    {remaining} {unit}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    {excess > 0 ? (
                                      <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                                        +{excess} {unit}
                                      </span>
                                    ) : (
                                      <span className="text-ink-subtle">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">
                                    {formatCurrency(cost)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Consumed Materials via Daily Work */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">
                      Actual Materials Consumed On Site ({materialUsageList.length})
                    </h4>
                    {materialUsageList.length === 0 ? (
                      <p className="text-xs text-ink-muted italic">No material consumption recorded on this task yet.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas text-ink-muted uppercase font-medium">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Material</th>
                              <th className="py-2.5 px-3 text-right">Quantity Used</th>
                              <th className="py-2.5 px-3">Contractor</th>
                              <th className="py-2.5 px-3">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {materialUsageList.map((c) => (
                              <tr key={c.id} className="hover:bg-canvas/40">
                                <td className="py-2.5 px-3 text-ink-muted">{formatDate(c.date)}</td>
                                <td className="py-2.5 px-3 font-semibold text-ink">{c.materialName}<SubtaskChip name={c.subtaskName} /></td>
                                <td className="py-2.5 px-3 text-right font-bold text-brand-700 tabular-nums">
                                  {c.quantityUsed} {c.unit}
                                </td>
                                <td className="py-2.5 px-3 text-ink">{c.contractorName || '—'}</td>
                                <td className="py-2.5 px-3 text-ink-muted max-w-xs truncate">{c.remarks || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Tools */}
              {activeTab === 'tools' && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">
                    {hasSubtasks ? 'Main Task Direct Tools & Machinery' : 'Tools & Machinery Required'} ({tools.length})
                  </h4>
                  {hasSubtasks && (
                    <p className="mb-2 text-[11px] text-ink-muted">Machines planned inside subtasks are listed on the Subtasks tab.</p>
                  )}
                  {tools.length === 0 ? (
                    <p className="text-xs text-ink-muted italic">No tools or machines planned for this task.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-canvas text-ink-muted uppercase font-medium">
                          <tr>
                            <th className="py-2.5 px-3">Tool / Machine</th>
                            <th className="py-2.5 px-3">Rent / Purchase</th>
                            <th className="py-2.5 px-3 text-right">Quantity</th>
                            <th className="py-2.5 px-3 text-right">Rate/Day or Cost</th>
                            <th className="py-2.5 px-3 text-right">Days</th>
                            <th className="py-2.5 px-3 text-right">Total Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {tools.map((t) => {
                            const rentalType = t.rentalType ?? t.rental_type;
                            return (
                              <tr key={t.id} className="hover:bg-canvas/40">
                                <td className="py-2.5 px-3 font-semibold text-ink">{t.toolName ?? t.tool_name}</td>
                                <td className="py-2.5 px-3">
                                  <Badge tone="neutral">{rentalType}</Badge>
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{t.quantity}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(t.cost)}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  {String(rentalType).toLowerCase() === 'purchase' ? '—' : Number(t.workingDays ?? t.working_days ?? 1)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">
                                  {formatCurrency(t.totalCost ?? t.total_cost)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Labour & Workers */}
              {activeTab === 'labour' && (
                <div className="space-y-6">
                  {/* 1. Planned Labour Budget (Admin Planned) */}
                  <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                          1. Planned Labour Budget (Admin Planned)
                        </h4>
                        <p className="text-[11px] text-ink-muted">
                          Aggregate manpower requirement: Workers × Working Days × Daily Wage = Planned Labour Budget
                        </p>
                      </div>
                      <Badge tone="neutral">
                        Budget: {formatCurrency(task.labour_budget || 0)}
                      </Badge>
                    </div>

                    {labour.length === 0 ? (
                      <p className="text-xs text-ink-muted italic">No labour budget items planned by Admin.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-line bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas-subtle text-ink-subtle uppercase text-[11px] font-semibold">
                            <tr>
                              <th className="py-2 px-3">Role / Skill Category</th>
                              <th className="py-2 px-3 text-right">Workers</th>
                              <th className="py-2 px-3 text-right">Working Days</th>
                              <th className="py-2 px-3 text-right">Daily Wage</th>
                              <th className="py-2 px-3 text-right">Budgeted Total</th>
                              <th className="py-2 px-3">Planning Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {labour.map((l, lIdx) => (
                              <tr key={l.id || lIdx} className="hover:bg-canvas-subtle/50">
                                <td className="py-2 px-3 font-semibold text-ink">
                                  {l.labour_type || l.labourType || 'General Labour'}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums">{l.worker_count || l.workerCount || 1}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{l.working_days || l.workingDays || 0} d</td>
                                <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(l.daily_wage || l.dailyWage || 0)}</td>
                                <td className="py-2 px-3 text-right font-bold text-ink tabular-nums">
                                  {formatCurrency(l.total_cost || l.totalCost || 0)}
                                </td>
                                <td className="py-2 px-3 text-ink-muted">{l.remarks || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 2. Actual Assigned Labour / Workers */}
                  <div className="rounded-xl border border-brand-200 bg-white p-4 space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-line">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-ink">
                            2. Labour / Workers Assigned to Task
                          </h4>
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                            {(taskData?.task?.assignedWorkers || []).length} Assigned
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted">
                          Actual people designated to execute this task (Daily Wage Workers & Company Staff).
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="xs"
                          type="button"
                          onClick={() => setShowQuickAddModal(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          + Add Labour (New)
                        </Button>
                        <Button
                          size="xs"
                          type="button"
                          onClick={() => setShowAssignModal(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          + Assign Worker to Task
                        </Button>
                      </div>
                    </div>

                    {(taskData?.task?.assignedWorkers || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-line bg-canvas/30 p-6 text-center">
                        <Users className="mx-auto h-8 w-8 text-ink-subtle mb-1" />
                        <p className="text-xs font-medium text-ink">No workers assigned to this task yet.</p>
                        <p className="text-[11px] text-ink-subtle mt-0.5">
                          Click &ldquo;+ Assign Worker to Task&rdquo; to select actual workers from the Labour Directory.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas-subtle text-ink-subtle uppercase text-[11px] font-semibold">
                            <tr>
                              <th className="py-2.5 px-3">Worker / Person</th>
                              <th className="py-2.5 px-3">Type</th>
                              <th className="py-2.5 px-3">Contact & Aadhaar</th>
                              <th className="py-2.5 px-3">Start Date</th>
                              <th className="py-2.5 px-3">End Date</th>
                              <th className="py-2.5 px-3 text-right">Expected Days</th>
                              <th className="py-2.5 px-3 text-right">Daily Wage</th>
                              <th className="py-2.5 px-3 text-right">Planned Cost</th>
                              <th className="py-2.5 px-3 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {(taskData?.task?.assignedWorkers || []).map((w) => {
                              const isCompany = w.workerType === 'company_labour' || w.workerType === 'company_employee' || w.isCompanyLabour;
                              return (
                                <tr key={w.id} className="hover:bg-canvas/40 transition-colors">
                                  <td className="py-2.5 px-3 font-semibold text-ink">
                                    <div className="flex items-center gap-1.5">
                                      <span>{w.workerName}</span>
                                      <SubtaskChip name={w.subtaskName} />
                                      {w.trade && (
                                        <span className="text-[10px] text-ink-muted">({w.trade})</span>
                                      )}
                                    </div>
                                    {w.workerCode && (
                                      <span className="text-[10px] text-ink-subtle font-mono">{w.workerCode}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col gap-1 items-start">
                                      <Badge tone={isCompany ? 'info' : 'success'}>
                                        {isCompany ? 'Company Labour' : 'Daily Wage Worker'}
                                      </Badge>
                                      {w.status === 'pending_approval' && (
                                        <Badge tone="warning">Pending Approval</Badge>
                                      )}
                                      {w.status === 'rejected' && (
                                        <Badge tone="danger">Rejected</Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-muted text-[11px]">
                                    {w.phone && <div>Mob: {w.phone}</div>}
                                    {w.aadhaarNumber && <div className="text-ink-subtle">Aadhaar: {w.aadhaarNumber}</div>}
                                    {!w.phone && !w.aadhaarNumber && '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-muted">{formatDate(w.startDate)}</td>
                                  <td className="py-2.5 px-3 text-ink-muted">{formatDate(w.endDate)}</td>
                                  <td className="py-2.5 px-3 text-right font-medium tabular-nums">{w.expectedDays} d</td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">
                                    {isCompany ? <span className="text-blue-700 font-semibold">₹0</span> : formatCurrency(w.dailyWage)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-ink tabular-nums">
                                    {isCompany ? <span className="text-blue-700 font-semibold">₹0</span> : formatCurrency(w.plannedCost)}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleUnassignWorker(w.id, w.workerName)}
                                      className="rounded p-1 text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                      title="Unassign worker from task"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Worker Logs On-Site */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                          Workers on Site & Activity Log ({workerLogs.length})
                        </h4>
                        <p className="text-[11px] text-ink-muted">
                          Total Incurred Labour Cost: <strong className="text-ink">{formatCurrency(actualLabourCost)}</strong>
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setShowAddWorker(!showAddWorker)}>
                        <Plus className="h-3.5 w-3.5" />
                        Log Worker Hours
                      </Button>
                    </div>

                    {/* Inline Worker Log Form */}
                    {showAddWorker && (
                      <form onSubmit={handleAddWorker} className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
                        <h5 className="text-xs font-bold text-brand-900">Record Worker Hours for This Task</h5>
                        {hasSubtasks && (
                          <div>
                            <label className="block text-[11px] font-medium text-ink mb-1">Subtask</label>
                            <select
                              value={workerSubtaskId}
                              onChange={(e) => setWorkerSubtaskId(e.target.value)}
                              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500"
                            >
                              <option value="">Main task (not a specific subtask)</option>
                              {subtasks.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-[11px] font-medium text-ink mb-1">Worker Name *</label>
                            <input
                              type="text"
                              value={workerForm.workerName}
                              onChange={(e) => setWorkerForm({ ...workerForm, workerName: e.target.value })}
                              placeholder="e.g. Ramesh Kumar"
                              required
                              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-ink mb-1">Worker ID / Code</label>
                            <input
                              type="text"
                              value={workerForm.workerCode}
                              onChange={(e) => setWorkerForm({ ...workerForm, workerCode: e.target.value })}
                              placeholder="e.g. W-102"
                              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-ink mb-1">Labour Type</label>
                            <select
                              value={workerForm.labourType}
                              onChange={(e) => setWorkerForm({ ...workerForm, labourType: e.target.value })}
                              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500"
                            >
                              <option value="General Labour">General Labour</option>
                              <option value="Mason">Mason</option>
                              <option value="Carpenter">Carpenter</option>
                              <option value="Electrician">Electrician</option>
                              <option value="Plumber">Plumber</option>
                              <option value="Bar Bender">Bar Bender</option>
                              <option value="Painter">Painter</option>
                              <option value="Supervisor">Supervisor</option>
                              <option value="Machine Operator">Machine Operator</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-ink mb-1">Date</label>
                            <input
                              type="date"
                              value={workerForm.workDate}
                              onChange={(e) => setWorkerForm({ ...workerForm, workDate: e.target.value })}
                              required
                              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-ink mb-1">Hours Worked</label>
                            <input
                              type="number"
                              step="0.5"
                              value={workerForm.hoursWorked}
                              onChange={(e) => setWorkerForm({ ...workerForm, hoursWorked: Number(e.target.value) })}
                              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-ink mb-1">Daily Wage (₹)</label>
                            <input
                              type="number"
                              value={workerForm.dailyWage}
                              onChange={(e) => setWorkerForm({ ...workerForm, dailyWage: Number(e.target.value) })}
                              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-ink mb-1">Work Performed</label>
                          <input
                            type="text"
                            value={workerForm.workPerformed}
                            onChange={(e) => setWorkerForm({ ...workerForm, workPerformed: e.target.value })}
                            placeholder="e.g. Brick laying on 2nd floor, pillar reinforcement"
                            className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddWorker(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" type="submit" disabled={loggingWorker}>
                            {loggingWorker ? 'Saving…' : 'Save Worker Log'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {workerLogs.length === 0 ? (
                      <p className="text-xs text-ink-muted italic">No individual worker records logged for this task yet.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas text-ink-muted uppercase font-medium">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Worker Name</th>
                              <th className="py-2.5 px-3">ID</th>
                              <th className="py-2.5 px-3">Trade</th>
                              <th className="py-2.5 px-3 text-right">Hours</th>
                              <th className="py-2.5 px-3 text-right">Daily Wage</th>
                              <th className="py-2.5 px-3 text-right">Calculated Cost</th>
                              <th className="py-2.5 px-3">Work Performed</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {workerLogs.map((w) => {
                              const wage = Number(w.dailyWage ?? w.daily_wage ?? 0);
                              const hours = Number(w.hoursWorked ?? w.hours_worked ?? 8);
                              const cost = (wage * hours) / 8;
                              return (
                                <tr key={w.id} className="hover:bg-canvas/40">
                                  <td className="py-2.5 px-3 text-ink-muted">{formatDate(w.workDate ?? w.work_date)}</td>
                                  <td className="py-2.5 px-3 font-semibold text-ink">
                                    {w.workerName ?? w.worker_name}
                                    <SubtaskChip name={w.subtaskName} />
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-muted">{(w.workerCode ?? w.worker_code) || '—'}</td>
                                  <td className="py-2.5 px-3">
                                    <Badge tone="neutral">{w.labourType ?? w.labour_type}</Badge>
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">{hours} hrs</td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(wage)}</td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-brand-700 tabular-nums">
                                    {formatCurrency(cost)}
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-muted max-w-xs truncate">
                                    {(w.workPerformed ?? w.work_performed) || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Daily Work Updates */}
              {activeTab === 'daily-work' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    Activity & Progress Reports ({dailyWork.length})
                  </h4>
                  {dailyWork.length === 0 ? (
                    <p className="text-xs text-ink-muted italic">No daily work updates logged against this task yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {dailyWork.map((u) => (
                        <div key={u.id} className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-ink">{formatDate(u.workDate ?? u.work_date)}</span>
                              <Badge tone={(u.workStatus ?? u.work_status) === 'completed' ? 'positive' : 'neutral'}>
                                {u.workStatus ?? u.work_status}
                              </Badge>
                              <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">
                                {u.progressPercentage ?? u.progress_percentage ?? 0}%
                              </span>
                              <SubtaskChip name={u.subtaskName} />
                            </div>
                            <span className="text-xs text-ink-muted">Contractor: {(u.contractorName ?? u.contractor_name) || 'Assigned team'}</span>
                          </div>

                          <p className="text-xs text-ink whitespace-pre-wrap">{u.workDone ?? u.work_done}</p>

                          {(u.quantityUsed ?? u.quantity_used) > 0 && (
                            <div className="rounded-lg bg-white border border-line p-2 text-xs text-ink flex items-center gap-2">
                              <Package className="h-4 w-4 text-brand-600" />
                              <span>
                                Material consumed: <strong>{u.quantityUsed ?? u.quantity_used} {u.unit || u.material_unit}</strong> of{' '}
                                <strong>{u.materialName ?? u.material_name}</strong>
                              </span>
                            </div>
                          )}

                          {u.remarks && (
                            <p className="text-[11px] text-ink-muted italic">Remarks: {u.remarks}</p>
                          )}

                          {/* Photos if any */}
                          {u.photos && u.photos.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-line/60">
                              {u.photos.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setSelectedPhoto(p.url || `/api/daily-work/photos/${p.id}`)}
                                  className="group relative h-16 w-16 overflow-hidden rounded-lg border border-line bg-canvas"
                                >
                                  <img
                                    src={p.url || `/api/daily-work/photos/${p.id}`}
                                    alt={p.fileName ?? p.file_name}
                                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Expenses */}
              {activeTab === 'expenses' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-line bg-canvas/30 p-3.5">
                      <p className="text-[11px] text-ink-subtle">Total Budget Allocated</p>
                      <p className="text-lg font-bold text-ink">{formatCurrency(task.total_budget || 0)}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-canvas/30 p-3.5">
                      <p className="text-[11px] text-ink-subtle">Labour Incurred Cost</p>
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(actualLabourCost)}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-canvas/30 p-3.5">
                      <p className="text-[11px] text-ink-subtle">Total Recorded Cost</p>
                      <p className="text-lg font-bold text-brand-700">{formatCurrency(totalActualExpenses)}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-ink uppercase tracking-wider">Financial Breakdown</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1.5 border-b border-line/60">
                        <span className="text-ink-muted">Planned Material Cost:</span>
                        <span className="font-semibold text-ink">{formatCurrency(task.material_budget || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-line/60">
                        <span className="text-ink-muted">Planned Tools & Machinery:</span>
                        <span className="font-semibold text-ink">{formatCurrency(task.tool_budget || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-line/60">
                        <span className="text-ink-muted">Planned Labour Budget:</span>
                        <span className="font-semibold text-ink">{formatCurrency(task.labour_budget || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-line/60">
                        <span className="text-ink-muted">Planned Miscellaneous:</span>
                        <span className="font-semibold text-ink">{formatCurrency(task.misc_budget || 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 bg-canvas px-3 rounded-lg font-bold">
                        <span className="text-ink">Net Variance (Allocated - Incurred):</span>
                        <span
                          className={`tabular-nums ${
                            Number(task.total_budget || 0) - totalActualExpenses >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {formatCurrency(Number(task.total_budget || 0) - totalActualExpenses)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-line px-6 py-3.5 bg-canvas/30 rounded-b-2xl">
          <span className="text-xs text-ink-muted">
            ID: #{task?.id} · Project ID: #{task?.project_id || task?.projectId}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Photo lightbox modal */}

      {/* Assign Worker Modal */}
      <AssignWorkerModal
        isOpen={showAssignModal}
        taskId={taskId}
        task={task}
        onClose={() => setShowAssignModal(false)}
        onAssigned={() => {
          fetchDetail();
          if (onUpdated) onUpdated();
        }}
        onOpenQuickAdd={() => {
          setShowAssignModal(false);
          setShowQuickAddModal(true);
        }}
      />

      {/* Subtask create / edit (same planning editor as a main task) */}
      {subtaskForm.open && task && (
        <TaskFormModal
          isOpen
          mode="subtask"
          parentTask={task}
          projectId={task.projectId || task.project_id}
          initialData={subtaskForm.initial}
          onClose={() => setSubtaskForm({ open: false, initial: null })}
          onSaved={async () => {
            await fetchDetail();
            if (onUpdated) onUpdated();
          }}
        />
      )}

      {/* Quick Add Worker Modal */}
      <QuickAddWorkerModal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        onCreated={() => {
          fetchDetail();
          setShowAssignModal(true);
        }}
      />

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-xl bg-black">
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
            <img src={selectedPhoto} alt="Work preview" className="max-h-[85vh] w-auto object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
