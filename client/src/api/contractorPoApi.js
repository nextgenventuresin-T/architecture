import axiosClient from './axiosClient';

/**
 * Contractor Purchase Order and Contract API client.
 * Serves both Admin and Contractor Portal workflows.
 */
export const contractorPoApi = {
  // Admin Endpoints
  list: (params) => axiosClient.get('/contractors/pos', { params }).then((r) => r.data.data),
  listByContractor: (contractorId, params) =>
    axiosClient.get(`/contractors/${contractorId}/pos`, { params }).then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/contractors/pos/${id}`).then((r) => r.data.data.po),
  create: (contractorId, payload) =>
    axiosClient.post(`/contractors/${contractorId}/pos`, payload).then((r) => r.data.data.po),
  update: (id, payload) =>
    axiosClient.patch(`/contractors/pos/${id}`, payload).then((r) => r.data.data.po),
  send: (id) => axiosClient.post(`/contractors/pos/${id}/send`).then((r) => r.data.data.po),
  signCompany: (id, payload) =>
    axiosClient.post(`/contractors/pos/${id}/sign-company`, payload).then((r) => r.data.data.po),
  completeMilestone: (poId, milestoneId, payload) =>
    axiosClient.post(`/contractors/pos/${poId}/milestones/${milestoneId}/complete`, payload).then((r) => r.data.data.po),
  remove: (id) => axiosClient.delete(`/contractors/pos/${id}`).then((r) => r.data.data),
  timeline: (id) => axiosClient.get(`/contractors/pos/${id}/timeline`).then((r) => r.data.data.timeline),

  // PDF download URLs
  getPdfDownloadUrl: (id, signed = false) => `/api/contractors/pos/${id}/download${signed ? '?signed=true' : ''}`,

  // Contractor Portal Endpoints (/api/contractor-portal/contracts)
  portalList: (params) =>
    axiosClient.get('/contractor-portal/contracts', { params }).then((r) => {
      const data = r.data.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.pos)) return data.pos;
      return [];
    }),
  portalDetail: (id) => axiosClient.get(`/contractor-portal/contracts/${id}`).then((r) => r.data.data.po),
  portalSummary: () => axiosClient.get('/contractor-portal/contracts/summary').then((r) => r.data.data.summary),
  portalAccept: (id) => axiosClient.post(`/contractor-portal/contracts/${id}/accept`).then((r) => r.data.data.po),
  portalReject: (id, reason) =>
    axiosClient.post(`/contractor-portal/contracts/${id}/reject`, { reason }).then((r) => r.data.data.po),
  portalSign: (id, payload) =>
    axiosClient.post(`/contractor-portal/contracts/${id}/sign`, payload).then((r) => r.data.data.po),
  portalTimeline: (id) => axiosClient.get(`/contractor-portal/contracts/${id}/timeline`).then((r) => r.data.data.timeline),
  getPortalPdfDownloadUrl: (id, signed = false) =>
    `/api/contractor-portal/contracts/${id}/download${signed ? '?signed=true' : ''}`,
};

export default contractorPoApi;
