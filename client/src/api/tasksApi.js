import axiosClient from './axiosClient';

/**
 * Tasks & Planning API for manual task-based project management.
 */
export const tasksApi = {
  list: (params) => axiosClient.get('/tasks', { params }).then((r) => r.data.data.tasks),
  detail: (id) => axiosClient.get(`/tasks/${id}`).then((r) => r.data.data.task || r.data.data),
  create: (payload) => axiosClient.post('/tasks', payload).then((r) => r.data.data.task),
  update: (id, payload) => axiosClient.put(`/tasks/${id}`, payload).then((r) => r.data.data.task),
  remove: (id) => axiosClient.delete(`/tasks/${id}`).then((r) => r.data.data),
  logWorker: (taskId, payload) => axiosClient.post(`/tasks/${taskId}/workers`, payload).then((r) => r.data.data),
  labourSummary: (taskId) => axiosClient.get(`/tasks/${taskId}/labour-summary`).then((r) => r.data.data.summary),
  getAssignments: (taskId) => axiosClient.get(`/tasks/${taskId}/assignments`).then((r) => r.data.data.assignments),
  assignWorker: (taskId, payload) => axiosClient.post(`/tasks/${taskId}/assignments`, payload).then((r) => r.data.data),
  unassignWorker: (taskId, assignmentId) => axiosClient.delete(`/tasks/${taskId}/assignments/${assignmentId}`).then((r) => r.data.data),
  quickCreateWorker: (payload) => axiosClient.post('/tasks/workers/quick-create', payload).then((r) => r.data.data.worker),
  getPlannedMaterials: (taskId) => axiosClient.get(`/tasks/${taskId}/planned-materials`).then((r) => r.data.data.materials),
};

export default tasksApi;
