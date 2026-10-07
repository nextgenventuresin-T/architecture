import axiosClient from './axiosClient';

/**
 * Users & Access API. Mirrors Interface 10 exactly:
 *   GET   /users                        user list (search, filters, pagination)
 *   GET   /users/lookups                roles, departments, projects, summary
 *   GET   /users/roles                  role list with user counts
 *   GET   /users/roles/:id              role + its permissions
 *   PUT   /users/roles/:id              rename / activate a role
 *   PUT   /users/roles/:id/permissions  replace the role's permission set
 *   GET   /users/permissions            full catalogue + matrix
 *   GET   /users/:id                    account, role, access, activity
 *   POST  /users                        create
 *   PUT   /users/:id                    update
 *   PATCH /users/:id/status             activate / deactivate
 *   POST  /users/:id/reset-password     admin-initiated reset
 *   POST  /users/change-password        signed-in user changes their own
 *   GET   /users/:id/access             project + site scope
 *   PUT   /users/:id/access/projects    replace project scope
 *   PUT   /users/:id/access/sites       replace site scope
 *
 * No endpoint here ever returns a password or hash.
 */
export const usersApi = {
  list: (params) => axiosClient.get('/users', { params }).then((r) => r.data.data),
  lookups: () => axiosClient.get('/users/lookups').then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/users/${id}`).then((r) => r.data.data),
  create: (payload) => axiosClient.post('/users', payload).then((r) => r.data.data.user),
  update: (id, payload) => axiosClient.put(`/users/${id}`, payload).then((r) => r.data.data.user),
  setStatus: (id, status) => axiosClient.patch(`/users/${id}/status`, { status }).then((r) => r.data.data.user),
  resetPassword: (id, payload) => axiosClient.post(`/users/${id}/reset-password`, payload).then((r) => r.data.data),
  changeOwnPassword: (payload) => axiosClient.post('/users/change-password', payload).then((r) => r.data.data),

  roles: () => axiosClient.get('/users/roles').then((r) => r.data.data.roles),
  role: (id) => axiosClient.get(`/users/roles/${id}`).then((r) => r.data.data),
  updateRole: (id, payload) => axiosClient.put(`/users/roles/${id}`, payload).then((r) => r.data.data),
  updateRolePermissions: (id, permissionIds) =>
    axiosClient.put(`/users/roles/${id}/permissions`, { permissionIds }).then((r) => r.data.data),
  permissions: () => axiosClient.get('/users/permissions').then((r) => r.data.data),

  access: (id) => axiosClient.get(`/users/${id}/access`).then((r) => r.data.data),
  setProjectAccess: (id, projectIds) =>
    axiosClient.put(`/users/${id}/access/projects`, { projectIds }).then((r) => r.data.data),
  setSiteAccess: (id, siteIds) =>
    axiosClient.put(`/users/${id}/access/sites`, { siteIds }).then((r) => r.data.data),
  updateUserPermissions: (id, permissionIds, useCustom = true) =>
    axiosClient.put(`/users/${id}/permissions`, { permissionIds, useCustom }).then((r) => r.data.data),
};

export default usersApi;
