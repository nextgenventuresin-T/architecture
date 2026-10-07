import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import { formatDate, formatCurrency } from '../../utils/format';

const TASK_TONE = {
  completed: 'positive',
  'in-progress': 'brand',
  pending: 'neutral',
  delayed: 'danger',
};
const TASK_LABEL = {
  completed: 'Completed',
  'in-progress': 'In progress',
  pending: 'Pending',
  delayed: 'Delayed',
};

/** Planned vs actual, phase breakdown and the task list behind the number. */
export default function ProgressTab({ detail }) {
  const { progress, tasks = [], project = {} } = detail;
  const behind = (progress?.variance || 0) < 0;

  const budgetSummary = detail.budgetSummary || {
    plannedBudget: tasks.reduce((sum, t) => sum + Number(t.totalBudget || t.total_budget || 0), 0),
    usedBudget: tasks.reduce((sum, t) => sum + Number(t.actualCost || 0), 0),
    remainingBudget: 0,
    utilizationPercentage: 0,
    categories: [],
    taskBreakdown: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      siteName: t.siteName || t.site_name,
      status: t.status,
      plannedBudget: Number(t.totalBudget || t.total_budget || 0),
      actualCost: Number(t.actualCost || 0),
      variance: Number(t.variance || 0),
    })),
  };

  const phases = [...new Set(tasks.map((t) => t.phase).filter(Boolean))].map((phase) => {
    const inPhase = tasks.filter((t) => t.phase === phase);
    const weight = inPhase.reduce((sum, t) => sum + (t.weight || 1), 0);
    const done = inPhase.filter((t) => t.status === 'completed').reduce((sum, t) => sum + (t.weight || 1), 0);
    return { phase, percent: weight ? Math.round((done / weight) * 100) : 0, count: inPhase.length };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Overall completion" value={`${progress?.overall || 0}%`} />
        <Stat label="Planned by today" value={`${progress?.planned || 0}%`} />
        <Stat
          label="Variance"
          value={`${(progress?.variance || 0) > 0 ? '+' : ''}${progress?.variance || 0}%`}
          tone={behind ? 'danger' : 'positive'}
          hint={behind ? 'Behind schedule' : 'On or ahead of plan'}
        />
        <Stat label="Current phase" value={project.currentPhase ?? '—'} />
      </div>

      <Card>
        <CardHeader title="Planned vs actual" description="Planned is the share of task weight due by today." />
        <CardBody className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-ink-muted">Actual completion</span>
              <span className="font-medium tabular-nums text-ink">{progress?.overall || 0}%</span>
            </div>
            <ProgressBar value={progress?.overall || 0} status={project.status} />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-ink-muted">Planned completion</span>
              <span className="font-medium tabular-nums text-ink">{progress?.planned || 0}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-brand-100">
              <div className="h-full rounded-full bg-ink-subtle" style={{ width: `${progress?.planned || 0}%` }} />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 8. BUDGET VS ACTUAL USAGE */}
      <Card>
        <CardHeader
          title="Budget vs Actual Usage"
          description="Admin-planned financial baseline versus real-time actual incurred costs across tasks, materials, labour and tools."
        />
        <CardBody className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
              <p className="text-xs text-ink-muted">Planned Budget</p>
              <p className="mt-1 text-xl font-bold text-ink">
                {formatCurrency(budgetSummary.plannedBudget || 0)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-subtle">Admin planned baseline</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
              <p className="text-xs text-ink-muted">Used / Actual</p>
              <p className="mt-1 text-xl font-bold text-brand-700">
                {formatCurrency(budgetSummary.usedBudget || 0)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-subtle">Total spent so far</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
              <p className="text-xs text-ink-muted">Remaining Budget</p>
              <p className={`mt-1 text-xl font-bold ${(budgetSummary.remainingBudget || 0) < 0 ? 'text-danger' : 'text-emerald-700'}`}>
                {formatCurrency(budgetSummary.remainingBudget || 0)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-subtle">
                {(budgetSummary.remainingBudget || 0) < 0 ? 'Over budget' : 'Remaining available'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-muted">Utilization</p>
                <span className="text-xs font-semibold text-ink">{budgetSummary.utilizationPercentage || 0}%</span>
              </div>
              <p className="mt-1 text-xl font-bold text-ink">{budgetSummary.utilizationPercentage || 0}%</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full ${(budgetSummary.utilizationPercentage || 0) > 100 ? 'bg-danger' : 'bg-brand-600'}`}
                  style={{ width: `${Math.min(100, budgetSummary.utilizationPercentage || 0)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Budget Category Breakdown */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-3">
              Budget Category Breakdown
            </h4>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas text-ink-muted uppercase font-medium">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Planned</th>
                    <th className="py-2.5 px-3 text-right">Used / Incurred</th>
                    <th className="py-2.5 px-3 text-right">Remaining</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(budgetSummary.categories || []).map((cat, idx) => {
                    const isTotal = cat.name === 'Total';
                    const isOver = cat.remaining < 0;
                    return (
                      <tr
                        key={cat.name}
                        className={`hover:bg-canvas/40 ${isTotal ? 'bg-canvas/80 font-bold' : ''}`}
                      >
                        <td className="py-2.5 px-3 text-ink-muted">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-ink">{cat.name}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                          {formatCurrency(cat.planned)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium tabular-nums text-brand-700">
                          {formatCurrency(cat.used)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold tabular-nums ${isOver ? 'text-danger' : 'text-emerald-700'}`}>
                          {formatCurrency(cat.remaining)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isOver ? (
                            <Badge tone="danger">Over Budget</Badge>
                          ) : (
                            <Badge tone="positive">Within Budget</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Task-Wise Budget Breakdown Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-3">
              Task-Wise Budget Breakdown ({budgetSummary.taskBreakdown?.length || 0} Tasks)
            </h4>
            {(!budgetSummary.taskBreakdown || budgetSummary.taskBreakdown.length === 0) ? (
              <p className="text-xs text-ink-muted italic">No tasks created yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas text-ink-muted uppercase font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Task Name</th>
                      {budgetSummary.taskBreakdown.some((t) => t.siteName) && (
                        <th className="py-2.5 px-3">Site</th>
                      )}
                      <th className="py-2.5 px-3 text-right">Planned Budget</th>
                      <th className="py-2.5 px-3 text-right">Actual Cost</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {budgetSummary.taskBreakdown.map((t) => {
                      const isFavorable = (t.variance || 0) >= 0;
                      return (
                        <tr key={t.id} className="hover:bg-canvas/40">
                          <td className="py-2.5 px-3 font-semibold text-ink">{t.name}</td>
                          {budgetSummary.taskBreakdown.some((item) => item.siteName) && (
                            <td className="py-2.5 px-3 text-ink-muted">{t.siteName || '—'}</td>
                          )}
                          <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                            {formatCurrency(t.plannedBudget)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium tabular-nums text-brand-700">
                            {formatCurrency(t.actualCost)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge tone={TASK_TONE[t.status] || 'neutral'}>
                              {TASK_LABEL[t.status] || t.status}
                            </Badge>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-semibold tabular-nums ${isFavorable ? 'text-emerald-700' : 'text-danger'}`}>
                            {isFavorable ? `+${formatCurrency(t.variance)}` : formatCurrency(t.variance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Tasks"
            description={`${progress.completed} completed · ${progress.inProgress} in progress · ${progress.pending} pending · ${progress.delayed} delayed`}
          />
          <ul className="divide-y divide-line">
            {tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{task.name}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {task.phase} · planned {formatDate(task.planned_start)} – {formatDate(task.planned_end)}
                  </p>
                </div>
                <Badge tone={TASK_TONE[task.status] ?? 'neutral'}>{TASK_LABEL[task.status] ?? task.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Progress by phase" />
          <CardBody className="space-y-4">
            {phases.map(({ phase, percent, count }) => (
              <div key={phase}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">{phase}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{percent}%</span>
                </div>
                <ProgressBar value={percent} status={percent === 100 ? 'completed' : 'on-track'} />
                <p className="mt-1 text-xs text-ink-subtle">{count} task{count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }) {
  const colour = tone === 'danger' ? 'text-danger' : tone === 'positive' ? 'text-emerald-700' : 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${colour}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}
