import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Package,
  Wrench,
  Users,
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Truck,
  ListTree,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import { formatCurrency, formatDate } from '../../utils/format';

const STATUS = {
  'on-track': { tone: 'positive', label: 'On Track' },
  attention: { tone: 'warning', label: 'Needs Attention' },
  delayed: { tone: 'danger', label: 'Delayed' },
  completed: { tone: 'brand', label: 'Completed' },
};

const CATEGORY_ROWS = [
  { key: 'materials', label: 'Materials', icon: Package, color: 'text-brand-600' },
  { key: 'tools', label: 'Machines & Tools', icon: Wrench, color: 'text-amber-600' },
  { key: 'labour', label: 'Labour', icon: Users, color: 'text-emerald-600' },
  { key: 'misc', label: 'Miscellaneous', icon: DollarSign, color: 'text-indigo-600' },
];

const PROC_STATUS_TONE = {
  received: 'positive',
  approved: 'brand',
  ordered: 'brand',
  partially_received: 'warning',
  pending_approval: 'warning',
  requested: 'neutral',
  draft: 'neutral',
  rejected: 'danger',
  cancelled: 'neutral',
};

/** Remaining can go negative once a scope overruns; show it in red instead of hiding it. */
function Remaining({ value, className = '' }) {
  const n = Number(value || 0);
  return (
    <span className={`tabular-nums font-semibold ${n < 0 ? 'text-rose-700' : 'text-emerald-700'} ${className}`}>
      {n < 0 ? `−${formatCurrency(Math.abs(n))}` : formatCurrency(n)}
    </span>
  );
}

function UtilBadge({ util }) {
  if (!util) return null;
  if (util.total.pendingExcess > 0) {
    return <Badge tone="warning">+{formatCurrency(util.total.pendingExcess)} pending approval</Badge>;
  }
  if (util.total.isExceeded) return <Badge tone="danger">Over budget</Badge>;
  return <Badge tone="positive">Within budget</Badge>;
}

/** Budget vs actual per category for one scope (a subtask or the direct bucket). */
function CategoryTable({ util }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 text-right font-medium">Planned</th>
            <th className="px-3 py-2 text-right font-medium">Actual</th>
            <th className="px-3 py-2 text-right font-medium">Remaining</th>
            <th className="px-3 py-2 text-right font-medium">Used</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {CATEGORY_ROWS.map(({ key, label, icon: Icon, color }) => {
            const c = util[key];
            return (
              <tr key={key} className={c.isExceeded ? 'bg-rose-50/40' : undefined}>
                <td className="px-3 py-2 font-medium text-ink">
                  <span className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />
                    {label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCurrency(c.budgeted)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-700">{formatCurrency(c.actual)}</td>
                <td className="px-3 py-2 text-right">
                  <Remaining value={c.budgeted - c.actual} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{c.utilization}%</td>
              </tr>
            );
          })}
          <tr className="bg-canvas font-bold">
            <td className="px-3 py-2 text-ink">Total</td>
            <td className="px-3 py-2 text-right tabular-nums text-ink">
              {formatCurrency(util.total.effectiveBudget)}
              {util.total.approvedAdditional > 0 && (
                <span className="block text-[10px] font-normal text-emerald-700">
                  incl. +{formatCurrency(util.total.approvedAdditional)} approved
                </span>
              )}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-brand-800">{formatCurrency(util.total.actual)}</td>
            <td className="px-3 py-2 text-right">
              <Remaining value={util.total.effectiveBudget - util.total.actual} />
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-ink">{util.total.utilization}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Section({ icon: Icon, title, count, children }) {
  return (
    <div className="space-y-1.5">
      <h6 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
        {count !== undefined && <span className="font-normal normal-case">({count})</span>}
      </h6>
      {children}
    </div>
  );
}

const Empty = ({ children }) => <p className="text-xs italic text-ink-muted">{children}</p>;

/** The subtask's own plan, linked procurement and people. */
function SubtaskResources({ st }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section icon={Package} title="Materials" count={st.materials.length}>
        {st.materials.length === 0 ? (
          <Empty>No materials planned.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Material</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Planned</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Procured</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Used</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Left</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {st.materials.map((m) => (
                  <tr key={m.id}>
                    <td className="px-2.5 py-1.5 font-medium text-ink">
                      {m.materialName}
                      {m.pendingApprovals > 0 && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
                          {m.pendingApprovals} pending
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {m.revisedApproved} {m.unit}
                      {m.approvedAdditional > 0 && (
                        <span className="block text-[10px] text-emerald-700">+{m.approvedAdditional} approved</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{m.procured}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-brand-700">{m.used}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-emerald-700">{m.remaining}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{formatCurrency(m.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section icon={Wrench} title="Machines & Tools" count={st.tools.length}>
        {st.tools.length === 0 ? (
          <Empty>No machines or tools planned.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-xs">
            {st.tools.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
                <span className="font-medium text-ink">
                  {t.toolName} <span className="font-normal text-ink-muted">· {t.rentalType}</span>
                </span>
                <span className="tabular-nums text-ink-muted">
                  {t.quantity} × {formatCurrency(t.cost)}
                  {String(t.rentalType).toLowerCase() !== 'purchase' ? ` × ${t.workingDays}d` : ''} ={' '}
                  <strong className="text-ink">{formatCurrency(t.totalCost)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={Users} title="Labour plan & assigned workers" count={st.labour.length}>
        {st.labour.length === 0 && st.assignedWorkers.length === 0 ? (
          <Empty>No labour planned or assigned.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-xs">
            {st.labour.map((l) => (
              <li key={`p-${l.id}`} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
                <span className="font-medium text-ink">
                  {l.labourName || l.labourType}
                  {l.skillTrade && <span className="font-normal text-ink-muted"> · {l.skillTrade}</span>}
                </span>
                <span className="tabular-nums text-ink-muted">
                  {l.workerCount} × {formatCurrency(l.dailyWage)} × {l.workingDays}d ={' '}
                  <strong className="text-ink">{formatCurrency(l.totalCost)}</strong>
                </span>
              </li>
            ))}
            {st.assignedWorkers.map((w) => (
              <li key={`a-${w.id}`} className="flex flex-wrap items-center justify-between gap-2 bg-canvas/40 px-2.5 py-1.5">
                <span className="text-ink">
                  <span className="mr-1 rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-700">Assigned</span>
                  {w.workerName}
                  {w.trade && <span className="text-ink-muted"> · {w.trade}</span>}
                  {w.status === 'pending_approval' && <span className="ml-1 text-[10px] font-semibold text-amber-700">(pending approval)</span>}
                </span>
                <span className="tabular-nums text-ink-muted">
                  {w.expectedDays}d · {formatCurrency(w.plannedCost)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={DollarSign} title="Miscellaneous" count={st.misc.length}>
        {st.misc.length === 0 ? (
          <Empty>No miscellaneous items planned.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-xs">
            {st.misc.map((mc) => (
              <li key={mc.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                <span className="text-ink">{mc.description}</span>
                <strong className="tabular-nums text-ink">{formatCurrency(mc.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="lg:col-span-2">
        <Section icon={Truck} title="Linked procurement requests" count={st.procurements.length}>
          {st.procurements.length === 0 ? (
            <Empty>No procurement raised for this subtask yet.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">Request</th>
                    <th className="px-2.5 py-1.5 font-medium">Item</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Qty</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Value</th>
                    <th className="px-2.5 py-1.5 font-medium">Vehicle</th>
                    <th className="px-2.5 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {st.procurements.map((p) => (
                    <tr key={p.id}>
                      <td className="px-2.5 py-1.5 font-mono text-ink">{p.requestNumber}</td>
                      <td className="px-2.5 py-1.5 text-ink">
                        {p.itemName}
                        {p.isExcess && <span className="ml-1 text-[10px] font-semibold text-amber-700">excess</span>}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{p.quantity} {p.unit}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{formatCurrency(p.amount)}</td>
                      <td className="px-2.5 py-1.5 text-ink-muted">{p.vehicleNumber || '—'}</td>
                      <td className="px-2.5 py-1.5">
                        <Badge tone={PROC_STATUS_TONE[p.status] || 'neutral'}>{String(p.status).replace(/_/g, ' ')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function ProgressEditor({ st, onSave }) {
  const [value, setValue] = useState(st.progress);
  const [saving, setSaving] = useState(false);
  const changed = Number(value) !== Number(st.progress);
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-ink-muted" htmlFor={`st-progress-${st.id}`}>Update progress</label>
      <input
        id={`st-progress-${st.id}`}
        type="number"
        min="0"
        max="100"
        value={value}
        onChange={(e) => setValue(Math.min(100, Math.max(0, Number(e.target.value))))}
        className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
      />
      <Button
        size="xs"
        variant="secondary"
        disabled={!changed || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(st, Number(value));
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

/**
 * Task Planning -> View Details -> Subtasks.
 * One expandable card per subtask: its own plan (materials, machines, labour,
 * misc), linked procurement and workers, progress, and planned / actual /
 * remaining budget. The header reconciles subtasks + direct items to the main
 * task total, so nothing is ever counted twice.
 */
export default function SubtasksPanel({
  task,
  isAdmin = false,
  onAdd,
  onEdit,
  onDelete,
  onProgressSave,
  deletingId = null,
}) {
  const subtasks = task?.subtasks || [];
  const direct = task?.directScope;
  const c = task?.consolidation;
  const [openIds, setOpenIds] = useState(() => new Set(subtasks.length === 1 ? [subtasks[0].id] : []));
  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-4">
      {/* Consolidation: main task = subtasks + direct items */}
      {c && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
                <ListTree className="h-4 w-4 text-brand-700" aria-hidden="true" />
                Main Task Consolidation
              </h4>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Every cost is booked to exactly one subtask or to the main task directly, then summed once into the main task, site and project.
              </p>
            </div>
            {c.reconciled ? (
              <Badge tone="positive"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Totals reconcile</Badge>
            ) : (
              <Badge tone="danger"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Totals do not reconcile</Badge>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-white p-2.5">
              <p className="text-[10px] font-medium uppercase text-ink-subtle">Subtasks ({c.subtaskCount})</p>
              <p className="mt-0.5 font-bold tabular-nums text-ink">{formatCurrency(c.subtasksPlanned)}</p>
              <p className="tabular-nums text-ink-muted">Actual {formatCurrency(c.subtasksActual)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white p-2.5">
              <p className="text-[10px] font-medium uppercase text-ink-subtle">Main task direct items</p>
              <p className="mt-0.5 font-bold tabular-nums text-ink">{formatCurrency(c.directPlanned)}</p>
              <p className="tabular-nums text-ink-muted">Actual {formatCurrency(c.directActual)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white p-2.5">
              <p className="text-[10px] font-medium uppercase text-ink-subtle">Main task total</p>
              <p className="mt-0.5 font-bold tabular-nums text-ink">{formatCurrency(c.mainTaskPlanned)}</p>
              <p className="tabular-nums text-brand-700">Actual {formatCurrency(c.mainTaskActual)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white p-2.5">
              <p className="text-[10px] font-medium uppercase text-ink-subtle">Remaining</p>
              <p className="mt-0.5 font-bold"><Remaining value={c.mainTaskRemaining} /></p>
              <p className="text-ink-muted">{c.completedSubtasks}/{c.subtaskCount} subtasks complete</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          Subtasks ({subtasks.length})
        </h4>
        {isAdmin && onAdd && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Subtask
          </Button>
        )}
      </div>

      {subtasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas/30 p-6 text-center">
          <ListTree className="mx-auto mb-1 h-8 w-8 text-ink-subtle" aria-hidden="true" />
          <p className="text-xs font-medium text-ink">No subtasks yet.</p>
          <p className="mt-0.5 text-[11px] text-ink-subtle">
            {isAdmin
              ? 'Break this task into subtasks, each with its own materials, machines, labour, misc budget and progress.'
              : 'Admin has not split this task into subtasks.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {subtasks.map((st) => {
            const open = openIds.has(st.id);
            const meta = STATUS[st.status] || { tone: 'neutral', label: st.status };
            return (
              <div key={st.id} className={`overflow-hidden rounded-xl border bg-white ${st.budgetUtilization?.total?.isExceeded ? 'border-rose-200' : 'border-line'}`}>
                <button
                  type="button"
                  onClick={() => toggle(st.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-canvas/40"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{st.name}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </span>
                      <span className="block text-[11px] text-ink-muted">
                        {formatDate(st.startDate)} → {formatDate(st.endDate)}
                        {' · '}{st.counts.dailyUpdates} updates · {st.counts.workerLogs} worker logs · {st.procurements.length} requests
                      </span>
                    </span>
                  </span>
                  <span className="w-36">
                    <ProgressBar value={st.progress} status={st.status} showLabel />
                  </span>
                  <span className="grid grid-cols-3 gap-4 text-right text-xs">
                    <span>
                      <span className="block text-[10px] uppercase text-ink-subtle">Planned</span>
                      <span className="font-semibold tabular-nums text-ink">{formatCurrency(st.plannedBudget)}</span>
                    </span>
                    <span>
                      <span className="block text-[10px] uppercase text-ink-subtle">Actual</span>
                      <span className="font-semibold tabular-nums text-brand-700">{formatCurrency(st.actualCost)}</span>
                    </span>
                    <span>
                      <span className="block text-[10px] uppercase text-ink-subtle">Remaining</span>
                      <Remaining value={st.remainingBudget} />
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="space-y-4 border-t border-line bg-canvas/20 p-4">
                    {st.description && <p className="whitespace-pre-wrap text-xs text-ink">{st.description}</p>}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <UtilBadge util={st.budgetUtilization} />
                      <div className="flex flex-wrap items-center gap-2">
                        {onProgressSave && <ProgressEditor st={st} onSave={onProgressSave} />}
                        {isAdmin && onEdit && (
                          <Button size="xs" variant="secondary" onClick={() => onEdit(st)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit plan
                          </Button>
                        )}
                        {isAdmin && onDelete && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => onDelete(st)}
                            disabled={deletingId === st.id}
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>

                    <CategoryTable util={st.budgetUtilization} />
                    <SubtaskResources st={st} />
                  </div>
                )}
              </div>
            );
          })}

          {direct && (direct.plannedBudget > 0 || direct.actualCost > 0) && (
            <div className="rounded-xl border border-dashed border-line bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="text-sm font-semibold text-ink">Main task (direct items)</h5>
                  <p className="text-[11px] text-ink-muted">
                    Planned on the main task itself or booked without a subtask. Shown in the Materials / Machines / Labour tabs.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-right text-xs">
                  <span>
                    <span className="block text-[10px] uppercase text-ink-subtle">Planned</span>
                    <span className="font-semibold tabular-nums text-ink">{formatCurrency(direct.plannedBudget)}</span>
                  </span>
                  <span>
                    <span className="block text-[10px] uppercase text-ink-subtle">Actual</span>
                    <span className="font-semibold tabular-nums text-brand-700">{formatCurrency(direct.actualCost)}</span>
                  </span>
                  <span>
                    <span className="block text-[10px] uppercase text-ink-subtle">Remaining</span>
                    <Remaining value={direct.remainingBudget} />
                  </span>
                </div>
              </div>
              <CategoryTable util={direct.budgetUtilization} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact subtask list for the Overview tab. */
export function SubtaskSummaryTable({ subtasks = [], onOpen }) {
  if (!subtasks.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-xs">
        <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Subtask</th>
            <th className="w-40 px-3 py-2 font-medium">Progress</th>
            <th className="px-3 py-2 text-right font-medium">Planned</th>
            <th className="px-3 py-2 text-right font-medium">Actual</th>
            <th className="px-3 py-2 text-right font-medium">Remaining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {subtasks.map((st) => (
            <tr key={st.id} className="hover:bg-canvas/40">
              <td className="px-3 py-2 font-medium text-ink">
                {onOpen ? (
                  <button type="button" onClick={() => onOpen(st)} className="text-left text-brand-700 hover:underline">
                    {st.name}
                  </button>
                ) : st.name}
              </td>
              <td className="px-3 py-2"><ProgressBar value={st.progress} status={st.status} showLabel /></td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(st.plannedBudget)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-brand-700">{formatCurrency(st.actualCost)}</td>
              <td className="px-3 py-2 text-right"><Remaining value={st.remainingBudget} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
