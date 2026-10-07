import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Package, Wrench, Users, DollarSign, Calendar } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import { formatCurrency, formatNumber } from '../../utils/format';

const STATUS_TONES = {
  'not-started': 'neutral',
  'in-progress': 'warning',
  'completed': 'success',
};

export default function PhasesBudgetTab({ detail }) {
  const { phases = [], project } = detail;
  const [expandedPhases, setExpandedPhases] = useState({});

  const togglePhase = (phaseNumber) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseNumber]: !prev[phaseNumber],
    }));
  };

  const expandAll = () => {
    const all = {};
    phases.forEach((p) => {
      all[p.phaseNumber] = true;
    });
    setExpandedPhases(all);
  };

  const collapseAll = () => {
    setExpandedPhases({});
  };

  const totalCalculatedBudget = phases.reduce((sum, p) => sum + Number(p.budgetTotal || 0), 0);

  return (
    <div className="space-y-6">
      {/* Project Rollup Summary */}
      <Card>
        <CardHeader
          title="8-Phase Planning & Budget Overview"
          description={`Comprehensive structural breakdown for ${project?.name} (${project?.code})`}
          action={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs font-medium text-brand-700 hover:text-brand-900"
              >
                Expand all
              </button>
              <span className="text-line">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs font-medium text-ink-subtle hover:text-ink"
              >
                Collapse all
              </button>
            </div>
          }
        />
        <CardBody className="pt-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Total Estimated Budget</p>
              <p className="mt-1 text-2xl font-bold text-ink">{formatCurrency(totalCalculatedBudget)}</p>
              <p className="mt-1 text-xs text-ink-muted">Rollup across all 8 phases</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Total Expected Duration</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {phases.reduce((sum, p) => sum + Number(p.durationMonths || 0), 0).toFixed(1)} <span className="text-sm font-normal text-ink-muted">months</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">Sum of phase estimates</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Completed Phases</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {phases.filter((p) => p.status === 'completed').length} <span className="text-sm font-normal text-ink-muted">/ {phases.length}</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {phases.filter((p) => p.status === 'in-progress').length} currently in progress
              </p>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs font-medium text-ink-subtle">Overall Project Progress</p>
              <p className="mt-1 text-2xl font-bold text-brand-700">
                {project?.progress != null ? `${project.progress}%` : '0%'}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-brand-600 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, project?.progress || 0))}%` }}
                />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Accordion List for the 8 Phases */}
      <div className="space-y-3">
        {phases.map((phase) => {
          const isOpen = Boolean(expandedPhases[phase.phaseNumber]);
          const phaseBudget = Number(phase.budgetTotal || 0);
          const materialsCost = (phase.materials || []).reduce((s, m) => s + Number(m.totalCost || 0), 0);
          const toolsCost = (phase.tools || []).reduce((s, t) => s + Number(t.estimatedCost || 0), 0);
          const labourCost = (phase.labour || []).reduce((s, l) => s + Number(l.totalCost || 0), 0);
          const miscCost = (phase.misc || []).reduce((s, m) => s + Number(m.amount || 0), 0);

          return (
            <div
              key={phase.phaseNumber}
              className="overflow-hidden rounded-xl border border-line bg-white shadow-xs transition-shadow hover:shadow-sm"
            >
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => togglePhase(phase.phaseNumber)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-canvas/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 font-semibold text-sm">
                    {phase.phaseNumber}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-ink text-base">{phase.title}</h4>
                      <Badge tone={STATUS_TONES[phase.status] || 'neutral'}>
                        {phase.status ? phase.status.replace('-', ' ') : 'not started'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      Estimated duration: {phase.durationMonths || 0} months ({Math.round(Number(phase.durationMonths || 0) * 25)} working days) · Progress: {phase.progress || 0}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-ink-subtle">Allocated Budget</p>
                    <p className="font-bold text-ink text-base tabular-nums">{formatCurrency(phaseBudget)}</p>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-5 w-5 text-ink-subtle shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-ink-subtle shrink-0" />
                  )}
                </div>
              </button>

              {/* Accordion Content */}
              {isOpen && (
                <div className="border-t border-line bg-canvas/30 p-5 space-y-6">
                  {/* Subcategories list */}
                  {phase.subcategories && phase.subcategories.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle mb-2">
                        Subcategories / Scopes
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {phase.subcategories.map((sub, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-md bg-white border border-line px-2.5 py-1 text-xs text-ink-muted"
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4 Detail Budget Tables */}
                  <div className="space-y-4">
                    {/* 1. Materials Table */}
                    <div className="rounded-lg border border-line bg-white overflow-hidden">
                      <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5">
                        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink">
                          <Package className="h-4 w-4 text-brand-600" />
                          Materials ({phase.materials?.length || 0})
                        </span>
                        <span className="text-xs font-semibold text-ink tabular-nums">
                          Total: {formatCurrency(materialsCost)}
                        </span>
                      </div>
                      {(!phase.materials || phase.materials.length === 0) ? (
                        <p className="p-4 text-xs text-ink-subtle italic">No materials budgeted for this phase.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-line bg-canvas/50 text-ink-subtle">
                              <tr>
                                <th className="px-4 py-2 font-medium">Material</th>
                                <th className="px-4 py-2 font-medium">Unit</th>
                                <th className="px-4 py-2 font-medium text-right">Planned Qty</th>
                                <th className="px-4 py-2 font-medium text-right">Unit Rate</th>
                                <th className="px-4 py-2 font-medium text-right">Total Cost</th>
                                <th className="px-4 py-2 font-medium">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {phase.materials.map((m, idx) => (
                                <tr key={m.id || idx}>
                                  <td className="px-4 py-2 font-medium text-ink">{m.materialName || m.materialCode}</td>
                                  <td className="px-4 py-2 text-ink-muted">{m.unit || '—'}</td>
                                  <td className="px-4 py-2 text-right tabular-nums text-ink">{formatNumber(m.plannedQuantity)}</td>
                                  <td className="px-4 py-2 text-right tabular-nums text-ink">{formatCurrency(m.unitRate)}</td>
                                  <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">{formatCurrency(m.totalCost)}</td>
                                  <td className="px-4 py-2 text-ink-subtle">{m.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 2. Machines & Tools Table */}
                    <div className="rounded-lg border border-line bg-white overflow-hidden">
                      <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5">
                        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink">
                          <Wrench className="h-4 w-4 text-amber-600" />
                          Machines & Tools ({phase.tools?.length || 0})
                        </span>
                        <span className="text-xs font-semibold text-ink tabular-nums">
                          Total: {formatCurrency(toolsCost)}
                        </span>
                      </div>
                      {(!phase.tools || phase.tools.length === 0) ? (
                        <p className="p-4 text-xs text-ink-subtle italic">No tools or machinery budgeted for this phase.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-line bg-canvas/50 text-ink-subtle">
                              <tr>
                                <th className="px-4 py-2 font-medium">Tool / Machinery</th>
                                <th className="px-4 py-2 font-medium">Type</th>
                                <th className="px-4 py-2 font-medium text-right">Quantity</th>
                                <th className="px-4 py-2 font-medium text-right">Estimated Cost</th>
                                <th className="px-4 py-2 font-medium">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {phase.tools.map((t, idx) => (
                                <tr key={t.id || idx}>
                                  <td className="px-4 py-2 font-medium text-ink">{t.toolName || t.toolCode}</td>
                                  <td className="px-4 py-2 text-ink-muted capitalize">{t.procurementType}</td>
                                  <td className="px-4 py-2 text-right tabular-nums text-ink">{formatNumber(t.quantity)}</td>
                                  <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">{formatCurrency(t.estimatedCost)}</td>
                                  <td className="px-4 py-2 text-ink-subtle">{t.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 3. Labour Table */}
                    <div className="rounded-lg border border-line bg-white overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-emerald-600" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-ink">
                            Labour ({phase.labour?.length || 0})
                          </span>
                          <span className="text-xs text-ink-muted">
                            · Phase Duration: <strong className="text-ink font-medium">{phase.durationMonths || 0} mo</strong> ({Math.round(Number(phase.durationMonths || 0) * 25)} working days)
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-ink tabular-nums">
                          Total: {formatCurrency(labourCost)}
                        </span>
                      </div>
                      {(!phase.labour || phase.labour.length === 0) ? (
                        <p className="p-4 text-xs text-ink-subtle italic">No labour budgeted for this phase.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-line bg-canvas/50 text-ink-subtle">
                              <tr>
                                <th className="px-4 py-2 font-medium">Labour</th>
                                <th className="px-4 py-2 font-medium text-right">No. of Workers</th>
                                <th className="px-4 py-2 font-medium text-right">Daily Wage</th>
                                <th className="px-4 py-2 font-medium text-right">Working Days</th>
                                <th className="px-4 py-2 font-medium text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {phase.labour.map((l, idx) => {
                                const workerCount = Number(l.workerCount ?? l.quantity ?? 1);
                                const dailyWage = Number(l.dailyWage ?? l.dailyWageRate ?? l.cost ?? 0);
                                const workingDays = Number(l.workingDays ?? l.durationDays ?? Math.round(Number(phase.durationMonths || 0) * 25));
                                const total = Number(l.totalCost ?? (workerCount * dailyWage * workingDays));
                                return (
                                  <tr key={l.id || idx}>
                                    <td className="px-4 py-2 font-medium text-ink">
                                      {l.labourType || l.category || 'Mason'}
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                                      {formatNumber(workerCount)}
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                                      {formatCurrency(dailyWage)}
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface-subtle font-medium text-xs text-ink border border-line">
                                        {formatNumber(workingDays)} days
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">
                                      {formatCurrency(total)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-subtle px-4 py-2 bg-canvas/30 border-t border-line">
                            <span>💡 Formula: <strong className="text-ink font-medium">Total Labour Cost = Number of Workers × Daily Wage × Working Days</strong></span>
                            <span>Working days = Phase duration ({phase.durationMonths || 0} mo) × 25 = <strong className="text-ink font-medium">{Math.round(Number(phase.durationMonths || 0) * 25)} days</strong></span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4. Miscellaneous Expenses Table */}
                    <div className="rounded-lg border border-line bg-white overflow-hidden">
                      <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5">
                        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink">
                          <DollarSign className="h-4 w-4 text-purple-600" />
                          Miscellaneous Expenses ({phase.misc?.length || 0})
                        </span>
                        <span className="text-xs font-semibold text-ink tabular-nums">
                          Total: {formatCurrency(miscCost)}
                        </span>
                      </div>
                      {(!phase.misc || phase.misc.length === 0) ? (
                        <p className="p-4 text-xs text-ink-subtle italic">No miscellaneous expenses budgeted for this phase.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-line bg-canvas/50 text-ink-subtle">
                              <tr>
                                <th className="px-4 py-2 font-medium">Expense Title</th>
                                <th className="px-4 py-2 font-medium">Category</th>
                                <th className="px-4 py-2 font-medium text-right">Amount</th>
                                <th className="px-4 py-2 font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {phase.misc.map((m, idx) => (
                                <tr key={m.id || idx}>
                                  <td className="px-4 py-2 font-medium text-ink">{m.expenseTitle}</td>
                                  <td className="px-4 py-2 text-ink-muted">{m.category}</td>
                                  <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">{formatCurrency(m.amount)}</td>
                                  <td className="px-4 py-2 text-ink-subtle">{m.description || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
