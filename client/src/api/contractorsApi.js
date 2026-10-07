import axiosClient from './axiosClient';

/** Every contractor list/detail/write call. Components never touch axios directly. */
export const contractorsApi = {
  list: (params) => axiosClient.get('/contractors', { params }).then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/contractors/${id}`).then((r) => r.data.data),
  create: (payload) => axiosClient.post('/contractors', payload).then((r) => r.data.data.contractor),
  update: (id, payload) => axiosClient.patch(`/contractors/${id}`, payload).then((r) => r.data.data.contractor),
  // CONTRACTOR-role user accounts available for the "Linked User Account" picker.
  // Pass the contractor's id in edit mode so its current link is included.
  eligibleUsers: (contractorId) =>
    axiosClient.get('/contractors/eligible-users', { params: contractorId ? { contractorId } : {} })
      .then((r) => r.data.data.users),
  assignProject: (id, projectId) =>
    axiosClient.post(`/contractors/${id}/assign-project`, { project_id: projectId }).then((r) => r.data.data.project),
  assignSite: (id, siteId) =>
    axiosClient.post(`/contractors/${id}/assign-site`, { site_id: siteId }).then((r) => r.data.data.site),
  // Contractor Documents
  uploadDocuments: (id, formData) =>
    axiosClient.post(`/contractors/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data.data.documents),
  listDocuments: (id) =>
    axiosClient.get(`/contractors/${id}/documents`).then((r) => r.data.data.documents),
  deleteDocument: (contractorId, docId) =>
    axiosClient.delete(`/contractors/${contractorId}/documents/${docId}`).then((r) => r.data.data),
  // Financial Summary
  financialSummary: (id) =>
    axiosClient.get(`/contractors/${id}/financial-summary`).then((r) => r.data.data.summary),
};

export default contractorsApi;
