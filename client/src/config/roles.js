/**
 * Role vocabulary shared with the API (server/src/config/roles.js).
 * `ROLE_HOME` is the single place that decides where a signed-in user lands.
 * Dedicated workspaces can replace the landing page without changing login
 * or role resolution.
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project_manager',
  // Same access as a Project Manager, limited to the sites assigned to them.
  SITE_ENGINEER: 'site_engineer',
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
  [ROLES.SITE_ENGINEER]: 'Site Engineer',
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
  [ROLES.SITE_ENGINEER]: '/pm', // the Project Manager workspace, scoped to their sites
  [ROLES.FINANCE]: '/finance',
  [ROLES.HR]: '/hr',
  [ROLES.PROCUREMENT]: '/procurement',
  [ROLES.WAREHOUSE]: '/warehouse',
  [ROLES.CONTRACTOR]: '/contractor',
  [ROLES.EMPLOYEE]: '/employee',
});

export const FALLBACK_HOME = '/employee';

/** Roles that work like a Project Manager (same workspace and access). */
export const PM_ROLES = Object.freeze([ROLES.PROJECT_MANAGER, ROLES.SITE_ENGINEER]);
export const isPmRole = (role) => PM_ROLES.includes(role);

export const resolveHomeRoute = (role) => ROLE_HOME[role] || FALLBACK_HOME;
