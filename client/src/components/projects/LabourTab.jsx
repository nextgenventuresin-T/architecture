import { useState, useEffect, useMemo } from 'react';
import { HardHat, Users, Clock, CalendarCheck, CheckCircle2, RefreshCw, AlertCircle, Plus } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import TextField from '../ui/TextField';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import Modal from '../ui/Modal';
import Alert from '../ui/Alert';
import { projectsApi } from '../../api/projectsApi';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';

/**
 * Project / Site Labour Tracking:
 * - Summary KPI: Labour Assigned (Budget) -> Labour Worked (Actuals) -> Remaining
 * - Dual switchable views:
 *   A. Labour Worked / Daily Attendance Log (from Daily Work Updates & Task Logs)
 *   B. Task-wise Labour Budget (Planned Workers × Daily Wage × Working Days per Task)
 * - Complete filtering by Contractor, Task, Site, and Date.
 */
export default function LabourTab({ detail, projectId: propProjectId, siteId: propSiteId, lookups, onChanged }) {
  const projectId = propProjectId || detail?.project?.id || detail?.id;
  const initialSiteId = propSiteId || '';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    summary: {
      budgetedWorkers: 0,
      budgetedDays: 0,
      budgetedCost: 0,
      workedDays: 0,
      workedCost: 0,
      remainingDays: 0,
      remainingCost: 0,
    },
    worked: [],
    tasks: [],
    budgetByTask: [],
    budgetByPhase: [],
  });

  const [viewMode, setViewMode] = useState('worked'); // 'worked' or 'budget'
  const [searchFilter, setSearchFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [contractorFilter, setContractorFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState(initialSiteId);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Log Attendance modal state
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logForm, setLogForm] = useState({
    record_date: new Date().toISOString().slice(0, 10),
    site_id: propSiteId || '',
    task_id: '',
    contractor_id: detail?.project?.contractor_id || '',
    category: 'Mason',
    worker_count: 5,
    present_count: 5,
    daily_rate: 650,
    payment_status: 'verified',
  });

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    if (!logForm.category.trim()) {
      setLogError('Please enter or select a trade/category.');
      return;
    }
    try {
      setLogSubmitting(true);
      setLogError(null);
      await projectsApi.logLabour(projectId, {
        ...logForm,
        site_id: logForm.site_id ? Number(logForm.site_id) : undefined,
        task_id: logForm.task_id ? Number(logForm.task_id) : undefined,
        contractor_id: logForm.contractor_id ? Number(logForm.contractor_id) : undefined,
        worker_count: Number(logForm.worker_count || 1),
        present_count: Number(logForm.present_count || 1),
        daily_rate: Number(logForm.daily_rate || 0),
      });
      setIsLogOpen(false);
      fetchTracking();
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setLogError(err.response?.data?.error?.message || err.message || 'Failed to log labour');
    } finally {
      setLogSubmitting(false);
    }
  };

  const fetchTracking = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const params = {};
      if (siteFilter) params.siteId = siteFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await projectsApi.labourTracking(projectId, params);
      setData(
        res || {
          summary: {
            budgetedWorkers: 0,
            budgetedDays: 0,
            budgetedCost: 0,
            workedDays: 0,
            workedCost: 0,
            remainingDays: 0,
            remainingCost: 0,
          },
          worked: [],
          tasks: [],
          budgetByTask: [],
          budgetByPhase: [],
        }
      );
    } catch (err) {
      console.error('Failed to load labour tracking:', err);
      // Fallback from detail if available
      if (detail?.labour) {
        const totalWorkers = detail.labour.reduce((s, r) => s + Number(r.worker_count || 0), 0);
        const totalCost = detail.labour.reduce((s, r) => s + Number(r.daily_cost || 0), 0);
        setData({
          summary: {
            budgetedWorkers: totalWorkers,
            budgetedDays: 0,
            budgetedCost: totalCost,
            workedDays: detail.labour.reduce((s, r) => s + Number(r.present_count || 0), 0),
            workedCost: totalCost,
            remainingDays: 0,
            remainingCost: 0,
          },
          worked: detail.labour.map((l) => ({
            daily_work_id: l.id,
            work_date: l.record_date,
            phase_name: l.category,
            task_name: l.category,
            site_name: l.site_name,
            contractor_name: l.contractor_name,
            labour_count: l.present_count,
            working_hours: 8,
            work_description: `${l.category} crew deployment`,
            verified_by_engineer: true,
          })),
          tasks: [],
          budgetByTask: [],
          budgetByPhase: [],
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, [projectId, siteFilter, dateFrom, dateTo]);

  // Unique filter lists
  const taskBudgetList = useMemo(() => {
    return data.budgetByTask || data.tasks || data.budgetByPhase || [];
  }, [data.budgetByTask, data.tasks, data.budgetByPhase]);

  const availableTasks = useMemo(() => {
    const set = new Set();
    data.worked.forEach((w) => {
      const t = w.task_name || w.phase_name;
      if (t) set.add(t);
    });
    taskBudgetList.forEach((b) => {
      const t = b.task_name || b.name || b.phase_name;
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [data.worked, taskBudgetList]);

  const availableContractors = useMemo(() => {
    const set = new Set();
    data.worked.forEach((w) => { if (w.contractor_name) set.add(w.contractor_name); });
    return Array.from(set).sort();
  }, [data.worked]);

  const filteredWorked = useMemo(() => {
    return data.worked.filter((row) => {
      if (
        searchFilter &&
        !row.work_description?.toLowerCase().includes(searchFilter.toLowerCase()) &&
        !row.contractor_name?.toLowerCase().includes(searchFilter.toLowerCase()) &&
        !(row.task_name || '').toLowerCase().includes(searchFilter.toLowerCase())
      ) {
        return false;
      }
      if (taskFilter && (row.task_name !== taskFilter && row.phase_name !== taskFilter)) return false;
      if (contractorFilter && row.contractor_name !== contractorFilter) return false;
      return true;
    });
  }, [data.worked, searchFilter, taskFilter, contractorFilter]);

  const workedColumns = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{formatDate(row.work_date)}</p>
          <p className="text-xs text-ink-subtle">{row.site_name || 'General Site'}</p>
        </div>
      ),
    },
    {
      key: 'contractor',
      header: 'Contractor',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.contractor_name || 'Direct / General'}</p>
          {row.contractor_phone && <p className="text-xs text-ink-subtle">{row.contractor_phone}</p>}
        </div>
      ),
    },
    {
      key: 'phase',
      header: 'Task / Work Scope',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">
            {row.task_name ? `Task: ${row.task_name}` : (row.phase_name || 'General')}
          </p>
          {row.subcategory_name && <p className="text-xs text-ink-subtle">{row.subcategory_name}</p>}
        </div>
      ),
    },
    {
      key: 'crew',
      header: 'Labour Count',
      align: 'right',
      render: (row) => (
        <span className="font-semibold tabular-nums text-brand">
          {formatNumber(row.labour_count)} <span className="text-xs font-normal text-ink-subtle">workers</span>
        </span>
      ),
    },
    {
      key: 'hours',
      header: 'Hours',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">
          {row.working_hours ? `${row.working_hours} hrs` : '8 hrs'}
        </span>
      ),
    },
    {
      key: 'daily_cost',
      header: 'Daily Labour Cost',
      align: 'right',
      render: (row) => {
        const isCompanyLabour = row.subcategory_name?.includes('Company') || row.labour_type?.toLowerCase().includes('company') || row.worker_type === 'company_labour';
        return (
          <div className="text-right">
            <span className="font-semibold tabular-nums text-emerald-700">
              {formatCurrency(row.daily_cost || 0)}
            </span>
            {isCompanyLabour && (
              <p className="text-[10px] text-blue-700 font-medium">Company Labour (₹0 Cost)</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'description',
      header: 'Work Completed',
      render: (row) => (
        <p className="max-w-md truncate text-sm text-ink-muted" title={row.work_description}>
          {row.work_description || '—'}
        </p>
      ),
    },
    {
      key: 'verification',
      header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.verified_by_engineer ? (
            <Badge tone="positive">
              <CheckCircle2 className="mr-1 h-3 w-3 inline" />
              Verified
            </Badge>
          ) : (
            <Badge tone="neutral">Daily Update</Badge>
          )}
        </div>
      ),
    },
  ];

  const resetFilters = () => {
    setSearchFilter('');
    setTaskFilter('');
    setContractorFilter('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Cards: Assigned -> Worked -> Remaining */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Labour Assigned / Budget</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-ink">
              {loading ? '…' : formatNumber(data.summary?.budgetedDays || 0)}
            </span>
            <span className="text-xs text-ink-subtle">worker-days</span>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            Budget: {formatCurrency(data.summary?.budgetedCost || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Labour Worked / Actual</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <CalendarCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-amber-700">
              {loading ? '…' : formatNumber(data.summary?.workedDays || 0)}
            </span>
            <span className="text-xs text-ink-subtle">worker-days logged</span>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            Actual cost: {formatCurrency(data.summary?.workedCost || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Remaining Balance</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-emerald-700">
              {loading ? '…' : formatNumber(data.summary?.remainingDays || 0)}
            </span>
            <span className="text-xs text-ink-subtle">worker-days left</span>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            Remaining budget: {formatCurrency(data.summary?.remainingCost || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-canvas-subtle/50 p-5 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Task Planning</span>
              <Badge tone="positive">Manual Tasks</Badge>
            </div>
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">
              Total Labour Cost = Workers × Daily Wage × Task Working Days planned across manual project tasks.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={fetchTracking} className="mt-2 w-full">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recalculate Labour
          </Button>
        </div>
      </div>

      {/* Main Table Card with Switchable Views */}
      <Card>
        <CardHeader
          title={
            <div className="flex flex-wrap items-center gap-3">
              <span>Labour Tracking & Task Budget</span>
              <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('worked')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    viewMode === 'worked'
                      ? 'bg-white text-brand shadow-sm font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Daily Work Log ({data.worked.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('budget')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    viewMode === 'budget'
                      ? 'bg-white text-brand shadow-sm font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Task-wise Labour Budget ({taskBudgetList.length})
                </button>
              </div>
            </div>
          }
          description={
            viewMode === 'worked'
              ? 'On-site worker deployment logged through contractor daily work updates and task worker logs.'
              : 'Labour budget allocations planned per manual project task: Workers × Daily Wage × Working Days.'
          }
          action={
            <Button
              size="sm"
              onClick={() => {
                setLogError(null);
                setLogForm({
                  record_date: new Date().toISOString().slice(0, 10),
                  site_id: siteFilter || propSiteId || (detail?.sites?.[0]?.id || ''),
                  task_id: '',
                  contractor_id: detail?.project?.contractor_id || '',
                  category: 'Mason',
                  worker_count: 5,
                  present_count: 5,
                  daily_rate: 650,
                  payment_status: 'verified',
                });
                setIsLogOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Log Attendance
            </Button>
          }
        />

        {/* Filters if in worked view */}
        {viewMode === 'worked' && (
          <div className="border-b border-line bg-canvas-subtle/40 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-56">
                <TextField
                  placeholder="Search work, task or contractor…"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  size="sm"
                />
              </div>

              {availableTasks.length > 0 && (
                <div className="w-48">
                  <Select
                    value={taskFilter}
                    onChange={(e) => setTaskFilter(e.target.value)}
                    options={[
                      { value: '', label: 'All Tasks' },
                      ...availableTasks.map((task) => ({ value: task, label: task })),
                    ]}
                  />
                </div>
              )}

              {availableContractors.length > 0 && (
                <div className="w-48">
                  <Select
                    value={contractorFilter}
                    onChange={(e) => setContractorFilter(e.target.value)}
                    options={[
                      { value: '', label: 'All Contractors' },
                      ...availableContractors.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span>Date:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                />
                <span>to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                />
              </div>

              {(searchFilter || taskFilter || contractorFilter || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : viewMode === 'worked' ? (
          <DataTable
            columns={workedColumns}
            rows={filteredWorked}
            empty={{
              icon: HardHat,
              title: 'No labour updates logged yet',
              description: 'When contractors submit daily work updates with worker counts, attendance records appear here.',
            }}
          />
        ) : (
          <div className="divide-y divide-line">
            {taskBudgetList.length === 0 ? (
              <div className="p-12 text-center text-ink-muted">
                <HardHat className="mx-auto h-10 w-10 text-ink-subtle mb-3" />
                <p className="font-medium text-ink">No Task-wise Labour Budget Defined</p>
                <p className="text-xs text-ink-subtle mt-1">Configure tasks and add labour allocations in the Tasks & Planning tab.</p>
              </div>
            ) : (
              taskBudgetList.map((task, idx) => (
                <div key={task.task_id || task.id || idx} className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone="brand">Task {idx + 1}</Badge>
                        <h4 className="font-semibold text-ink">{task.task_name || task.name}</h4>
                        {task.status && (
                          <Badge tone={task.status === 'completed' ? 'positive' : task.status === 'delayed' ? 'danger' : 'neutral'}>
                            {task.status}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-ink-subtle">
                        Site: <span className="font-medium text-ink">{task.site_name || 'General Site'}</span> ·{' '}
                        Duration: <span className="font-medium text-ink">{task.duration_days || task.calculated_working_days || 1} days</span> ·{' '}
                        Allocated Trades: <span className="font-semibold text-brand">{(task.labourItems || []).length} roles</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 text-right">
                      <div className="rounded-lg border border-line bg-canvas/60 px-3 py-1.5 text-right">
                        <p className="text-[10px] text-ink-subtle">Planned Labour Cost</p>
                        <p className="font-display text-sm font-bold text-ink">{formatCurrency(task.totalBudgetedCost || 0)}</p>
                        <p className="text-[10px] text-ink-muted">{formatNumber(task.totalBudgetedDays || 0)} planned days</p>
                      </div>
                      <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-1.5 text-right">
                        <p className="text-[10px] text-amber-800 font-medium">Actual Labour Cost</p>
                        <p className="font-display text-sm font-bold text-amber-700">{formatCurrency(task.workedCost || 0)}</p>
                        <p className="text-[10px] text-amber-700">{formatNumber(task.workedDays || 0)} days logged</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-1.5 text-right">
                        <p className="text-[10px] text-emerald-800 font-medium">Remaining Budget</p>
                        <p className="font-display text-sm font-bold text-emerald-700">
                          {formatCurrency(task.remainingCost != null ? task.remainingCost : Math.max(0, (task.totalBudgetedCost || 0) - (task.workedCost || 0)))}
                        </p>
                        <p className="text-[10px] text-emerald-700">{formatNumber(task.remainingDays || 0)} days left</p>
                      </div>
                    </div>
                  </div>

                  {task.labourItems && task.labourItems.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-line bg-canvas-subtle/30">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-line bg-canvas-subtle text-ink-muted">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Labour Role / Trade</th>
                            <th className="py-2.5 px-4 font-medium text-right">No. of Workers</th>
                            <th className="py-2.5 px-4 font-medium text-right">Daily Wage</th>
                            <th className="py-2.5 px-4 font-medium text-right">Working Days</th>
                            <th className="py-2.5 px-4 font-medium text-right">Total Budget</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line bg-white">
                          {task.labourItems.map((item, lIdx) => (
                            <tr key={lIdx}>
                              <td className="py-2.5 px-4 font-medium text-ink">
                                {item.labour_type || item.skill_trade || item.labour_name || 'General Labour'}
                                {item.labour_name && item.labour_name !== item.labour_type && (
                                  <span className="text-ink-subtle font-normal ml-1.5">({item.labour_name})</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-ink">{formatNumber(item.workers_count || item.worker_count || 1)}</td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-ink-muted">{formatCurrency(item.daily_wage || 0)}</td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-ink-muted">{item.working_days || 1} days</td>
                              <td className="py-2.5 px-4 text-right font-medium tabular-nums text-ink">{formatCurrency(item.total_cost || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs italic text-ink-subtle">No labour roles allocated for this task.</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Log Labour Attendance Modal */}
      <Modal
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        title="Log Labour Attendance"
        description="Record on-site workforce deployment and daily attendance."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsLogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogSubmit} disabled={logSubmitting}>
              {logSubmitting ? 'Recording…' : 'Save Attendance'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleLogSubmit} className="space-y-4">
          {logError && <Alert tone="error">{logError}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Work Date *"
              type="date"
              value={logForm.record_date}
              onChange={(e) => setLogForm({ ...logForm, record_date: e.target.value })}
              required
            />

            <Select
              label="Trade / Category *"
              value={logForm.category}
              onChange={(e) => setLogForm({ ...logForm, category: e.target.value })}
              options={[
                { value: 'Mason', label: 'Mason / Bricklayer' },
                { value: 'Carpenter', label: 'Shuttering Carpenter' },
                { value: 'Bar Bender', label: 'Bar Bender / Steel Fixer' },
                { value: 'Electrician', label: 'Electrician' },
                { value: 'Plumber', label: 'Plumber & Pipefitter' },
                { value: 'Painter', label: 'Painter' },
                { value: 'Tiler', label: 'Tiler / Flooring' },
                { value: 'Welder', label: 'Welder / Fabricator' },
                { value: 'Helper', label: 'Helper / Unskilled Labour' },
                { value: 'Supervisor', label: 'Site Foreman / Supervisor' },
                { value: 'General Labour', label: 'General Labour' },
              ]}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Site"
              value={logForm.site_id}
              onChange={(e) => setLogForm({ ...logForm, site_id: e.target.value })}
              options={[
                { value: '', label: 'General / Main Site' },
                ...(detail?.sites || []).map((s) => ({
                  value: s.id,
                  label: s.name,
                })),
              ]}
            />

            <Select
              label="Contractor"
              value={logForm.contractor_id}
              onChange={(e) => setLogForm({ ...logForm, contractor_id: e.target.value })}
              options={[
                { value: '', label: 'Direct / Company Crew' },
                ...(lookups?.contractors || []).map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />

            <Select
              label="Task (Optional)"
              value={logForm.task_id}
              onChange={(e) => setLogForm({ ...logForm, task_id: e.target.value })}
              options={[
                { value: '', label: 'General Project' },
                ...(detail?.tasks || data?.tasks || taskBudgetList || []).map((t) => ({
                  value: t.id || t.task_id,
                  label: t.name || t.task_name,
                })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              label="Total Crew Size"
              type="number"
              min="1"
              value={logForm.worker_count}
              onChange={(e) => setLogForm({ ...logForm, worker_count: e.target.value, present_count: e.target.value })}
              required
            />

            <TextField
              label="Present Count"
              type="number"
              min="0"
              value={logForm.present_count}
              onChange={(e) => setLogForm({ ...logForm, present_count: e.target.value })}
              required
            />

            <TextField
              label="Daily Rate (₹)"
              type="number"
              min="0"
              value={logForm.daily_rate}
              onChange={(e) => setLogForm({ ...logForm, daily_rate: e.target.value })}
            />
          </div>

          <Select
            label="Verification / Payment Status"
            value={logForm.payment_status}
            onChange={(e) => setLogForm({ ...logForm, payment_status: e.target.value })}
            options={[
              { value: 'verified', label: 'Verified & Approved' },
              { value: 'pending', label: 'Pending Verification' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
        </form>
      </Modal>
    </div>
  );
}
