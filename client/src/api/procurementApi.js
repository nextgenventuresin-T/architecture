import axiosClient from './axiosClient';

/**
 * Every procurement list/detail/write call. Components never touch axios
 * directly. Mirrors the Interface 7 Part 1 API exactly:
 *   GET/POST   /procurement            list (search, filters, pagination) / create
 *   GET        /procurement/lookups    statuses, priorities, projects, suppliers, summary
 *   GET        /procurement/:id        detail (request + receiving history)
 *   PUT        /procurement/:id        update (draft/requested only)
 *   PATCH      /procurement/:id/status plain status transitions
 *   POST       /procurement/:id/confirm source contractor confirms a transfer
 *   POST       /procurement/:id/order  approved -> ordered, stamps PO fields
 *   POST       /procurement/:id/receiving        record a delivery
 *   PUT        /procurement/:id/receiving/:receiptId  correct a receiving record
 */
export const procurementApi = {
  list: (params) => axiosClient.get('/procurement', { params }).then((r) => r.data.data),
  lookups: () => axiosClient.get('/procurement/lookups').then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/procurement/${id}`).then((r) => r.data.data),
  create: (payload) => axiosClient.post('/procurement', payload).then((r) => r.data.data.request),
  update: (id, payload) => axiosClient.put(`/procurement/${id}`, payload).then((r) => r.data.data.request),
  updateStatus: (id, status) =>
    axiosClient.patch(`/procurement/${id}/status`, { status }).then((r) => r.data.data.request),
  confirmSource: (id) => axiosClient.post(`/procurement/${id}/confirm`).then((r) => r.data.data.request),
  placeOrder: (id, payload) => axiosClient.post(`/procurement/${id}/order`, payload).then((r) => r.data.data.request),
  fulfil: (id, payload = {}) => axiosClient.post(`/procurement/${id}/fulfil`, payload).then((r) => r.data.data),
  // Machine requests: allocate a chosen serial / register a purchased or rented machine.
  toolFulfil: (id, payload = {}) => axiosClient.post(`/procurement/${id}/tool-fulfil`, payload).then((r) => r.data.data),
  dispatch: (id, payload = {}) => axiosClient.post(`/procurement/${id}/dispatch`, payload).then((r) => r.data.data),
  // Real bill/invoice file (multipart upload; authenticated blob download).
  uploadBill: (id, file) => {
    const form = new FormData();
    form.append('bill', file);
    return axiosClient.post(`/procurement/${id}/bill`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data);
  },
  billBlob: (id) => axiosClient.get(`/procurement/${id}/bill`, { responseType: 'blob' }).then((r) => r.data),
  receive: (id, payload) => axiosClient.post(`/procurement/${id}/receiving`, payload).then((r) => r.data.data),
  updateReceipt: (id, receiptId, payload) =>
    axiosClient.put(`/procurement/${id}/receiving/${receiptId}`, payload).then((r) => r.data.data),
};

export default procurementApi;
