import axiosClient from './axiosClient';

/**
 * Every warehouse list/detail/movement call. Components never touch axios
 * directly. Mirrors the Interface 8 API exactly:
 *   GET  /warehouse                     warehouse list (search, filters, pagination)
 *   GET  /warehouse/lookups             warehouses, materials, projects, locations,
 *                                       pending procurement receipts, summary
 *   GET  /warehouse/summary             headline stock figures
 *   GET  /warehouse/stock               stock rows (filterable)
 *   GET  /warehouse/stock/project-site  stock grouped project -> site -> material
 *   GET  /warehouse/transactions        movement history
 *   GET  /warehouse/:id                 warehouse detail + stock + alerts + recent
 *   POST /warehouse                     create
 *   PUT  /warehouse/:id                 update
 *   POST /warehouse/stock/receipt|issue|transfer|adjustment
 */
export const warehouseApi = {
  list: (params) => axiosClient.get('/warehouse', { params }).then((r) => r.data.data),
  lookups: () => axiosClient.get('/warehouse/lookups').then((r) => r.data.data),
  summary: () => axiosClient.get('/warehouse/summary').then((r) => r.data.data.summary),
  detail: (id, params) => axiosClient.get(`/warehouse/${id}`, { params }).then((r) => r.data.data),
  create: (payload) => axiosClient.post('/warehouse', payload).then((r) => r.data.data.warehouse),
  update: (id, payload) => axiosClient.put(`/warehouse/${id}`, payload).then((r) => r.data.data.warehouse),

  stock: (params) => axiosClient.get('/warehouse/stock', { params }).then((r) => r.data.data),
  scopes: () => axiosClient.get('/warehouse/scopes').then((r) => r.data.data),
  centralOverview: (params) =>
    axiosClient.get('/warehouse/central-overview', { params }).then((r) => r.data.data),
  contractorTransactions: (params) =>
    axiosClient.get('/warehouse/contractor-transactions', { params }).then((r) => r.data.data),
  projectSiteStock: (params) =>
    axiosClient.get('/warehouse/stock/project-site', { params }).then((r) => r.data.data),
  transactions: (params) => axiosClient.get('/warehouse/transactions', { params }).then((r) => r.data.data),
  usageOverview: (id, params) =>
    axiosClient.get(`/warehouse/${id}/usage-overview`, { params }).then((r) => r.data.data),

  receive: (payload) => axiosClient.post('/warehouse/stock/receipt', payload).then((r) => r.data.data.transaction),
  issue: (payload) => axiosClient.post('/warehouse/stock/issue', payload).then((r) => r.data.data.transaction),
  transfer: (payload) => axiosClient.post('/warehouse/stock/transfer', payload).then((r) => r.data.data.transaction),
  adjust: (payload) => axiosClient.post('/warehouse/stock/adjustment', payload).then((r) => r.data.data.transaction),
};

export default warehouseApi;
