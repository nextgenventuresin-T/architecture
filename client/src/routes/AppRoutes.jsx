import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '../pages/auth/LoginPage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import UnauthorisedPage from '../pages/auth/UnauthorisedPage';
import AdminLayout from '../components/layout/AdminLayout';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import ModulePlaceholderPage from '../pages/admin/ModulePlaceholderPage';
import ProjectListPage from '../pages/admin/projects/ProjectListPage';
import ProjectFormPage from '../pages/admin/projects/ProjectFormPage';
import ProjectDetailPage from '../pages/admin/projects/ProjectDetailPage';
import SiteDetailPage from '../pages/admin/projects/SiteDetailPage';
import SiteActivityFormPage from '../pages/admin/projects/SiteActivityFormPage';
import ContractorListPage from '../pages/admin/contractors/ContractorListPage';
import ContractorFormPage from '../pages/admin/contractors/ContractorFormPage';
import ContractorDetailPage from '../pages/admin/contractors/ContractorDetailPage';
import EmployeeListPage from '../pages/admin/employees/EmployeeListPage';
import EmployeeFormPage from '../pages/admin/employees/EmployeeFormPage';
import EmployeeDetailPage from '../pages/admin/employees/EmployeeDetailPage';
import LabourDirectoryPage from '../pages/admin/labour/LabourDirectoryPage';
import VendorListPage from '../pages/admin/vendors/VendorListPage';
import MaterialListPage from '../pages/admin/materials/MaterialListPage';
import MaterialFormPage from '../pages/admin/materials/MaterialFormPage';
import MaterialDetailPage from '../pages/admin/materials/MaterialDetailPage';
import ProcurementListPage from '../pages/admin/procurement/ProcurementListPage';
import ProcurementFormPage from '../pages/admin/procurement/ProcurementFormPage';
import ProcurementDetailPage from '../pages/admin/procurement/ProcurementDetailPage';
import WarehouseListPage from '../pages/admin/warehouse/WarehouseListPage';
import WarehouseFormPage from '../pages/admin/warehouse/WarehouseFormPage';
import WarehouseDetailPage from '../pages/admin/warehouse/WarehouseDetailPage';
import MaterialMovementsPage from '../pages/shared/MaterialMovementsPage';
import ContractorDashboardPage from '../pages/contractor/ContractorDashboardPage';
import ContractorProjectsPage from '../pages/contractor/ContractorProjectsPage';
import ContractorDailyWorkPage from '../pages/contractor/ContractorDailyWorkPage';
import ContractorSiteWarehousePage from '../pages/contractor/ContractorSiteWarehousePage';
import ContractorToolsPage from '../pages/contractor/ContractorToolsPage';
import ContractorExpensesPage from '../pages/contractor/ContractorExpensesPage';
import ContractorExpenseFormPage from '../pages/contractor/ContractorExpenseFormPage';
import ContractorContractsPage from '../pages/contractor/ContractorContractsPage';
import PmDashboardPage from '../pages/pm/PmDashboardPage';
import PmProjectsPage from '../pages/pm/PmProjectsPage';
import PmContractorsPage from '../pages/pm/PmContractorsPage';
import PmDailyWorkPage from '../pages/pm/PmDailyWorkPage';
import PmSiteWarehousePage from '../pages/pm/PmSiteWarehousePage';
import PmProcurementPage from '../pages/pm/PmProcurementPage';
import PmAttendancePage from '../pages/pm/PmAttendancePage';
import PmMachinesPage from '../pages/pm/PmMachinesPage';
import PmExpensesPage from '../pages/pm/PmExpensesPage';
import ClientListPage from '../pages/admin/clients/ClientListPage';
import FinanceDashboardPage from '../pages/admin/finance/FinanceDashboardPage';
import ExpenseFormPage from '../pages/admin/finance/ExpenseFormPage';
import ExpenseDetailPage from '../pages/admin/finance/ExpenseDetailPage';
import UserListPage from '../pages/admin/users/UserListPage';
import UserFormPage from '../pages/admin/users/UserFormPage';
import UserDetailPage from '../pages/admin/users/UserDetailPage';
import RolesPage from '../pages/admin/users/RolesPage';
import HrDashboardPage from '../pages/HrDashboardPage';
import ApprovalsPage from '../pages/admin/approvals/ApprovalsPage';
import ReportsDashboardPage from '../pages/ReportsDashboardPage';
import ContractorHrPage from '../pages/ContractorHrPage';
import EmployeeHrPage from '../pages/EmployeeHrPage';
import RoleLandingPage from '../pages/placeholder/RoleLandingPage';
import RoleWorkspaceLayout from '../components/layout/RoleWorkspaceLayout';
import SettingsPage from '../pages/admin/settings/SettingsPage';
import NotificationsPage from '../pages/admin/notifications/NotificationsPage';
import NotFoundPage from '../pages/NotFoundPage';
import ProtectedRoute from './ProtectedRoute';
import { ROLES } from '../config/roles';
import { ADMIN_MODULES } from '../config/navigation';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/unauthorised" element={<UnauthorisedPage />} />

      {/* Admin area: one guarded layout, every module nested inside it */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.PROJECT_MANAGER]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />

        {/* Interface 3 — Projects & Sites. Declared before the placeholder
            loop so these paths win over the generic module screen. */}
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/new" element={<ProjectFormPage mode="create" />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="projects/:id/edit" element={<ProjectFormPage mode="edit" />} />
        <Route path="projects/:id/sites/:siteId" element={<SiteDetailPage />} />
        <Route path="projects/:id/sites/:siteId/activity/new" element={<SiteActivityFormPage />} />

        <Route path="clients" element={<ClientListPage />} />

        {/* Interface 4 — Contractor Management. Declared before the placeholder
            loop so these paths win over the generic module screen. */}
        <Route path="contractors" element={<ContractorListPage />} />
        <Route path="contractors/new" element={<ContractorFormPage mode="create" />} />
        <Route path="contractors/:id" element={<ContractorDetailPage />} />
        <Route path="contractors/:id/edit" element={<ContractorFormPage mode="edit" />} />

        {/* Interface 5 — Employee Management. Declared before the placeholder
            loop so these paths win over the generic module screen. */}
        <Route path="employees" element={<EmployeeListPage />} />
        <Route path="employees/new" element={<EmployeeFormPage mode="create" />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />
        <Route path="employees/:id/edit" element={<EmployeeFormPage mode="edit" />} />

        {/* Labour Directory */}
        <Route path="labour" element={<LabourDirectoryPage />} />

        {/* Vendor Management */}
        <Route path="vendors" element={<VendorListPage />} />

        {/* Interface 6 — Materials Management. Declared before the placeholder
            loop so these paths win over the generic module screen. */}
        <Route path="materials" element={<MaterialListPage />} />
        <Route path="materials/new" element={<MaterialFormPage mode="create" />} />
        <Route path="materials/:id" element={<MaterialDetailPage />} />
        <Route path="materials/:id/edit" element={<MaterialFormPage mode="edit" />} />

        {/* Interface 7 — Procurement Management (Part 2: frontend). Declared
            before the placeholder loop so these paths win over the generic
            module screen. */}
        <Route path="procurement" element={<ProcurementListPage />} />
        <Route path="procurement/new" element={<ProcurementFormPage mode="create" />} />
        <Route path="procurement/:id" element={<ProcurementDetailPage />} />
        <Route path="procurement/:id/edit" element={<ProcurementFormPage mode="edit" />} />

        {/* Interface 8 — Warehouse / Inventory Management. Declared before the
            placeholder loop so these paths win over the generic module screen. */}
        <Route path="warehouse" element={<WarehouseListPage />} />
        <Route path="warehouse/new" element={<WarehouseFormPage mode="create" />} />
        <Route path="warehouse/:id" element={<WarehouseDetailPage />} />
        <Route path="warehouse/:id/edit" element={<WarehouseFormPage mode="edit" />} />
        <Route path="material-movements" element={<MaterialMovementsPage />} />

        {/* Interface 9 — Finance Management. Declared before the placeholder
            loop so these paths win over the generic module screen. */}
        <Route path="finance" element={<FinanceDashboardPage />} />
        <Route path="finance/expenses" element={<FinanceDashboardPage initialTab="expenses" />} />
        <Route path="finance/expenses/new" element={<ExpenseFormPage mode="create" />} />
        <Route path="finance/expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="finance/expenses/:id/edit" element={<ExpenseFormPage mode="edit" />} />

        {/* Interface 10 — Users & Access Management. `users/new` and
            `users/roles` are declared before `users/:id` so they are not
            parsed as a user id. */}
        <Route path="users" element={<UserListPage />} />
        <Route path="users/new" element={<UserFormPage mode="create" />} />
        <Route path="users/roles" element={<RolesPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="users/:id/edit" element={<UserFormPage mode="edit" />} />

        {/* Interface 11 — HR & Labour Management. Declared before the
            placeholder loop so this path wins over the generic module screen. */}
        <Route path="hr" element={<HrDashboardPage />} />

        {/* Interface 12 — Approvals Management. Declared before the
            placeholder loop so this path wins over the generic module screen. */}
        <Route path="approvals" element={<ApprovalsPage />} />

        {/* Interface 13 — Reports & Analytics. Declared before the
            placeholder loop so this path wins over the generic module screen. */}
        <Route path="reports" element={<ReportsDashboardPage />} />

        {/* Settings — Theme & Company Customization */}
        <Route path="settings" element={<SettingsPage />} />

        {/* Notifications & System Alerts */}
        <Route path="notifications" element={<NotificationsPage />} />

        {ADMIN_MODULES.filter(
          (m) =>
            m.path !== '/admin/projects' &&
            m.path !== '/admin/clients' &&
            m.path !== '/admin/contractors' &&
            m.path !== '/admin/employees' &&
            m.path !== '/admin/materials' &&
            m.path !== '/admin/procurement' &&
            m.path !== '/admin/warehouse' &&
            m.path !== '/admin/material-movements' &&
            m.path !== '/admin/finance' &&
            m.path !== '/admin/users' &&
            m.path !== '/admin/hr' &&
            m.path !== '/admin/approvals' &&
            m.path !== '/admin/reports' &&
            m.path !== '/admin/settings' &&
            m.path !== '/admin/notifications'
        ).map((module) => (
          <Route
            key={module.path}
            path={module.path.replace('/admin/', '')}
            element={<ModulePlaceholderPage />}
          />
        ))}
      </Route>

      <Route
        path="/finance"
        element={<ProtectedRoute allowedRoles={[ROLES.FINANCE]} requiredPermission="finance:view"><RoleWorkspaceLayout /></ProtectedRoute>}
      >
        <Route index element={<FinanceDashboardPage basePath="/finance" />} />
        <Route path="expenses" element={<FinanceDashboardPage initialTab="expenses" basePath="/finance" />} />
        <Route path="expenses/new" element={<ExpenseFormPage mode="create" basePath="/finance" />} />
        <Route path="expenses/:id" element={<ExpenseDetailPage basePath="/finance" />} />
        <Route path="expenses/:id/edit" element={<ExpenseFormPage mode="edit" basePath="/finance" />} />
        <Route path="approvals" element={<ApprovalsPage basePath="/finance" />} />
        <Route path="reports" element={<ReportsDashboardPage basePath="/finance" />} />
      </Route>

      <Route
        path="/procurement"
        element={<ProtectedRoute allowedRoles={[ROLES.PROCUREMENT]} requiredPermission="procurement:view"><RoleWorkspaceLayout /></ProtectedRoute>}
      >
        <Route index element={<ProcurementListPage basePath="/procurement" />} />
        <Route path="approvals" element={<ApprovalsPage basePath="/procurement" />} />
        <Route path=":id" element={<ProcurementDetailPage basePath="/procurement" />} />
        <Route path="new" element={<ProcurementFormPage mode="create" basePath="/procurement" />} />
        <Route path=":id/edit" element={<ProcurementFormPage mode="edit" basePath="/procurement" />} />
        <Route path="reports" element={<ReportsDashboardPage basePath="/procurement" />} />
      </Route>

      <Route
        path="/warehouse"
        element={<ProtectedRoute allowedRoles={[ROLES.WAREHOUSE]} requiredPermission="warehouse:view"><RoleWorkspaceLayout /></ProtectedRoute>}
      >
        <Route index element={<WarehouseListPage basePath="/warehouse" />} />
        <Route path="material-movements" element={<MaterialMovementsPage />} />
        <Route path=":id" element={<WarehouseDetailPage basePath="/warehouse" />} />
        <Route path="new" element={<WarehouseFormPage mode="create" basePath="/warehouse" />} />
        <Route path=":id/edit" element={<WarehouseFormPage mode="edit" basePath="/warehouse" />} />
        <Route path="reports" element={<ReportsDashboardPage basePath="/warehouse" />} />
      </Route>

      {/* Project Manager Workspace */}
      <Route
        path="/pm"
        element={<ProtectedRoute allowedRoles={[ROLES.PROJECT_MANAGER, ROLES.ADMIN]}><RoleWorkspaceLayout /></ProtectedRoute>}
      >
        <Route index element={<PmDashboardPage />} />
        <Route path="projects" element={<PmProjectsPage />} />
        <Route path="contractors" element={<PmContractorsPage />} />
        <Route path="daily-work" element={<PmDailyWorkPage />} />
        <Route path="site-warehouse" element={<PmSiteWarehousePage />} />
        <Route path="procurement" element={<PmProcurementPage />} />
        <Route path="procurement/new" element={<ProcurementFormPage mode="create" basePath="/pm/procurement" />} />
        <Route path="procurement/:id" element={<ProcurementDetailPage basePath="/pm/procurement" />} />
        <Route path="procurement/:id/edit" element={<ProcurementFormPage mode="edit" basePath="/pm/procurement" />} />
        <Route path="attendance" element={<PmAttendancePage />} />
        <Route path="machines" element={<PmMachinesPage />} />
        <Route path="expenses" element={<PmExpensesPage />} />
        <Route path="material-movements" element={<MaterialMovementsPage />} />
        <Route path="approvals" element={<ApprovalsPage basePath="/pm" />} />
        <Route path="reports" element={<ReportsDashboardPage basePath="/pm" />} />
      </Route>

      {[
        [ROLES.HR, '/hr', HrDashboardPage],
        [ROLES.CONTRACTOR, '/contractor', ContractorDashboardPage],
        [ROLES.EMPLOYEE, '/employee', EmployeeHrPage],
      ].map(([role, path, IndexPage]) => (
        <Route
          key={role}
          path={path}
          element={<ProtectedRoute allowedRoles={[role]}><RoleWorkspaceLayout /></ProtectedRoute>}
        >
          <Route index element={IndexPage ? <IndexPage /> : <RoleLandingPage />} />
          {role === ROLES.CONTRACTOR && (
            <>
              <Route path="projects" element={<ContractorProjectsPage />} />
              <Route path="daily-work" element={<ContractorDailyWorkPage />} />
              <Route path="site-warehouse" element={<ContractorSiteWarehousePage />} />
              <Route path="tools" element={<ContractorToolsPage />} />
              <Route path="procurement" element={<ProcurementListPage basePath="/contractor/procurement" />} />
              <Route path="procurement/new" element={<ProcurementFormPage mode="create" basePath="/contractor/procurement" />} />
              <Route path="procurement/:id" element={<ProcurementDetailPage basePath="/contractor/procurement" />} />
              <Route path="procurement/:id/edit" element={<ProcurementFormPage mode="edit" basePath="/contractor/procurement" />} />
              <Route path="purchase-orders" element={<ProcurementListPage basePath="/contractor/purchase-orders" />} />
              <Route path="material-movements" element={<MaterialMovementsPage />} />
              <Route path="contracts" element={<ContractorContractsPage />} />
              <Route path="expenses" element={<ContractorExpensesPage />} />
              <Route path="expenses/new" element={<ContractorExpenseFormPage />} />
            </>
          )}
          {/* Interface 12 — the same central approvals screen in every role
              workspace. HR processes labour approvals here; a contractor or
              employee sees the status of requests they raised and no approve
              or reject controls. What each role can see and do is decided by
              the API from their role, not by this route. */}
          <Route path="approvals" element={<ApprovalsPage basePath={path} />} />
          {/* Interface 13 — Reports & Analytics, scoped to whatever this
              role/contractor is already allowed to see. */}
          <Route path="reports" element={<ReportsDashboardPage basePath={path} />} />
        </Route>
      ))}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
