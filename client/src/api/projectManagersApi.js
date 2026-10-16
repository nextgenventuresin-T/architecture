import axiosClient from './axiosClient';

/**
 * Project Managers module. A Project Manager is an existing employee - all their
 * details come from (and are edited in) the Employees module.
 */
export const projectManagersApi = {
  list: (params) => axiosClient.get('/project-managers', { params }).then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/project-managers/${id}`).then((r) => r.data.data),
  /** Active employees who are not Project Managers yet. */
  candidates: () => axiosClient.get('/project-managers/candidates').then((r) => r.data.data.employees),
  /** Makes an employee a Project Manager; optionally creates their PM login. */
  assign: (payload) => axiosClient.post('/project-managers', payload).then((r) => r.data.data),
};

export default projectManagersApi;
