import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Logo from '../ui/Logo';
import ThemeSwitcher from '../ui/ThemeSwitcher';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS, ROLES } from '../../config/roles';

// Interface 12 adds an Approvals entry to every role workspace. It is gated
// on `approvals:view` like every other entry here, so a role an admin has not
// granted that permission to simply does not see the link — and the API
// refuses the request anyway if they navigate to it directly.
const approvalsFor = (path) => ({ label: 'Approvals', path: `${path}/approvals`, permission: 'approvals:view' });

// Interface 13 adds a Reports entry to every role workspace, gated on
// `reports:view` exactly like Approvals above — every default role is
// granted it (see server/src/db/schema_user_access.sql), but the check
// still runs the same way so a customised permission matrix is respected.
const reportsFor = (path) => ({ label: 'Reports', path: `${path}/reports`, permission: 'reports:view' });

const ROLE_MODULES = {
  [ROLES.FINANCE]: [
    { label: 'Finance', path: '/finance', permission: 'finance:view' },
    approvalsFor('/finance'),
    reportsFor('/finance'),
  ],
  [ROLES.PROCUREMENT]: [
    { label: 'Procurement', path: '/procurement', permission: 'procurement:view' },
    approvalsFor('/procurement'),
    reportsFor('/procurement'),
  ],
  [ROLES.WAREHOUSE]: [
    { label: 'Warehouse', path: '/warehouse', permission: 'warehouse:view' },
    reportsFor('/warehouse'),
  ],
  [ROLES.HR]: [
    { label: 'Human Resources', path: '/hr', permission: 'hr:view' },
    approvalsFor('/hr'),
    reportsFor('/hr'),
  ],
  [ROLES.CONTRACTOR]: [
    { label: 'Dashboard', path: '/contractor', permission: 'dashboard:view' },
    { label: 'Projects & Sites', path: '/contractor/projects', permission: 'projects:view' },
    { label: 'PO & Contracts', path: '/contractor/contracts', permission: 'dashboard:view' },
    { label: 'Daily Work Updates', path: '/contractor/daily-work', permission: 'projects:view' },
    { label: 'Site Warehouse', path: '/contractor/site-warehouse', permission: 'dashboard:view' },
    { label: 'Tools & Machines', path: '/contractor/tools', permission: 'dashboard:view' },
    { label: 'Material Requests', path: '/contractor/procurement', permission: 'procurement:view' },
    { label: 'Material Movements', path: '/contractor/material-movements', permission: 'procurement:view' },
    { label: 'Purchase Orders', path: '/contractor/purchase-orders', permission: 'procurement:view' },
    approvalsFor('/contractor'),
    reportsFor('/contractor'),
  ],
  [ROLES.PROJECT_MANAGER]: [
    { label: 'Dashboard', path: '/pm', permission: 'dashboard:view' },
    { label: 'Projects & Sites', path: '/pm/projects', permission: 'projects:view' },
    { label: 'Contractors', path: '/pm/contractors', permission: 'projects:view' },
    { label: 'Daily Work Updates', path: '/pm/daily-work', permission: 'projects:view' },
    { label: 'Site Inventory / Stock', path: '/pm/site-warehouse', permission: 'warehouse:view' },
    { label: 'Labour Attendance', path: '/pm/attendance', permission: 'projects:view' },
    { label: 'Contractor Procurement', path: '/pm/procurement', permission: 'procurement:view' },
    { label: 'Machines & Tools', path: '/pm/machines', permission: 'procurement:view' },
    { label: 'Material Movements', path: '/pm/material-movements', permission: 'procurement:view' },
    { label: 'Project Expenses', path: '/pm/expenses', permission: 'projects:view' },
    approvalsFor('/pm'),
    reportsFor('/pm'),
  ],
  [ROLES.EMPLOYEE]: [
    { label: 'Employees', path: '/employee', permission: 'employees:view' },
    approvalsFor('/employee'),
    reportsFor('/employee'),
  ],
};

export function hasPermission(user, permission) {
  return user?.role === ROLES.ADMIN || user?.permissions?.includes(permission);
}

export function modulesForRole(user) {
  return (ROLE_MODULES[user?.role] ?? []).filter((module) => hasPermission(user, module.permission));
}

export default function RoleWorkspaceLayout() {
  const { user, logout } = useAuth();
  const modules = modulesForRole(user);

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Shared purple sidebar — same treatment as the admin rail, so every
          role workspace matches. Structure and menu items are unchanged; only
          the styling is standardised here. */}
      <aside className="app-sidebar flex flex-col gap-4 border-b border-brand-900/30 px-4 py-4 lg:min-h-screen lg:w-64 lg:shrink-0 lg:gap-6 lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-center justify-between gap-3 text-white">
          <Logo size={34} tone="light" withWordmark />
          <ThemeSwitcher tone="light" />
        </div>

        <span className="hidden text-xs font-medium uppercase tracking-wide text-white/60 lg:block">
          {ROLE_LABELS[user?.role] || user?.role}
        </span>

        <nav className="flex flex-1 gap-1.5 overflow-x-auto no-scrollbar lg:flex-col lg:overflow-visible" aria-label="Workspace navigation">
          {modules.map((module) => (
            <NavLink
              key={module.path}
              to={module.path}
              end={module.path === `/${user?.role}` || module.path === '/pm' || module.path === '/finance' || module.path === '/procurement' || module.path === '/warehouse'}
              className={({ isActive }) => `sidebar-link whitespace-nowrap ${isActive ? 'sidebar-link-active' : ''}`}
            >
              {module.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={logout}
          className="sidebar-link w-full justify-start"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-5 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
