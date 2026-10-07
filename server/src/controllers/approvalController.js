'use strict';

const asyncHandler = require('../utils/asyncHandler');
const approvalService = require('../services/approvalService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// ------------------------------------------- Interface 3 (unchanged behaviour)

/** GET /api/approvals — the original generic approval_requests list. */
const list = asyncHandler(async (req, res) => ok(res, { approvals: await approvalService.list(req.query) }));

/** POST /api/approvals — raised by site teams */
const create = asyncHandler(async (req, res) => ok(res, { approval: await approvalService.create(req.body) }, 201));

/** PATCH /api/approvals/:id — Admin decision */
const decide = asyncHandler(async (req, res) => {
  const approval = await approvalService.decide(
    req.params.id,
    req.body.decision,
    req.user?.id,
    req.body.note
  );
  ok(res, { approval });
});

// -------------------------------------------------- Interface 12 (central layer)

/**
 * GET /api/approvals/queue — the unified, cross-module queue.
 * The whole request object is handed to the service rather than just
 * `req.query`, because who the caller is (role, live permissions, linked
 * contractor, project scope) decides what the query is even allowed to mean.
 */
const queue = asyncHandler(async (req, res) => ok(res, await approvalService.listApprovals(req)));

/** GET /api/approvals/summary — dashboard counts. */
const summary = asyncHandler(async (req, res) => ok(res, { summary: await approvalService.getSummary(req) }));

/** GET /api/approvals/lookups — filter options for this caller's queue. */
const lookups = asyncHandler(async (req, res) => ok(res, await approvalService.getLookups(req)));

/** GET /api/approvals/:module/:id — full detail plus history. */
const detail = asyncHandler(async (req, res) =>
  ok(res, await approvalService.getApprovalDetail(req, req.params.module, req.params.id)));

/** GET /api/approvals/:module/:id/history — the audit trail on its own. */
const history = asyncHandler(async (req, res) =>
  ok(res, await approvalService.getHistory(req, req.params.module, req.params.id)));

/** POST /api/approvals/:module/:id/decision — approve or reject. */
const decision = asyncHandler(async (req, res) =>
  ok(res, await approvalService.decideApproval(req, req.params.module, req.params.id, {
    decision: req.body.decision,
    comment: req.body.comment,
  })));

module.exports = { list, create, decide, queue, summary, lookups, detail, history, decision };
