'use strict';

/**
 * Canonical role list for the whole ERP. The client mirrors these values in
 * client/src/config/roles.js — keep the two in sync when a role is added.
 * Workspace routing is owned by the client; the API keeps this vocabulary
 * canonical for authentication and authorization.
 */
const ROLES = Object.freeze({
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

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const isValidRole = (role) => ROLE_VALUES.includes(role);

/** Roles that work like a Project Manager (same screens and access, scoped to their projects / sites). */
const PM_ROLES = Object.freeze([ROLES.PROJECT_MANAGER, ROLES.SITE_ENGINEER]);
const isPmRole = (role) => PM_ROLES.includes(role);

module.exports = { ROLES, ROLE_VALUES, isValidRole, PM_ROLES, isPmRole };
