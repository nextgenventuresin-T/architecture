import axiosClient from './axiosClient';

/** Every employee list/detail/write call. Components never touch axios directly. */
export const employeesApi = {
  list: (params) => axiosClient.get('/employees', { params }).then((r) => r.data.data),
  lookups: () => axiosClient.get('/employees/lookups').then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/employees/${id}`).then((r) => r.data.data),
  create: (payload) => axiosClient.post('/employees', payload).then((r) => r.data.data.employee),
  update: (id, payload) => axiosClient.patch(`/employees/${id}`, payload).then((r) => r.data.data.employee),
  assign: (id, payload) => axiosClient.post(`/employees/${id}/assign`, payload).then((r) => r.data.data),
  endAssignment: (id, assignmentId) =>
    axiosClient.delete(`/employees/${id}/assignments/${assignmentId}`).then((r) => r.data.data),
  hierarchy: () => axiosClient.get('/employees/hierarchy').then((r) => r.data.data),
  employeeHierarchy: (id) => axiosClient.get(`/employees/${id}/hierarchy`).then((r) => r.data.data),
};

export default employeesApi;
