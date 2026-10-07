# Interface 11 Part 2 (Frontend) — build/test pass complete

## What changed in this pass
1. **`Modal.jsx` didn't support a `size` prop at all** — `LabourRequestDetailModal`
   was passing `size="lg"` but it was silently ignored (hardcoded `max-w-lg`).
   Added `size` (`md` default / `lg` / `xl`) rather than strip the usage, since
   the fulfilments list genuinely needs the extra width. Confirmed live in the
   browser: dialog renders at `max-w-2xl` (672px).
2. **HR routes existed as files but were never wired into `AppRoutes.jsx`.**
   `AppRoutes.PATCH.md` had the instructions but they were never applied —
   `/admin/hr`, `/hr`, `/contractor`, `/employee` were all still hitting the
   generic placeholder / `RoleLandingPage`. Wired `HrDashboardPage`,
   `ContractorHrPage`, and `EmployeeHrPage` into their respective routes and
   removed `hr` from the placeholder-module loop.
3. **Cascading project→site (and contractor/employee) dropdowns were silently
   broken.** Every picker in `AssignmentFormModal`, `LabourRequestFormModal`,
   `AttendanceMarkModal`, `WorkerFormModal`, and `LabourRequestDetailModal`
   requested `pageSize: 100` or `pageSize: 200`, but the backend caps
   `pageSize` at 50 for `/projects`, `/contractors`, `/employees` and at 100
   for `/hr/contractor-workers` (`express-validator` `isInt({ max: ... })`).
   Every one of those list calls was silently failing with a 400 and falling
   back to an empty array via `.catch(() => setX([]))` — so every dropdown in
   every HR modal was empty with no visible error. Fixed all 12 call sites to
   request `pageSize: 50` (projects/contractors/employees) or `pageSize: 100`
   (hr labour endpoints), matching the backend's actual limits. Confirmed
   live: opening "Post assignment" now loads 5 real projects with zero
   network errors, and picking a project correctly populates its sites.
4. **Labour request number showed as `undefined` everywhere.**
   `LabourRequestsTab.jsx` and `LabourRequestDetailModal.jsx` both read
   `row.requestCode` / `request.requestCode`, but the backend
   (`labourRequestService.js`) returns the field as `requestNumber`. Fixed
   both. Confirmed live: list now shows `LR-0002 · Contractor · 1 worker`
   etc, and the modal header shows `LR-0002 · Created 07 Sept 2026`.
5. Verified the three flagged assumptions against the real backend:
   - `employeesApi.list()` → `{ employees, pagination }` — **correct**.
   - `projectsApi.detail(id)` → includes `sites` — **correct**.
   - `Modal` `size="lg"` prop — **wrong**, fixed in (1).

## Verified, not just assumed
- **Production build**: `npm run build` — 1,793 modules, zero errors (hit and
  fixed the known `@rollup/rollup-linux-x64-gnu` optional-deps npm bug along
  the way; unrelated to this codebase).
- **Backend flow + restriction checks**: stood up MySQL, ran migrations +
  seed + demo seed, started the real API server, and ran
  `scripts_test/hr_smoke_test.js` end-to-end — **47/47 assertions pass**,
  covering the full labour-request lifecycle (submit → approve → partial
  assign → full assign → complete), invalid-transition rejection, and every
  cross-contractor / cross-role restriction (contractor can't see another
  contractor's workers or assignments, employee can't create assignments or
  mark attendance, etc).
- **Live UI walkthrough, in headless Chromium against the real dev server and
  real API** (not just a code read):
  - Admin: HR dashboard renders real data; Labour Requests list and detail
    modal both show correct `LR-####` numbers; the detail modal renders at
    the fixed `lg` width; "Post assignment" → project dropdown loads 5 real
    projects → picking one correctly populates its sites; clicking "End" on
    an active assignment removed it from the active list (real DB write).
  - HR role (`hr@test.local`): lands on `/hr`, dashboard renders correctly.
  - Contractor1 (`contractor1@test.local`): My Workers, Labour Requests, and
    Attendance tabs all show their own real data (3 workers, 2 requests incl.
    one Completed, correct scoping).
  - Contractor2: worker list correctly shows only their own worker, not
    contractor1's.
  - Employee: no attendance-marking control (view-only + Leave, as designed).
- `scripts_test/create_test_users.js` hardcodes `DB_USER=erp` and is missing
  an `admin@test.local` account the smoke test expects — worth aligning if
  you re-run it in a different environment; not shipped as a code change
  since it's a test-only script (only added an `admin@test.local` account
  locally to run the pass).

## Previously — partial progress

## Done and verified against your real backend (Part 1)
Confirmed the backend contract by reading the actual services/controllers
(not guessed): `hrLabourController.js`, `hrDashboardService.js`,
`contractorWorkerService.js`, `labourAssignmentService.js`,
`labourRequestService.js`, `attendanceService.js`, `leaveService.js`.

Files below are drop-in ready — copy them into the matching path under
`architecture-erp-merged/client/src/` in your real project (they don't
overwrite anything that exists today):

- `client/src/api/hrApi.js` — full API client for every `/hr/...` endpoint
  (dashboard, contractor-workers, assignments, labour-requests, attendance,
  leave). Matches the exact response envelopes your controller returns.
- `client/src/utils/hrOptions.js` — status/priority labels, badge tones, and
  the allowed-transition maps mirrored from `labourRequestService.js` /
  `leaveService.js` (STATUSES/TRANSITIONS), so the UI never offers a move the
  API will reject.
- `client/src/components/hr/HrOverviewTab.jsx` — HR Dashboard summary: labour
  counts, today's attendance, request pipeline, contractor-wise breakdown
  (reads `GET /hr/dashboard`).
- `client/src/components/hr/AssignmentsTab.jsx` — **one component reused as
  three dashboard tabs** (Company Labour, Contractor Labour, Assignments) via
  a `fixedLabourType` prop, since the backend already treats these as one
  filtered resource (`GET /hr/assignments?labourType=...`). Includes
  "post assignment" and "end assignment" actions, gated to Admin/HR.
- `client/src/components/hr/AssignmentFormModal.jsx` — create-assignment
  form (project → site cascade, company employee or contractor worker
  picker).
- `client/src/components/hr/ContractorWorkersTab.jsx` +
  `WorkerFormModal.jsx` — full CRUD list for contractor workers, with the
  contractor picker hidden for a signed-in CONTRACTOR (backend already forces
  their own contractor_id; this just matches that in the UI).

## Not yet built
- Labour Requests tab + detail/review modal (submit → review → approve/
  reject → partial/full assignment → complete, with the fulfilments list)
- Attendance tab + mark-attendance modal
- Leave tab + apply/approve/reject modal
- `HrDashboardPage.jsx` — the page that assembles all the above into tabs
  (same pattern as your existing `FinanceDashboardPage.jsx`), for both
  `/admin/hr` and the HR role's `/hr` workspace
- Contractor workspace integration (`/contractor` — My Workers, Labour
  Requests, Attendance tabs using the components above)
- Employee workspace integration (`/employee` — Attendance view, Leave)
- Route wiring in `AppRoutes.jsx`
- Production build (`npm run build`) and fixing whatever it surfaces
- Manual pass through the HR flows + contractor/employee restriction checks

## Next steps
Send me the project again (or just say "continue" if I still have the
extracted copy) and I'll resume directly from the Labour Requests tab,
through Attendance, Leave, the dashboard page, routing, and the build/test
pass — then package and hand you the finished ZIP.
