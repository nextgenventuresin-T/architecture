import axiosClient from './axiosClient';

/**
 * Client for the central Approvals layer (Interface 12).
 *
 * An approval is addressed as `module` + `sourceId`, because a source id is
 * only unique within its own module — labour request 4 and expense 4 are
 * different records. The list returns both, plus a combined `id` string
 * ("hr_labour:4") that is safe to use as a React key.
 *
 * Mirrors server/src/routes/approvalRoutes.js exactly:
 *   GET  /approvals/queue                       unified cross-module queue
 *   GET  /approvals/summary                     dashboard counts
 *   GET  /approvals/lookups                     modules/projects/sites for filters
 *   GET  /approvals/:module/:id                 detail + history + decision rights
 *   GET  /approvals/:module/:id/history         audit trail on its own
 *   POST /approvals/:module/:id/decision        approve or reject
 *
 * The Interface 3 endpoints (`GET /approvals`, `POST /approvals`,
 * `PATCH /approvals/:id`) are untouched and still used by the existing
 * dashboard approvals queue.
 */
export const approvalsApi = {
  list: (params) => axiosClient.get('/approvals/queue', { params }).then((r) => r.data.data),

  summary: () => axiosClient.get('/approvals/summary').then((r) => r.data.data.summary),

  lookups: () => axiosClient.get('/approvals/lookups').then((r) => r.data.data),

  detail: (module, id) => axiosClient.get(`/approvals/${module}/${id}`).then((r) => r.data.data),

  history: (module, id) =>
    axiosClient.get(`/approvals/${module}/${id}/history`).then((r) => r.data.data.history),

  /**
   * `decision` is 'approved' or 'rejected'. A comment is optional when
   * approving and required when rejecting — the server enforces that and
   * returns it under `error.details.comment`, which the dialog surfaces
   * against the field.
   */
  decide: (module, id, { decision, comment }) =>
    axiosClient
      .post(`/approvals/${module}/${id}/decision`, { decision, comment })
      .then((r) => r.data.data),
};

export default approvalsApi;
