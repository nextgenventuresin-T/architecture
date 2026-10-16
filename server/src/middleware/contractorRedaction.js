'use strict';

const { ROLES } = require('../config/roles');

/**
 * Contractor confidentiality.
 *
 * A contractor works from the same task, project, procurement and tool endpoints
 * as internal staff, so every JSON response sent to a CONTRACTOR is filtered here,
 * in one place, rather than trusting each of ~40 endpoints to remember. What a
 * contractor needs for their work stays (quantities, schedules, progress, their
 * own workers and wages, their own contracts, expenses and payments); what is
 * internal is removed:
 *
 *   CONFIDENTIAL_KEYS  - planned budgets, budget utilisation, client contract
 *                        value, profit and margins. Removed from every response.
 *   INTERNAL_COST_KEYS - purchase / estimated rates, procurement totals, stock
 *                        valuation, machine purchase & rental costs. Removed except
 *                        on the contractor's own commercial endpoints
 *                        (OWN_COMMERCIAL_PATHS: their contracts / POs, their
 *                        expenses & payments, their workers' wages).
 *
 * Server-side rules (budget enforcement, excess approvals) still run on the full
 * data; only what is SENT to the contractor is reduced.
 */
const CONFIDENTIAL_KEYS = new Set([
  // project / phase budgets and client value
  'estimated_budget', 'estimatedBudget', 'client_contract_value', 'clientContractValue',
  'planned_budget', 'plannedBudget', 'budget', 'budgets', 'allocated_budget', 'allocatedBudget',
  'phaseBudget', 'phase_budget', 'budgetSummary', 'budget_summary',
  // task / subtask budgets and utilisation
  'total_budget', 'totalBudget', 'material_budget', 'materialBudget', 'tool_budget', 'toolBudget',
  'labour_budget', 'labourBudget', 'misc_budget', 'miscBudget',
  'approved_additional_budget', 'approvedAdditionalBudget', 'pending_excess_budget', 'pendingExcessBudget',
  'effectiveBudget', 'effective_budget', 'remainingBudget', 'remaining_budget', 'remainingLabourBudget',
  'plannedLabourCost', 'planned_labour_cost', 'budgetUtilization', 'budget_utilization', 'utilization',
  'actualCost', 'actual_cost', 'actualLabourCost', 'actual_labour_cost', 'totalActualExpenses',
  'requestedExcess', 'excessAmount', 'consolidation', 'reconciliation',
  // profitability
  'profit', 'profitMargin', 'profit_margin', 'margin', 'marginPercent', 'revenue', 'totalRevenue',
  'estimatedValue', 'estimated_value', 'committedValue', 'committed_value',
]);

const INTERNAL_COST_KEYS = new Set([
  'purchase_rate', 'purchaseRate', 'estimated_rate', 'estimatedRate', 'estimated_total', 'estimatedTotal',
  'total_amount', 'totalAmount', 'default_rate', 'defaultRate', 'procurement_rate', 'procurementRate',
  'cost_per_unit', 'costPerUnit', 'unit_cost', 'unitCost', 'total_cost', 'totalCost',
  'purchase_cost', 'purchaseCost', 'rental_cost', 'rentalCost', 'rate_per_day', 'ratePerDay',
  'amount_paid', 'amountPaid', 'amount_due', 'amountDue', 'material_cost', 'materialCost',
  'stock_value', 'stockValue', 'value_amount', 'valuation', 'material_default_rate', 'totalValue', 'total_value',
  'transport_cost', 'transportCost', 'transport_paid', 'transportPaid', 'procurementValue',
  'contract_value', 'contractValue',
]);

const OWN_COMMERCIAL_PATHS = ['/contractor-portal', '/contractors/pos', '/hr', '/finance/expenses', '/finance/contractor-payments'];

function strip(value, hideCosts, depth = 0) {
  if (depth > 40 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => strip(v, hideCosts, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (CONFIDENTIAL_KEYS.has(key)) continue;
    if (hideCosts && INTERNAL_COST_KEYS.has(key)) continue;
    out[key] = strip(v, hideCosts, depth + 1);
  }
  return out;
}

function redactForContractor(body, path = '') {
  const hideCosts = !OWN_COMMERCIAL_PATHS.some((p) => path.startsWith(p));
  return strip(body, hideCosts);
}

/** Wraps res.json for the request; filters only when the signed-in user is a contractor. */
function contractorRedaction(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (req.user?.role === ROLES.CONTRACTOR && body && typeof body === 'object') {
      return json(redactForContractor(body, req.path));
    }
    return json(body);
  };
  next();
}

module.exports = { contractorRedaction, redactForContractor, CONFIDENTIAL_KEYS, INTERNAL_COST_KEYS };
