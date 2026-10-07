import axiosClient from './axiosClient';

export const toolApi = {
  list: (params) => axiosClient.get('/tools', { params }).then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/tools/${id}`).then((r) => r.data.data.tool),
  create: (payload) => axiosClient.post('/tools', payload).then((r) => r.data.data.tool),
  update: (id, payload) => axiosClient.patch(`/tools/${id}`, payload).then((r) => r.data.data.tool),
  remove: (id) => axiosClient.delete(`/tools/${id}`).then((r) => r.data.data),
};

export default toolApi;
