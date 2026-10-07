/**
 * Interface 13 — Reports & Analytics charts.
 * Pure SVG/CSS, no external charting library required. Every chart here
 * renders only the data the dashboard API already returns in `kpis`; no
 * separate call is made and no data is invented.
 */

import { formatCompactCurrency, formatNumber } from '../../utils/format';

// ─── palette anchored to the project's brand tokens ──────────────────────────
const COLORS = {
  brand:   '#6B3FD4',
  emerald: '#059669',
  amber:   '#B45309',
  slate:   '#475569',
  danger:  '#B32424',
  teal:    '#0D9488',
  indigo:  '#4338CA',
  rose:    '#BE185D',
};

// ─── tiny shared helpers ──────────────────────────────────────────────────────

/** Horizontal bar, no axes, good for small spaces. */
function HBar({ label, value, max, color, format }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="group flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-ink-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-16 text-right text-xs tabular-nums text-ink">{format ? format(value) : formatNumber(value)}</span>
    </div>
  );
}

/** Donut slice in SVG using stroke-dasharray/dashoffset trick. */
function DonutChart({ segments, size = 120, stroke = 22 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E6E2F2" strokeWidth={stroke} />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="12" fill="#8B87A0">—</text>
      </svg>
    );
  }

  let offset = 0;
  const slices = segments.filter((s) => s.value > 0).map((seg) => {
    const pct = seg.value / total;
    const dash = pct * circ;
    const slice = { ...seg, dash, offset };
    offset += dash;
    return slice;
  });

  // SVG strokes start at 3 o'clock; rotate -90 to start at 12
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
      aria-hidden="true"
    >
      {/* track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E6E2F2" strokeWidth={stroke} />
      {slices.map((sl, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={sl.color}
          strokeWidth={stroke}
          strokeDasharray={`${sl.dash} ${circ - sl.dash}`}
          strokeDashoffset={-sl.offset}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}

/** Legend pill row. */
function Legend({ segments }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-2">
      {segments.filter((s) => s.value > 0).map((seg) => (
        <div key={seg.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
          <span className="text-xs text-ink-muted">{seg.label}</span>
          <span className="text-xs font-medium tabular-nums text-ink">{formatNumber(seg.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</p>
      {children}
    </div>
  );
}

// ─── 1. Project status distribution ──────────────────────────────────────────

export function ProjectStatusChart({ kpis }) {
  const { totalProjects, activeProjects, completedProjects } = kpis;
  if (!totalProjects) return null;

  const delayed   = Number(kpis.delayedProjects ?? 0);  // not in current kpis — ok to show 0
  const onHold    = Number(kpis.onHoldProjects ?? 0);
  const active    = Number(activeProjects ?? 0) - delayed - onHold;
  const completed = Number(completedProjects ?? 0);

  const segments = [
    { label: 'Active',    value: Math.max(0, active),    color: COLORS.brand   },
    { label: 'Completed', value: completed,               color: COLORS.emerald },
    { label: 'Delayed',   value: delayed,                 color: COLORS.danger  },
    { label: 'On hold',   value: onHold,                  color: COLORS.amber   },
  ];

  return (
    <ChartCard title="Project status">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <DonutChart segments={segments} size={100} stroke={18} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums text-ink">{formatNumber(totalProjects)}</span>
            <span className="text-[0.6rem] text-ink-subtle">total</span>
          </div>
        </div>
        <Legend segments={segments} />
      </div>
    </ChartCard>
  );
}

// ─── 2. Expense / Finance summary ────────────────────────────────────────────

export function FinanceSummaryChart({ kpis }) {
  const { projectExpenses, contractorPayments, outstandingPayments, remainingBudget } = kpis;
  if (projectExpenses == null && contractorPayments == null) return null;

  const bars = [
    { label: 'Total expenses',      value: Number(projectExpenses ?? 0),      color: COLORS.brand   },
    { label: 'Contractor payments', value: Number(contractorPayments ?? 0),    color: COLORS.amber   },
    { label: 'Outstanding',         value: Number(outstandingPayments ?? 0),   color: COLORS.danger  },
    { label: 'Remaining budget',    value: Number(remainingBudget ?? 0),       color: COLORS.emerald },
  ].filter((b) => b.value > 0);

  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.value));

  return (
    <ChartCard title="Finance overview">
      <div className="space-y-2.5">
        {bars.map((bar) => (
          <HBar key={bar.label} {...bar} max={max} format={formatCompactCurrency} />
        ))}
      </div>
    </ChartCard>
  );
}

// ─── 3. Procurement status ───────────────────────────────────────────────────

export function ProcurementChart({ kpis }) {
  const { procurementRequests, pendingProcurement } = kpis;
  if (procurementRequests == null) return null;

  const total   = Number(procurementRequests ?? 0);
  const pending = Number(pendingProcurement ?? 0);
  const done    = Math.max(0, total - pending);

  const segments = [
    { label: 'Pending / awaiting approval', value: pending, color: COLORS.amber  },
    { label: 'Approved / fulfilled',        value: done,    color: COLORS.emerald },
  ];

  return (
    <ChartCard title="Procurement status">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <DonutChart segments={segments} size={100} stroke={18} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums text-ink">{formatNumber(total)}</span>
            <span className="text-[0.6rem] text-ink-subtle">requests</span>
          </div>
        </div>
        <Legend segments={segments} />
      </div>
    </ChartCard>
  );
}

// ─── 4. Workforce / Labour ───────────────────────────────────────────────────

export function WorkforceChart({ kpis }) {
  const { companyLabour, contractorLabour, totalWorkforce, attendanceToday } = kpis;
  if (totalWorkforce == null && companyLabour == null) return null;

  const company    = Number(companyLabour ?? 0);
  const contractor = Number(contractorLabour ?? 0);
  const present    = Number(attendanceToday?.present ?? 0);
  const absent     = Number(attendanceToday?.absent ?? 0);

  const segments = [
    { label: 'Company labour',    value: company,    color: COLORS.brand   },
    { label: 'Contractor labour', value: contractor, color: COLORS.amber   },
  ];

  const attSegments = [
    { label: 'Present',     value: present,                      color: COLORS.emerald },
    { label: 'Absent',      value: absent,                       color: COLORS.danger  },
    { label: 'Unrecorded',  value: Math.max(0, (company + contractor) - present - absent), color: COLORS.slate },
  ];

  return (
    <ChartCard title="Workforce & attendance">
      <div className="flex flex-wrap items-start gap-6">
        {/* labour type split */}
        {(company + contractor) > 0 && (
          <div>
            <p className="mb-1.5 text-[0.65rem] text-ink-subtle">Labour type</p>
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <DonutChart segments={segments} size={80} stroke={15} />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-semibold tabular-nums text-ink">{formatNumber(company + contractor)}</span>
                </div>
              </div>
              <Legend segments={segments} />
            </div>
          </div>
        )}

        {/* today's attendance */}
        {attendanceToday && (present + absent) > 0 && (
          <div>
            <p className="mb-1.5 text-[0.65rem] text-ink-subtle">Today's attendance</p>
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <DonutChart segments={attSegments} size={80} stroke={15} />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-semibold tabular-nums text-ink">{formatNumber(present)}</span>
                </div>
              </div>
              <Legend segments={attSegments} />
            </div>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

// ─── 5. Material stock health ─────────────────────────────────────────────────

export function MaterialStockChart({ kpis }) {
  const { lowStockMaterials, outOfStockMaterials, materialStockValue } = kpis;
  if (lowStockMaterials == null && outOfStockMaterials == null) return null;

  const low    = Number(lowStockMaterials ?? 0);
  const outOf  = Number(outOfStockMaterials ?? 0);
  const value  = Number(materialStockValue ?? 0);

  return (
    <ChartCard title="Material stock health">
      <div className="space-y-3">
        {/* stock-health indicator */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center rounded-lg bg-danger/5 px-3 py-2 text-danger">
            <span className="text-xl font-bold tabular-nums">{formatNumber(outOf)}</span>
            <span className="text-[0.65rem]">out of stock</span>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
            <span className="text-xl font-bold tabular-nums">{formatNumber(low)}</span>
            <span className="text-[0.65rem]">low stock</span>
          </div>
          {value > 0 && (
            <div className="flex flex-col items-center rounded-lg bg-brand-50 px-3 py-2 text-brand-600">
              <span className="text-xl font-bold tabular-nums">{formatCompactCurrency(value)}</span>
              <span className="text-[0.65rem]">stock value</span>
            </div>
          )}
        </div>

        {/* risk bar */}
        {(low + outOf) > 0 && (
          <div>
            <p className="mb-1 text-[0.65rem] text-ink-subtle">Items needing attention</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full bg-danger transition-all duration-500"
                style={{ width: `${(outOf / (low + outOf)) * 100}%` }}
              />
              <div
                className="h-full bg-amber-400 transition-all duration-500"
                style={{ width: `${(low / (low + outOf)) * 100}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[0.6rem] text-ink-subtle">
              <span>Out of stock</span>
              <span>Low stock</span>
            </div>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

// ─── 6. Contractor headcount ──────────────────────────────────────────────────

export function ContractorChart({ kpis }) {
  const { totalContractors, activeContractors } = kpis;
  if (totalContractors == null) return null;

  const active   = Number(activeContractors ?? 0);
  const inactive = Math.max(0, Number(totalContractors ?? 0) - active);

  const segments = [
    { label: 'Active',   value: active,   color: COLORS.emerald },
    { label: 'Inactive', value: inactive, color: COLORS.slate   },
  ];

  return (
    <ChartCard title="Contractor status">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <DonutChart segments={segments} size={80} stroke={15} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold tabular-nums text-ink">{formatNumber(Number(totalContractors ?? 0))}</span>
          </div>
        </div>
        <Legend segments={segments} />
      </div>
    </ChartCard>
  );
}

// ─── Composed chart section ───────────────────────────────────────────────────

/**
 * All charts in a responsive grid. Each chart decides internally whether to
 * render based on which kpis the caller's role received — a role with no
 * finance visibility never even gets `projectExpenses` from the server, so
 * those charts simply don't appear.
 */
export default function ReportChartsSection({ kpis }) {
  if (!kpis) return null;

  const hasProject     = kpis.totalProjects != null;
  const hasFinance     = kpis.projectExpenses != null;
  const hasProcurement = kpis.procurementRequests != null;
  const hasWorkforce   = kpis.totalWorkforce != null || kpis.companyLabour != null;
  const hasMaterials   = kpis.lowStockMaterials != null;
  const hasContractor  = kpis.totalContractors != null;

  const hasAny = hasProject || hasFinance || hasProcurement || hasWorkforce || hasMaterials || hasContractor;
  if (!hasAny) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-ink-muted">Analytics snapshot</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {hasProject    && <ProjectStatusChart kpis={kpis}    />}
        {hasFinance    && <FinanceSummaryChart kpis={kpis}   />}
        {hasProcurement && <ProcurementChart kpis={kpis}     />}
        {hasWorkforce  && <WorkforceChart kpis={kpis}        />}
        {hasMaterials  && <MaterialStockChart kpis={kpis}    />}
        {hasContractor && <ContractorChart kpis={kpis}       />}
      </div>
    </div>
  );
}
