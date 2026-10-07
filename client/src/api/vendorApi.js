import axiosClient from './axiosClient';

export const vendorApi = {
  list: (params) => axiosClient.get('/vendors', { params }).then((r) => r.data.data),
  getById: (id) => axiosClient.get(`/vendors/${id}`).then((r) => r.data.data.vendor),
  create: (payload) => axiosClient.post('/vendors', payload).then((r) => r.data.data.vendor),
  update: (id, payload) => axiosClient.patch(`/vendors/${id}`, payload).then((r) => r.data.data.vendor),
  remove: (id) => axiosClient.delete(`/vendors/${id}`).then((r) => r.data.data),
};

export default vendorApi;
