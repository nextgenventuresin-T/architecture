# AppRoutes.jsx — HR route additions (Interface 11 Part 2)

Add these imports near the top of `AppRoutes.jsx` alongside your other
lazy-loaded page imports:

```jsx
const HrDashboardPage   = lazy(() => import('./pages/HrDashboardPage'));
const ContractorHrPage  = lazy(() => import('./pages/ContractorHrPage'));
const EmployeeHrPage    = lazy(() => import('./pages/EmployeeHrPage'));
```

Then add the routes below inside the relevant `<Route>` trees.
The pattern here mirrors how Finance/Projects are wired — adjust the
guard components (`<AdminRoute>`, `<HrRoute>`, etc.) to whatever you
use in your existing router.

---

## Admin workspace  →  /admin/hr

```jsx
<Route
  path="/admin/hr"
  element={
    <AdminRoute>           {/* or <RoleRoute roles={[ROLES.ADMIN]} /> */}
      <HrDashboardPage />
    </AdminRoute>
  }
/>
```

---

## HR role workspace  →  /hr  (or /admin/hr if HR shares the admin shell)

```jsx
<Route
  path="/hr"
  element={
    <HrRoute>              {/* or <RoleRoute roles={[ROLES.ADMIN, ROLES.HR]} /> */}
      <HrDashboardPage />
    </HrRoute>
  }
/>
```

> `HrDashboardPage` already gates individual tabs by `[ROLES.ADMIN, ROLES.HR]`
> checks — if a CONTRACTOR lands here the visible tabs will be just
> "Labour Requests" and "Attendance". You can either share the page or keep
> `/hr` exclusive to HR/Admin and point CONTRACTORs at `/contractor/labour`.

---

## Contractor workspace  →  /contractor

Add a sub-route alongside whatever other contractor pages you have:

```jsx
<Route
  path="/contractor/labour"
  element={
    <ContractorRoute>
      <ContractorHrPage />
    </ContractorRoute>
  }
/>
```

Or if `/contractor` is itself a tab-shell, add a "Labour" nav entry that
renders `<ContractorHrPage />` as the content pane.

---

## Employee workspace  →  /employee

```jsx
<Route
  path="/employee/leave"
  element={
    <EmployeeRoute>
      <EmployeeHrPage />
    </EmployeeRoute>
  }
/>
```

Or, same pattern as contractor: add an "Attendance & Leave" nav entry inside
your existing employee shell.

---

## Summary of new routes

| Path                  | Page               | Who can access             |
| --------------------- | ------------------ | -------------------------- |
| `/admin/hr`           | HrDashboardPage    | ADMIN                      |
| `/hr`                 | HrDashboardPage    | ADMIN, HR                  |
| `/contractor/labour`  | ContractorHrPage   | CONTRACTOR                 |
| `/employee/leave`     | EmployeeHrPage     | EMPLOYEE (any staff role)  |
