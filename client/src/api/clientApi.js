import axiosClient from './axiosClient';

export const clientApi = {
  list: (params) => axiosClient.get('/clients', { params }).then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/clients/${id}`).then((r) => r.data.data.client),
  create: (payload) => axiosClient.post('/clients', payload).then((r) => r.data.data.client),
  update: (id, payload) => axiosClient.patch(`/clients/${id}`, payload).then((r) => r.data.data.client),
  remove: (id) => axiosClient.delete(`/clients/${id}`).then((r) => r.data.data),
  projects: (id) => axiosClient.get(`/clients/${id}/projects`).then((r) => r.data.data.projects),
};

export default clientApi;
