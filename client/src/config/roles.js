/**
 * Role vocabulary shared with the API (server/src/config/roles.js).
 * `ROLE_HOME` is the single place that decides where a signed-in user lands.
 * Dedicated workspaces can replace the landing page without changing login
 * or role resolution.
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project_manager',
  FINANCE: 'finance',
  HR: 'hr',
  PROCUREMENT: 'procurement',
  WAREHOUSE: 'warehouse',
  CONTRACTOR: 'contractor',
  EMPLOYEE: 'employee',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.PROJECT_MANAGER]: 'Project Manager',
  [ROLES.FINANCE]: 'Finance',
  [ROLES.HR]: 'Human Resources',
  [ROLES.PROCUREMENT]: 'Procurement',
  [ROLES.WAREHOUSE]: 'Warehouse',
  [ROLES.CONTRACTOR]: 'Labour Contractor',
  [ROLES.EMPLOYEE]: 'Employee',
});

export const ROLE_HOME = Object.freeze({
  [ROLES.ADMIN]: '/admin',
  [ROLES.PROJECT_MANAGER]: '/pm',
  [ROLES.FINANCE]: '/finance',
  [ROLES.HR]: '/hr',
  [ROLES.PROCUREMENT]: '/procurement',
  [ROLES.WAREHOUSE]: '/warehouse',
  [ROLES.CONTRACTOR]: '/contractor',
  [ROLES.EMPLOYEE]: '/employee',
});

export const FALLBACK_HOME = '/employee';

export const resolveHomeRoute = (role) => ROLE_HOME[role] || FALLBACK_HOME;
