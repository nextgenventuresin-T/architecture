# Global UI Fix — Purple Sidebar + Dark Text + Clickable Dashboard Cards

Styling + light UI-wiring overlay. **No** API, DB, auth, permissions, routes,
workflows or business logic changed. No module rebuilt. Interface 14 untouched.
"Wiring" = passing an existing setState (tab / filter) to a card's onClick; every
destination a card opens is a view that already existed.

## How to apply
Extract over your working copy, preserving structure, then:

    cd client && npm run build

If the build fails with `Cannot find module '@rollup/rollup-linux-x64-gnu'`
(known npm optional-deps bug, unrelated to this change) run once:

    npm install @rollup/rollup-linux-x64-gnu --no-save

## Files changed (16)

Theme / shared (pass 1)
  client/tailwind.config.js .................. darker ink.muted/ink.subtle -> dark navy text everywhere
  client/src/styles/index.css ................ .app-sidebar / .sidebar-link(-active) / .sidebar-badge / .card-interactive
  client/src/components/layout/Sidebar.jsx ... admin rail -> purple, white nav/icons/logo, active+hover+badges
  client/src/components/layout/RoleWorkspaceLayout.jsx  role workspaces -> matching purple sidebar + sign-out

Clickable dashboard cards (pass 1 + 2) — component + its host page
  dashboard/SummaryCards.jsx ................. admin KPIs (already Links) -> shared feedback
  reports/KpiGrid.jsx ........................ report KPIs (already buttons) -> shared feedback
  approvals/ApprovalSummary.jsx  + pages/admin/approvals/ApprovalsPage.jsx
        all 5 cards -> filter the queue (status, + today range for Approved/Rejected today)
  finance/FinanceSummary.jsx     + pages/admin/finance/FinanceDashboardPage.jsx
        7 cards -> open matching finance tab (projects/expenses/contractor-payments/procurement/payments)
  procurement/ProcurementSummary.jsx + pages/admin/procurement/ProcurementListPage.jsx
        6 cards -> set the request-list status filter
  warehouse/WarehouseSummary.jsx + pages/admin/warehouse/WarehouseListPage.jsx
        6 cards -> open matching warehouse tab (warehouses/stock/transactions)
  hr/HrOverviewTab.jsx           + pages/HrDashboardPage.jsx
        6 KPI tiles + 2 summary panels -> open matching HR tab

## Behaviour
- Every KPI/summary card in every dashboard is now clickable: pointer, hover lift,
  focus ring, and it opens a real existing view (tab or filtered list).
- Cards route via existing in-page state (setActiveTab / setFilters) — no new routes,
  no API calls added, no server/logic touched.
- Role workspaces (finance/procurement/warehouse/hr) get the same behaviour because
  the same components + host pages serve both admin and role contexts via basePath.

## Interfaces affected
- Purple sidebar: admin shell (2-13) + role workspaces (7,8,9,11,12,13)
- Dark text: 1-13 (token change); Login (1) brand panel already white -> unaffected
- Clickable cards: admin dashboard (2), procurement (7), warehouse (8), finance (9),
  HR (11), approvals (12), reports (13)

## Build result
vite build: 1810 modules, 0 errors. Verified via build only (no browser/API here).

See UI-FIX.diff for the full unified diff of all 16 files.
