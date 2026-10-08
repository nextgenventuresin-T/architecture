'use strict';

const ApiError = require('../utils/ApiError');
const approvalModel = require('../models/approvalModel');
const userModel = require('../models/userModel');
const { pool } = require('../config/db');
const {
  ACTIONS,
  NORMALISED,
  APPROVAL_MODULES,
  MODULE_KEYS,
  getModule,
  isValidModule,
  visibilityFor,
  visibleModules,
  canDecideModule,
  decidableModules,
} = require('../config/approvalModules');

// Each module's own service. Interface 12 never writes a source table
// directly — it calls the service that already owns that workflow, so every
// module keeps enforcing its own transition rules, its own validation and its
// own side effects (a rejected labour request still needs its reason, an
// approved expense still can't jump straight to paid, and so on).
const labourRequestService = require('./labourRequestService');
const procurementService = require('./procurementService');
const financeService = require('./financeService');

// ===========================================================================
// Interface 3 — the original generic approval_requests workflow.
// Left exactly as it was: PATCH /api/approvals/:id still goes through here.
// ===========================================================================

const list = (query) => approvalModel.findAll(query);

async function create(payload) {
  const id = await approvalModel.create({
    ...payload,
    requested_on: payload.requested_on || new Date().toISOString().slice(0, 10),
  });
  return approvalModel.findById(id);
}

/**
 * Records an Admin decision. Only pending requests can be decided, so a second
 * click (or a stale tab) cannot flip an already-settled request.
 */
async function decide(id, decision, userId, note) {
  const request = await approvalModel.findById(id);
  if (!request) throw ApiError.notFound('That request does not exist.');
  if (request.status !== 'pending') {
    throw ApiError.badRequest(`This request was already ${request.status}.`);
  }

  const updated = await approvalModel.decide(id, { status: decision, decidedBy: userId, note });
  if (!updated) throw ApiError.badRequest('This request was decided by someone else just now.');

  // Handle task_budget_approvals hook if linked
  const [tbaRows] = await pool.query(
    'SELECT * FROM task_budget_approvals WHERE approval_request_id = ?',
    [id]
  );
  if (tbaRows.length > 0) {
    const tba = tbaRows[0];
    const excess = Number(tba.requested_excess || 0);
    if (decision === 'approved') {
      await pool.query(
        `UPDATE task_budget_approvals
         SET status = 'approved', decided_by = ?, decision_note = ?, decided_at = NOW()
         WHERE id = ?`,
        [userId, note || null, tba.id]
      );
      // Keep original budget (total_budget) strictly UNCHANGED!
      // Add approved additional amount to approved_additional_budget and clear from pending_excess_budget!
      await pool.query(
        `UPDATE project_tasks
         SET approved_additional_budget = approved_additional_budget + ?,
             pending_excess_budget = GREATEST(0, pending_excess_budget - ?)
         WHERE id = ?`,
        [excess, excess, tba.task_id]
      );
    } else if (decision === 'rejected') {
      await pool.query(
        `UPDATE task_budget_approvals
         SET status = 'rejected', decided_by = ?, decision_note = ?, decided_at = NOW()
         WHERE id = ?`,
        [userId, note || null, tba.id]
      );
      await pool.query(
        `UPDATE project_tasks
         SET pending_excess_budget = GREATEST(0, pending_excess_budget - ?)
         WHERE id = ?`,
        [excess, tba.task_id]
      );
    }
  }

  return approvalModel.findById(id);
}

// ===========================================================================
// Interface 12 — the central approvals layer.
// ===========================================================================

const MAX_PAGE_SIZE = 50;

/**
 * Everything the layer needs to know about the caller, resolved server-side.
 *
 * `role` comes from the verified JWT, `permissions` from
 * authorize.loadContext (re-read from the database each request, so a
 * permission revoked a second ago is already gone), and `contractorId` from
 * hrScope (the contractor record the account is actually linked to). None of
 * it can be influenced by the request body or query string, which is what
 * makes the scoping below trustworthy.
 */
function callerFrom(req) {
  return {
    userId: req.user?.id,
    role: req.user?.role,
    email: req.user?.email,
    permissions: req.accessContext?.permissions ?? new Set(),
    projectIds: req.accessContext?.projectScoped ? req.accessContext.projectIds : [],
    contractorId: req.hrScope?.contractorId ?? null,
    employeeId: req.hrScope?.employeeId ?? null,
  };
}

/** The per-module scopes to hand the model, derived from the caller's role. */
function scopesFor(caller) {
  return visibleModules(caller.role).map(({ key, visibility }) => ({
    key,
    visibility,
    userId: caller.userId,
    contractorId: caller.contractorId,
    projectIds: caller.projectIds,
  }));
}

function scopeForModule(caller, moduleKey) {
  const visibility = visibilityFor(caller.role, moduleKey);
  if (visibility === 'none') return null;
  return {
    key: moduleKey,
    visibility,
    userId: caller.userId,
    contractorId: caller.contractorId,
    projectIds: caller.projectIds,
  };
}

/** Presentation shape for one queue row. */
function toApproval(row, caller) {
  if (!row) return null;
  const moduleKey = row.module;
  const module = getModule(moduleKey);

  return {
    // Composite id: a source row is only unique within its own module, so the
    // client addresses an approval as module + id everywhere.
    id: `${moduleKey}:${row.source_id}`,
    module: moduleKey,
    moduleLabel: module?.label ?? moduleKey,
    sourceId: Number(row.source_id),
    reference: row.reference,
    extraReference: row.extra_ref || null,
    requestType: row.request_type,
    title: row.title,
    details: row.details || null,
    project: row.project_id ? { id: Number(row.project_id), name: row.project_name } : null,
    site: row.site_id ? { id: Number(row.site_id), name: row.site_name } : null,
    requestedBy: {
      userId: row.requested_by_user_id ? Number(row.requested_by_user_id) : null,
      name: row.requested_by_name || 'Unknown',
    },
    contractorId: row.contractor_id ? Number(row.contractor_id) : null,
    requestedOn: row.requested_on,
    decidedOn: row.decided_on || null,
    // Null wherever the source workflow has no notion of priority — shown as
    // "—" rather than invented as "medium", which would read as real data.
    priority: row.priority || null,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    // The module's own status verbatim (PARTIALLY_ASSIGNED, pending_approval,
    // paid, ...) so nothing is hidden from the person deciding.
    sourceStatus: row.source_status,
    status: row.normalized_status,
    // Whether THIS caller may act on THIS row, recomputed server-side on every
    // read. The frontend uses it to show or hide buttons; the decision
    // endpoint re-checks it regardless, so hiding is only cosmetic.
    canDecide: caller ? canDecideOn(caller, moduleKey, row).allowed : false,
  };
}

function toHistoryEntry(row) {
  return {
    id: Number(row.id),
    action: row.action,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    comment: row.comment,
    actor: {
      userId: row.actor_user_id ? Number(row.actor_user_id) : null,
      // The name stored at the time wins: the trail should read the way it did
      // when the decision was taken, even if the user has since been renamed.
      name: row.actor_name || row.current_actor_name || 'System',
      role: row.actor_role,
    },
    at: row.created_at,
  };
}

/**
 * The one place that decides whether a caller may approve/reject a given row.
 *
 * Returns `{ allowed, reason }` rather than throwing, because it is called
 * both to gate a write (where the reason becomes a 403 message) and to
 * annotate a read (where it just toggles a button).
 */
function canDecideOn(caller, moduleKey, row) {
  if (!canDecideModule(caller.role, caller.permissions, moduleKey)) {
    return { allowed: false, reason: `Your role cannot process ${getModule(moduleKey)?.label ?? moduleKey} approvals.` };
  }

  // Nobody approves their own request — not even an Admin. This is checked
  // against the requester recorded on the source row, not anything the client
  // sent, and it is why a CONTRACTOR who somehow held an approve permission
  // still could not sign off their own labour request.
  if (row) {
    const raisedByMe = row.requested_by_user_id && Number(row.requested_by_user_id) === Number(caller.userId);
    const raisedByMyContractor = caller.contractorId
      && row.contractor_id
      && Number(row.contractor_id) === Number(caller.contractorId);
    if (raisedByMe || raisedByMyContractor) {
      return { allowed: false, reason: 'You cannot approve a request you raised yourself.' };
    }
  }

  return { allowed: true, reason: null };
}

// ------------------------------------------------------------------- reading

async function listApprovals(req) {
  const caller = callerFrom(req);
  const scopes = scopesFor(caller);

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || 10));

  // A module the caller cannot see is dropped rather than refused: filtering
  // by it simply returns nothing, which leaks less than a 403 would.
  const requestedModule = req.query.module && req.query.module !== 'all' ? req.query.module : null;
  if (requestedModule && !scopes.some((s) => s.key === requestedModule)) {
    return {
      approvals: [],
      pagination: { page, pageSize, total: 0, totalPages: 1 },
    };
  }

  const filters = {
    status: req.query.status || 'all',
    module: requestedModule || 'all',
    projectId: req.query.projectId,
    siteId: req.query.siteId,
    priority: req.query.priority,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    search: req.query.search,
    includeOther: req.query.includeCancelled === 'true',
  };

  const { rows, total } = await approvalModel.findQueue(scopes, filters, { page, pageSize });

  return {
    approvals: rows.map((row) => toApproval(row, caller)),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/**
 * One approval, read through the caller's own scope. A record the caller may
 * not see returns 404, never 403 — a 403 would confirm the record exists,
 * which is exactly what an id-tampering probe is looking for.
 */
async function getApproval(req, moduleKey, sourceId) {
  if (!isValidModule(moduleKey)) throw ApiError.notFound('That approval does not exist.');

  const caller = callerFrom(req);
  const scope = scopeForModule(caller, moduleKey);
  if (!scope) throw ApiError.notFound('That approval does not exist.');

  const row = await approvalModel.findQueueItem(scope, sourceId);
  if (!row) throw ApiError.notFound('That approval does not exist.');

  return { row, caller, approval: toApproval(row, caller) };
}

async function getApprovalDetail(req, moduleKey, sourceId) {
  const { approval, row, caller } = await getApproval(req, moduleKey, sourceId);
  const history = await buildHistory(moduleKey, sourceId, row);
  const decision = canDecideOn(caller, moduleKey, row);

  return {
    approval,
    history,
    // Why the buttons are hidden, so the UI can explain rather than just omit.
    decision: {
      canDecide: decision.allowed,
      reason: decision.reason,
      isPending: approval.status === NORMALISED.PENDING,
    },
  };
}

async function getHistory(req, moduleKey, sourceId) {
  const { row } = await getApproval(req, moduleKey, sourceId);
  return { history: await buildHistory(moduleKey, sourceId, row) };
}

/**
 * The stored trail, prefixed with a synthesised "Submitted" entry.
 *
 * The submission itself predates this table — and for records created before
 * Interface 12 existed, so does every other event. Rather than show an empty
 * history for them, the opening entry is derived from the source row's own
 * requester and creation date, and any decision already recorded on the
 * source row (a `decided_on` / `reviewed_at` with no matching history row) is
 * surfaced too. Derived entries are marked `derived: true` so the UI can be
 * honest about where they came from.
 */
async function buildHistory(moduleKey, sourceId, row) {
  const stored = await approvalModel.findHistory(moduleKey, sourceId);
  const entries = stored.map(toHistoryEntry).map((e) => ({ ...e, derived: false }));

  const opening = {
    id: 0,
    action: ACTIONS.SUBMITTED,
    previousStatus: null,
    newStatus: 'pending',
    comment: null,
    actor: { userId: row?.requested_by_user_id ?? null, name: row?.requested_by_name || 'Unknown', role: null },
    at: row?.requested_on ?? null,
    derived: true,
  };

  // A decision taken directly inside the source module (before this interface
  // existed, or through that module's own screen) leaves a timestamp on the
  // source row but no history row. Show it rather than pretend it never
  // happened.
  const settled = row && row.normalized_status !== NORMALISED.PENDING && row.normalized_status !== NORMALISED.OTHER;
  const alreadyRecorded = entries.some((e) => e.action === ACTIONS.APPROVED || e.action === ACTIONS.REJECTED);

  if (settled && !alreadyRecorded) {
    entries.push({
      id: -1,
      action: row.normalized_status === NORMALISED.APPROVED ? ACTIONS.APPROVED : ACTIONS.REJECTED,
      previousStatus: 'pending',
      newStatus: row.source_status,
      comment: null,
      actor: { userId: null, name: 'Recorded in module', role: null },
      at: row.decided_on ?? null,
      derived: true,
    });
  }

  return [opening, ...entries];
}

// ------------------------------------------------------------------ deciding

/**
 * Hands the decision to the module that owns the workflow.
 *
 * Note the procurement call passes no role: `procurementService.updateStatus`
 * takes an optional role and, when given one, restricts approve/reject to
 * Admin — that is the Procurement module's own rule for its own screen.
 * Authority for the central queue has already been decided above by
 * `canDecideOn` (which lets Procurement staff process procurement approvals,
 * per the brief), so re-applying that module's narrower rule here would
 * contradict a check that has already passed. The transition rules, which are
 * what actually protect the data, still run inside that service.
 */
async function applyDecision(moduleKey, sourceId, decision, comment, caller) {
  const approving = decision === NORMALISED.APPROVED;

  if (moduleKey === 'general') {
    await decide(sourceId, approving ? 'approved' : 'rejected', caller.userId, comment ?? null);
    return;
  }

  if (moduleKey === 'hr_labour') {
    if (approving) await labourRequestService.approve(sourceId, { decisionNote: comment ?? null }, caller.userId);
    else await labourRequestService.reject(sourceId, { decisionNote: comment }, caller.userId);
    return;
  }

  if (moduleKey === 'procurement') {
    await procurementService.updateStatus(sourceId, approving ? 'approved' : 'rejected');
    return;
  }

  if (moduleKey === 'finance') {
    await financeService.updateExpenseStatus(sourceId, approving ? 'approved' : 'rejected');
    return;
  }

  throw ApiError.notFound('That approval does not exist.');
}

/**
 * Approve or reject one item.
 *
 * Order matters here, and every step is server-side:
 *   1. the record is re-read through the caller's own scope (404 if unseen)
 *   2. authority is re-checked (403) — the frontend hiding a button is never
 *      what protects this
 *   3. the item must currently be pending (400) — this is what makes
 *      APPROVED -> REJECTED and REJECTED -> APPROVED impossible
 *   4. a rejection must carry a reason (400)
 *   5. the owning module's service performs the transition
 *   6. the audit trail is appended, and never overwritten
 */
async function decideApproval(req, moduleKey, sourceId, { decision, comment } = {}) {
  if (![NORMALISED.APPROVED, NORMALISED.REJECTED].includes(decision)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      decision: 'Decision must be approve or reject.',
    });
  }

  const { row, caller, approval } = await getApproval(req, moduleKey, sourceId);

  const permitted = canDecideOn(caller, moduleKey, row);
  if (!permitted.allowed) throw ApiError.forbidden(permitted.reason);

  if (approval.status !== NORMALISED.PENDING) {
    throw ApiError.badRequest(
      `This request is already ${approval.status} (${approval.sourceStatus}) and cannot be changed.`
    );
  }

  const trimmed = typeof comment === 'string' ? comment.trim() : '';
  if (decision === NORMALISED.REJECTED && !trimmed) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      comment: 'Enter a reason for rejecting this request.',
    });
  }

  const previousStatus = row.source_status;

  await applyDecision(moduleKey, sourceId, decision, trimmed || null, caller);

  // Re-read so the trail records the status the source module actually landed
  // on, rather than the one this layer assumed it would.
  const scope = scopeForModule(caller, moduleKey);
  const updatedRow = await approvalModel.findQueueItem(scope, sourceId);

  const actor = await userModel.findById(caller.userId).catch(() => null);

  await approvalModel.addHistory({
    module: moduleKey,
    referenceId: Number(sourceId),
    reference: row.reference,
    action: decision === NORMALISED.APPROVED ? ACTIONS.APPROVED : ACTIONS.REJECTED,
    previousStatus,
    newStatus: updatedRow?.source_status ?? previousStatus,
    comment: trimmed || null,
    actorUserId: caller.userId,
    actorName: actor?.full_name || caller.email || null,
    actorRole: caller.role,
  });

  return {
    approval: toApproval(updatedRow, caller),
    history: await buildHistory(moduleKey, sourceId, updatedRow),
  };
}

// ----------------------------------------------------------------- dashboard

async function getSummary(req) {
  const caller = callerFrom(req);
  const scopes = scopesFor(caller);
  const decidable = decidableModules(caller.role, caller.permissions)
    .filter((key) => scopes.some((s) => s.key === key));

  const [counts, myPending, byModule, today] = await Promise.all([
    approvalModel.countByStatus(scopes),
    approvalModel.countMyPending(scopes, decidable),
    approvalModel.countPendingByModule(scopes),
    approvalModel.countDecisionsToday(scopes.map((s) => s.key)),
  ]);

  const pending = counts.pending || 0;
  const approved = counts.approved || 0;
  const rejected = counts.rejected || 0;
  const other = counts.other || 0;

  return {
    pending,
    approved,
    rejected,
    // "Total approvals" = everything that has ever been put to an approver
    // and that this caller may see, cancelled items included.
    total: pending + approved + rejected + other,
    approvedToday: today.approved,
    rejectedToday: today.rejected,
    myPending,
    pendingByModule: byModule,
    canDecide: decidable,
  };
}

/** Filter options, limited to what actually appears in this caller's queue. */
async function getLookups(req) {
  const caller = callerFrom(req);
  const scopes = scopesFor(caller);

  const [projects, sites] = await Promise.all([
    approvalModel.findQueueProjects(scopes),
    approvalModel.findQueueSites(scopes),
  ]);

  return {
    modules: scopes.map(({ key, visibility }) => ({
      key,
      label: APPROVAL_MODULES[key].label,
      description: APPROVAL_MODULES[key].description,
      visibility,
      canDecide: canDecideModule(caller.role, caller.permissions, key),
    })),
    statuses: [NORMALISED.PENDING, NORMALISED.APPROVED, NORMALISED.REJECTED],
    priorities: ['low', 'medium', 'high', 'urgent'],
    projects: projects.map((p) => ({ id: Number(p.id), name: p.name })),
    sites: sites.map((s) => ({ id: Number(s.id), name: s.name, projectId: s.projectId ? Number(s.projectId) : null })),
  };
}

module.exports = {
  // Interface 3
  list,
  create,
  decide,
  // Interface 12
  listApprovals,
  getApprovalDetail,
  getHistory,
  decideApproval,
  getSummary,
  getLookups,
  // exported for tests
  canDecideOn,
  callerFrom,
  MODULE_KEYS,
};
