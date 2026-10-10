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
  // subtaskId narrows the plan to one subtask; omitted = whole task (unchanged behaviour).
  getPlannedMaterials: (taskId, subtaskId) =>
    axiosClient
      .get(`/tasks/${taskId}/planned-materials`, { params: subtaskId ? { subtaskId } : undefined })
      .then((r) => r.data.data.materials),
  getPlannedTools: (taskId, subtaskId) =>
    axiosClient
      .get(`/tasks/${taskId}/planned-tools`, { params: subtaskId ? { subtaskId } : undefined })
      .then((r) => r.data.data.tools),

  // Subtasks: Main Task -> Subtask, each with its own plan & budget.
  listSubtasks: (taskId) => axiosClient.get(`/tasks/${taskId}/subtasks`).then((r) => r.data.data.subtasks),
  createSubtask: (taskId, payload) => axiosClient.post(`/tasks/${taskId}/subtasks`, payload).then((r) => r.data.data),
  updateSubtask: (taskId, subtaskId, payload) =>
    axiosClient.put(`/tasks/${taskId}/subtasks/${subtaskId}`, payload).then((r) => r.data.data),
  removeSubtask: (taskId, subtaskId) => axiosClient.delete(`/tasks/${taskId}/subtasks/${subtaskId}`).then((r) => r.data.data),
};

export default tasksApi;
