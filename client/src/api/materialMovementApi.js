import axiosClient from './axiosClient';

/**
 * Contractor material-movement lifecycle (SEND -> IN TRANSIT -> RECEIVE).
 *   GET  /material-movements            history (role-scoped)
 *   GET  /material-movements/incoming   in-transit shipments addressed to me
 *   GET  /material-movements/:id        one shipment
 *   POST /material-movements/send       issue source stock, create in-transit
 *   POST /material-movements/:id/receive  receive into destination, complete
 */
export const materialMovementApi = {
  list: (params) => axiosClient.get('/material-movements', { params }).then((r) => r.data.data.movements),
  incoming: () => axiosClient.get('/material-movements/incoming').then((r) => r.data.data.movements),
  stock: () => axiosClient.get('/material-movements/stock').then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/material-movements/${id}`).then((r) => r.data.data.movement),
  send: (payload) => axiosClient.post('/material-movements/send', payload).then((r) => r.data.data.movement),
  receive: (id, payload = {}) => axiosClient.post(`/material-movements/${id}/receive`, payload).then((r) => r.data.data.movement),
};

export default materialMovementApi;
