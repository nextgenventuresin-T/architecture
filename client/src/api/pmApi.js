import axiosClient from './axiosClient';

export const pmApi = {
  dashboard: () => axiosClient.get('/pm/dashboard').then((res) => res.data?.data ?? res.data),
  projects: () => axiosClient.get('/pm/projects').then((res) => res.data?.data ?? res.data),
  contractors: () => axiosClient.get('/pm/contractors').then((res) => res.data?.data ?? res.data),
  workUpdates: (params = {}) => axiosClient.get('/pm/work-updates', { params }).then((res) => res.data?.data ?? res.data),
  procurement: (params = {}) => axiosClient.get('/pm/procurement', { params }).then((res) => res.data?.data ?? res.data),
  // Assigned-site workspace
  scope: () => axiosClient.get('/pm/scope').then((res) => res.data?.data ?? res.data),
  workers: (params) => axiosClient.get('/pm/workers', { params }).then((res) => res.data?.data ?? res.data),
  attendance: (params = {}) => axiosClient.get('/pm/attendance', { params }).then((res) => res.data?.data ?? res.data),
  markAttendance: (payload) => axiosClient.post('/pm/attendance', payload).then((res) => res.data?.data ?? res.data),
  expenses: (params = {}) => axiosClient.get('/pm/expenses', { params }).then((res) => res.data?.data ?? res.data),
  siteWarehouse: (params = {}) => axiosClient.get('/pm/site-warehouse', { params }).then((res) => res.data?.data ?? res.data),
};
