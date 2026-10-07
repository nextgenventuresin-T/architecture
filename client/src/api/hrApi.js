import axiosClient from './axiosClient';

/**
 * Every HR & Labour Management (Interface 11) call. Components never touch
 * axios directly — mirrors the contractorsApi/financeApi convention.
 * Backend routes: server/src/routes/hrLabourRoutes.js
 */
export const hrApi = {
  // ------------------------------------------------------------ dashboard
  dashboard: () => axiosClient.get('/hr/dashboard').then((r) => r.data.data.summary),
  siteWorkforce: (siteId) => axiosClient.get(`/hr/dashboard/sites/${siteId}/workforce`).then((r) => r.data.data.workforce),

  // ------------------------------------------------------- contractor workers
  workers: {
    list: (params) => axiosClient.get('/hr/contractor-workers', { params }).then((r) => r.data.data),
    skillCategories: () =>
      axiosClient.get('/hr/contractor-workers/skill-categories').then((r) => r.data.data.skillCategories),
    detail: (id) => axiosClient.get(`/hr/contractor-workers/${id}`).then((r) => r.data.data.worker),
    history: (id) => axiosClient.get(`/hr/contractor-workers/${id}/history`).then((r) => r.data.data),
    create: (payload) => axiosClient.post('/hr/contractor-workers', payload).then((r) => r.data.data.worker),
    update: (id, payload) => axiosClient.patch(`/hr/contractor-workers/${id}`, payload).then((r) => r.data.data.worker),
  },

  // -------------------------------------------------- unified labour directory
  labourDirectory: {
    list: (params) => axiosClient.get('/hr/labour-directory', { params }).then((r) => r.data.data),
    workforceLookup: (params) =>
      axiosClient.get('/hr/labour-directory/lookup', { params }).then((r) => r.data.data.workforce),
    history: (workerType, id) =>
      axiosClient.get(`/hr/labour-directory/${workerType}/${id}/history`).then((r) => r.data.data),
  },

  // ------------------------------------------------------------ assignments
  assignments: {
    list: (params) => axiosClient.get('/hr/assignments', { params }).then((r) => r.data.data),
    detail: (id) => axiosClient.get(`/hr/assignments/${id}`).then((r) => r.data.data.assignment),
    create: (payload) => axiosClient.post('/hr/assignments', payload).then((r) => r.data.data.assignment),
    update: (id, payload) => axiosClient.patch(`/hr/assignments/${id}`, payload).then((r) => r.data.data.assignment),
    end: (id, endDate) => axiosClient.post(`/hr/assignments/${id}/end`, { endDate }).then((r) => r.data.data.assignment),
  },

  // -------------------------------------------------------- labour requests
  requests: {
    list: (params) => axiosClient.get('/hr/labour-requests', { params }).then((r) => r.data.data),
    detail: (id) => axiosClient.get(`/hr/labour-requests/${id}`).then((r) => r.data.data),
    create: (payload) => axiosClient.post('/hr/labour-requests', payload).then((r) => r.data.data.request),
    update: (id, payload) => axiosClient.patch(`/hr/labour-requests/${id}`, payload).then((r) => r.data.data.request),
    submit: (id) => axiosClient.post(`/hr/labour-requests/${id}/submit`).then((r) => r.data.data.request),
    review: (id) => axiosClient.post(`/hr/labour-requests/${id}/review`).then((r) => r.data.data.request),
    approve: (id, decisionNote) =>
      axiosClient.post(`/hr/labour-requests/${id}/approve`, { decisionNote }).then((r) => r.data.data.request),
    reject: (id, decisionNote) =>
      axiosClient.post(`/hr/labour-requests/${id}/reject`, { decisionNote }).then((r) => r.data.data.request),
    cancel: (id) => axiosClient.post(`/hr/labour-requests/${id}/cancel`).then((r) => r.data.data.request),
    complete: (id) => axiosClient.post(`/hr/labour-requests/${id}/complete`).then((r) => r.data.data.request),
    assignWorker: (id, payload) => axiosClient.post(`/hr/labour-requests/${id}/assign`, payload).then((r) => r.data.data),
  },

  // ------------------------------------------------------------- attendance
  attendance: {
    list: (params) => axiosClient.get('/hr/attendance', { params }).then((r) => r.data.data),
    detail: (id) => axiosClient.get(`/hr/attendance/${id}`).then((r) => r.data.data.attendance),
    mark: (payload) => axiosClient.post('/hr/attendance', payload).then((r) => r.data.data.attendance),
    update: (id, payload) => axiosClient.patch(`/hr/attendance/${id}`, payload).then((r) => r.data.data.attendance),
  },

  // ------------------------------------------------------------------ leave
  leave: {
    list: (params) => axiosClient.get('/hr/leave', { params }).then((r) => r.data.data),
    detail: (id) => axiosClient.get(`/hr/leave/${id}`).then((r) => r.data.data.leave),
    create: (payload) => axiosClient.post('/hr/leave', payload).then((r) => r.data.data.leave),
    update: (id, payload) => axiosClient.patch(`/hr/leave/${id}`, payload).then((r) => r.data.data.leave),
    approve: (id, decisionNote) =>
      axiosClient.post(`/hr/leave/${id}/approve`, { decisionNote }).then((r) => r.data.data.leave),
    reject: (id, decisionNote) =>
      axiosClient.post(`/hr/leave/${id}/reject`, { decisionNote }).then((r) => r.data.data.leave),
    cancel: (id) => axiosClient.post(`/hr/leave/${id}/cancel`).then((r) => r.data.data.leave),
  },

  // ------------------------------------------------------------- labour directory
  labourDirectory: {
    list: (params) => axiosClient.get('/hr/labour-directory', { params }).then((r) => r.data.data),
    workforceLookup: (params) =>
      axiosClient
        .get('/hr/labour-directory/lookup', { params })
        .then((r) => r.data.data?.workforce || r.data.data?.workers || (Array.isArray(r.data.data) ? r.data.data : [])),
    history: (workerType, id) => axiosClient.get(`/hr/labour-directory/${workerType}/${id}/history`).then((r) => r.data.data),
    diary: (params) => axiosClient.get('/hr/labour-directory/diary', { params }).then((r) => r.data.data),
    quickCreateWorker: (payload) => axiosClient.post('/tasks/workers/quick-create', payload).then((r) => r.data.data.worker),
  },
};

export default hrApi;
