import axiosClient from './axiosClient';

/**
 * Every project, site and approval call. Components never touch axios directly,
 * so the transport can change without editing screens.
 */
export const projectsApi = {
  list: (params) => axiosClient.get('/projects', { params }).then((r) => r.data.data),
  lookups: () => axiosClient.get('/projects/lookups').then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/projects/${id}`).then((r) => r.data.data),
  create: (payload) => axiosClient.post('/projects', payload).then((r) => r.data.data.project),
  update: (id, payload) => axiosClient.patch(`/projects/${id}`, payload).then((r) => r.data.data.project),
  archive: (id) => axiosClient.delete(`/projects/${id}`).then((r) => r.data.data),
  assignTeam: (id, payload) => axiosClient.patch(`/projects/${id}/team`, payload).then((r) => r.data.data.project),
  addSite: (id, payload) => axiosClient.post(`/projects/${id}/sites`, payload).then((r) => r.data.data.site),

  getPhases: (id) => axiosClient.get(`/projects/${id}/phases`).then((r) => r.data.data.phases),
  updatePhases: (id, phases) => axiosClient.put(`/projects/${id}/phases`, { phases }).then((r) => r.data.data.phases),

  materialsTracking: (id, params) => axiosClient.get(`/projects/${id}/materials-tracking`, { params }).then((r) => r.data.data),
  labourTracking: (id, params) => axiosClient.get(`/projects/${id}/labour-tracking`, { params }).then((r) => r.data.data),
  logLabour: (id, payload) => axiosClient.post(`/projects/${id}/labour`, payload).then((r) => r.data.data.record),

  uploadDocuments: (id, formData) =>
    axiosClient
      .post(`/projects/${id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data.documents),
  downloadDocumentUrl: (id, docId) => `/api/projects/${id}/documents/${docId}/download`,
  deleteDocument: (id, docId) => axiosClient.delete(`/projects/${id}/documents/${docId}`).then((r) => r.data.data),
};

export const sitesApi = {
  detail: (id) => axiosClient.get(`/sites/${id}`).then((r) => r.data.data),
  update: (id, payload) => axiosClient.patch(`/sites/${id}`, payload).then((r) => r.data.data.site),
  remove: (id) => axiosClient.delete(`/sites/${id}`).then((r) => r.data.data),
  logActivity: (id, payload) => axiosClient.post(`/sites/${id}/activities`, payload).then((r) => r.data.data.activity),
};

export const approvalsApi = {
  list: (params) => axiosClient.get('/approvals', { params }).then((r) => r.data.data.approvals),
  create: (payload) => axiosClient.post('/approvals', payload).then((r) => r.data.data.approval),
  decide: (id, decision, note) =>
    axiosClient.patch(`/approvals/${id}`, { decision, note }).then((r) => r.data.data.approval),
};

export default projectsApi;
