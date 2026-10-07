import axiosClient from './axiosClient';

/**
 * Every Reports & Analytics (Interface 13) call. Components never touch axios
 * directly. This module owns no data of its own — every endpoint here reads
 * straight from the module that already owns that data (projects, sites,
 * contractors, employees, materials, procurement, warehouse, finance), with
 * server-side scoping so a signed-in CONTRACTOR only ever gets their own
 * projects/sites/contractor record/payments back, whatever query params are
 * sent. Mirrors server/src/routes/reportRoutes.js exactly.
 */
export const reportsApi = {
  dashboard: () => axiosClient.get('/reports/dashboard').then((r) => r.data.data),

  projects: (params) => axiosClient.get('/reports/projects', { params }).then((r) => r.data.data),
  sites: (params) => axiosClient.get('/reports/sites', { params }).then((r) => r.data.data),

  contractors: (params) => axiosClient.get('/reports/contractors', { params }).then((r) => r.data.data),
  contractorDetail: (id) => axiosClient.get(`/reports/contractors/${id}`).then((r) => r.data.data),

  employees: (params) => axiosClient.get('/reports/employees', { params }).then((r) => r.data.data),
  materials: (params) => axiosClient.get('/reports/materials', { params }).then((r) => r.data.data),
  procurement: (params) => axiosClient.get('/reports/procurement', { params }).then((r) => r.data.data),

  warehouseStock: (params) => axiosClient.get('/reports/warehouse/stock', { params }).then((r) => r.data.data),
  warehouseTransactions: (params) =>
    axiosClient.get('/reports/warehouse/transactions', { params }).then((r) => r.data.data),

  expenses: (params) => axiosClient.get('/reports/finance/expenses', { params }).then((r) => r.data.data),
  contractorPayments: (params) =>
    axiosClient.get('/reports/finance/contractor-payments', { params }).then((r) => r.data.data),
  projectFinancials: (params) => axiosClient.get('/reports/finance/projects', { params }).then((r) => r.data.data),
};

export default reportsApi;
