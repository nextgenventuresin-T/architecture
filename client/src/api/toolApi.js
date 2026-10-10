import axiosClient from './axiosClient';

export const toolApi = {
  list: (params) => axiosClient.get('/tools', { params }).then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/tools/${id}`).then((r) => r.data.data.tool),
  checkAvailability: (id, quantity) =>
    axiosClient.get(`/tools/${id}/availability`, { params: { quantity } }).then((r) => r.data.data),
  allocate: (id, payload) =>
    axiosClient.post(`/tools/${id}/allocate`, payload).then((r) => r.data.data),
  returnAllocation: (assignmentId) =>
    axiosClient.post(`/tools/allocations/${assignmentId}/return`).then((r) => r.data.data),
  // ---- serial-numbered physical machines
  units: (params) => axiosClient.get('/tools/units', { params }).then((r) => r.data.data),
  unit: (id) => axiosClient.get(`/tools/units/${id}`).then((r) => r.data.data),
  registerUnit: (payload) => axiosClient.post('/tools/units', payload).then((r) => r.data.data),
  updateUnit: (id, payload) => axiosClient.patch(`/tools/units/${id}`, payload).then((r) => r.data.data),
  updateHealth: (id, payload) => axiosClient.patch(`/tools/units/${id}/health`, payload).then((r) => r.data.data),
  setAvailability: (id, payload) => axiosClient.post(`/tools/units/${id}/availability`, payload).then((r) => r.data.data),
  allocateUnit: (id, payload) => axiosClient.post(`/tools/units/${id}/allocate`, payload).then((r) => r.data.data.allocation),
  transferUnit: (id, payload) => axiosClient.post(`/tools/units/${id}/transfer`, payload).then((r) => r.data.data.allocation),
  returnRental: (id, payload = {}) => axiosClient.post(`/tools/units/${id}/return-rental`, payload).then((r) => r.data.data),
  allocations: (params) => axiosClient.get('/tools/allocations', { params }).then((r) => r.data.data.allocations),
  returnUnit: (allocationId, payload = {}) =>
    axiosClient.post(`/tools/allocations/${allocationId}/return`, payload).then((r) => r.data.data.allocation),
  setCharge: (allocationId, payload) =>
    axiosClient.patch(`/tools/allocations/${allocationId}/charge`, payload).then((r) => r.data.data.allocation),
  rentals: (params) => axiosClient.get('/tools/rentals', { params }).then((r) => r.data.data.rentals),
  create: (payload) => axiosClient.post('/tools', payload).then((r) => r.data.data.tool),
  update: (id, payload) => axiosClient.patch(`/tools/${id}`, payload).then((r) => r.data.data.tool),
  remove: (id) => axiosClient.delete(`/tools/${id}`).then((r) => r.data.data),
};

export default toolApi;
