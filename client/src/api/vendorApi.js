import { fetchAllPages } from './fetchAll';
import axiosClient from './axiosClient';

export const vendorApi = {
  list: (params) => axiosClient.get('/vendors', { params }).then((r) => r.data.data),
  /** Every vendor (all pages) - for dropdowns. */
  listAll: (params = {}) => fetchAllPages(vendorApi.list, 'vendors', params, 200),
  cities: () => axiosClient.get('/vendors/cities').then((r) => r.data.data.cities),
  getById: (id) => axiosClient.get(`/vendors/${id}`).then((r) => r.data.data.vendor),
  create: (payload) => axiosClient.post('/vendors', payload).then((r) => r.data.data.vendor),
  update: (id, payload) => axiosClient.patch(`/vendors/${id}`, payload).then((r) => r.data.data.vendor),
  remove: (id) => axiosClient.delete(`/vendors/${id}`).then((r) => r.data.data),
};

export default vendorApi;
