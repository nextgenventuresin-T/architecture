# Interface 12 — Approvals Management

An **overlay**, not the full project. It contains only the files that are new
or modified for Interface 12. Everything else in your project (Interfaces 1–11,
auth, schema, every other module) is untouched and not included.

## How to apply

Extract over your working copy at
`C:\Users\twink\OneDrive\Desktop\architecture-erp-merged`, preserving the
directory structure. If you use git, review the diff before committing.

Then, in order:

```
cd server
npm run db:migrate          # applies the new schema_approvals.sql
npm start

cd ../client
npm run build               # or npm run dev
```

The migration is additive and safe to re-run. Nothing is dropped, renamed,
re-typed or deleted.

---

## Files in this overlay

### New — server
- `server/src/db/schema_approvals.sql` — the `approval_history` table plus
  guarded `approvals:view` grants for contractor/employee.
- `server/src/config/approvalModules.js` — the approval-type registry: where
  each approvable item lives, which statuses count as pending/approved/
  rejected, who may decide it, who may see it.
- `server/scripts_test/approvals_fixtures.js` — test accounts + one pending
  record per module.
- `server/scripts_test/approvals_smoke_test.js` — 99-assertion end-to-end test.

### New — client
- `client/src/api/approvalsApi.js`
- `client/src/utils/approvalOptions.js`
- `client/src/components/approvals/ApprovalSummary.jsx`
- `client/src/components/approvals/ApprovalFilters.jsx`
- `client/src/components/approvals/ApprovalHistoryList.jsx`
- `client/src/components/approvals/ApprovalDetailModal.jsx`
- `client/src/pages/admin/approvals/ApprovalsPage.jsx`

### Modified — server
- `server/src/db/migrate.js` — registered `schema_approvals.sql` last in
  `SCHEMA_FILES`. One line.
- `server/src/models/approvalModel.js` — Interface 3's `findAll`/`findById`/
  `create`/`decide` are **unchanged**; the unified queue, scoped detail
  lookup, counts and history insert/read are appended below them.
- `server/src/services/approvalService.js` — Interface 3's `list`/`create`/
  `decide` are **unchanged**; the central layer is appended below them.
- `server/src/controllers/approvalController.js` — same: original three
  handlers unchanged, six new ones added.
- `server/src/routes/approvalRoutes.js` — the Interface 12 routes are declared
  **before** the original ones so `/queue`, `/summary` and `/lookups` are not
  parsed as ids. The original `GET /`, `POST /` and `PATCH /:id` are byte-for-
  byte identical and still work.

### Modified — client
- `client/src/routes/AppRoutes.jsx` — registered `/admin/approvals` ahead of
  the module-placeholder loop, and added an `approvals` child route to the
  finance, procurement, hr, contractor and employee workspaces.
- `client/src/components/layout/RoleWorkspaceLayout.jsx` — added an Approvals
  nav entry per role, gated on `approvals:view` like every other entry.

`config/navigation.js` already had the Approvals sidebar entry pointing at
`/admin/approvals`, so it was not touched.

---

## What this does NOT do

It does not create a second approval system. Status stays owned by the module
that already owns each workflow:

| Module key | Source table | Pending means |
|---|---|---|
| `general` | `approval_requests` | `pending` |
| `hr_labour` | `labour_requests` | `SUBMITTED`, `UNDER_REVIEW` |
| `procurement` | `procurement_requests` | `pending_approval` |
| `finance` | `expenses` | `pending` |

Approving through this interface calls that module's own service
(`labourRequestService.approve`, `procurementService.updateStatus`,
`financeService.updateExpenseStatus`, `approvalService.decide`), so each
module's own transition rules, validation and side effects keep applying.

No source table is written directly, and no request is copied into a new table.

---

## Adding a fifth approval type later

1. One entry in `server/src/config/approvalModules.js`.
2. One `SELECT` branch in `approvalModel.buildSourceSelect`.
3. One `if` in `approvalService.applyDecision`.

No new table, no new endpoint, and no frontend change — the page renders
whatever the API returns.

---

## Verification performed

Against a real MariaDB instance and the real HTTP API in this environment
(migrations + seed + demo seed applied, server running), not static review:

- `node scripts_test/approvals_smoke_test.js` — **99/99 assertions pass**.
- `npm run build` (client) — **1,800 modules, zero errors**.
- Live browser walkthrough in headless Chromium against the real dev server
  and real API — **71/72 checks pass**. The one failure is a pre-existing bug
  in `ProcurementListPage.jsx`, unrelated to this interface (see below).

Run the tests yourself with:

```
cd server
node scripts_test/approvals_fixtures.js      # seeds test accounts + pending rows
node scripts_test/approvals_smoke_test.js    # expects the server running
```

---

## Two pre-existing bugs found along the way

Neither is caused by this interface and neither is fixed here, to keep the
change focused. Both are worth your attention.

### 1. `ProcurementListPage.jsx` crashes on render

`client/src/pages/admin/procurement/ProcurementListPage.jsx` — the
`RowActions` function at the bottom of the file references `modulePath`, which
is only in scope inside the page component. `/admin/procurement` throws
`ReferenceError: modulePath is not defined` on every row. Confirmed at runtime
in the browser walkthrough.

Fix: pass it in, the same way `row` is.

```jsx
// call sites
render: (row) => <RowActions row={row} modulePath={modulePath} />,
// ...and in the renderCard block
<RowActions row={row} modulePath={modulePath} />

// definition
function RowActions({ row, modulePath }) {
```

### 2. Session loss on reload, in development

`client/src/main.jsx` wraps the app in `React.StrictMode`, so
`AuthProvider`'s bootstrap effect runs twice and fires two concurrent
`POST /api/auth/refresh` calls. Refresh tokens rotate
(`authService.refreshSession` revokes the old one), so the second call
presents an already-revoked token and hits the replay-detection branch —
which calls `refreshTokenModel.revokeAllForUser`, dropping **every** session
for that user. Whether a hard reload keeps you signed in is a coin flip.

StrictMode only double-invokes in development, so the production build is not
affected by *that* trigger. But the underlying race is real: two tabs
restoring a session at the same moment would hit it in production too.

A single-flight guard on the bootstrap refresh (the same
`refreshPromise` pattern `axiosClient.js` already uses for its 401 retry)
would fix it. Left alone here because it is in authentication, which this
interface was told not to touch.
