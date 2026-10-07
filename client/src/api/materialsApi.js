import axiosClient from './axiosClient';

/** Every material list/detail/write call. Components never touch axios directly. */
export const materialsApi = {
  list: (params) => axiosClient.get('/materials', { params }).then((r) => r.data.data),
  lookups: () => axiosClient.get('/materials/lookups').then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/materials/${id}`).then((r) => r.data.data),
  create: (payload) => axiosClient.post('/materials', payload).then((r) => r.data.data.material),
  update: (id, payload) => axiosClient.patch(`/materials/${id}`, payload).then((r) => r.data.data.material),
  addEntry: (id, payload) => axiosClient.post(`/materials/${id}/entries`, payload).then((r) => r.data.data),
  recordUsage: (id, entryId, usedQuantity) =>
    axiosClient.patch(`/materials/${id}/entries/${entryId}`, { used_quantity: usedQuantity }).then((r) => r.data.data),
};

export default materialsApi;
