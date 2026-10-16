import axiosClient from './axiosClient';

/** Company labour (registered by Admin), its attendance, and the labour reports. */
export const labourApi = {
  // Contractor / PM: company labour picker (name + phone only).
  companyLookup: () => axiosClient.get('/labour/company-workers/lookup').then((r) => r.data.data.workers),
  // Contractor: days worked and wages on their own sites.
  myReport: (params) => axiosClient.get('/labour/report/mine', { params }).then((r) => r.data.data),

  // Admin / HR
  workers: (params) => axiosClient.get('/labour/company-workers', { params }).then((r) => r.data.data.workers),
  worker: (id) => axiosClient.get(`/labour/company-workers/${id}`).then((r) => r.data.data),
  createWorker: (payload) => axiosClient.post('/labour/company-workers', payload).then((r) => r.data.data.worker),
  updateWorker: (id, payload) => axiosClient.patch(`/labour/company-workers/${id}`, payload).then((r) => r.data.data.worker),
  attendance: (params) => axiosClient.get('/labour/company-attendance', { params }).then((r) => r.data.data),
  markAttendance: (payload) => axiosClient.post('/labour/company-attendance', payload).then((r) => r.data.data),
  deleteAttendance: (id) => axiosClient.delete(`/labour/company-attendance/${id}`).then((r) => r.data.data),
  report: (params) => axiosClient.get('/labour/report', { params }).then((r) => r.data.data),
};

export default labourApi;
