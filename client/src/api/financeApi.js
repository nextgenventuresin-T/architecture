import axiosClient from './axiosClient';

/**
 * Every finance call. Components never touch axios directly. Mirrors the
 * Interface 9 API exactly:
 *   GET   /finance/summary               real dashboard figures
 *   GET   /finance/lookups               projects, contractors, categories, suppliers
 *   GET   /finance/expenses              expense list (search, filters, pagination)
 *   GET   /finance/expenses/:id          expense detail
 *   POST  /finance/expenses              create
 *   PUT   /finance/expenses/:id          update
 *   PATCH /finance/expenses/:id/status   status transition
 *   GET   /finance/contractor-payments   contractor payments (Interfaces 3/4 data)
 *   GET   /finance/procurement           procurement cost view (Interface 7 data)
 *   GET   /finance/projects              per-project budget vs spend
 *   GET   /finance/payments              unified payment tracking feed
 */
export const financeApi = {
  summary: () => axiosClient.get('/finance/summary').then((r) => r.data.data.summary),
  lookups: () => axiosClient.get('/finance/lookups').then((r) => r.data.data),

  expenses: (params) => axiosClient.get('/finance/expenses', { params }).then((r) => r.data.data),
  expense: (id) => axiosClient.get(`/finance/expenses/${id}`).then((r) => r.data.data.expense),
  createExpense: (payload) =>
    axiosClient
      .post(
        '/finance/expenses',
        payload,
        payload instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
      )
      .then((r) => r.data.data.expense),
  updateExpense: (id, payload) =>
    axiosClient.put(`/finance/expenses/${id}`, payload).then((r) => r.data.data.expense),
  updateExpenseStatus: (id, status) =>
    axiosClient.patch(`/finance/expenses/${id}/status`, { status }).then((r) => r.data.data.expense),
  uploadBill: (id, file) => {
    const formData = new FormData();
    formData.append('bill', file);
    return axiosClient
      .post(`/finance/expenses/${id}/bill`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data.expense);
  },
  billUrl: (id) => `/api/finance/expenses/${id}/bill`,

  contractorPayments: (params) =>
    axiosClient.get('/finance/contractor-payments', { params }).then((r) => r.data.data),
  procurement: (params) => axiosClient.get('/finance/procurement', { params }).then((r) => r.data.data),
  projects: (params) => axiosClient.get('/finance/projects', { params }).then((r) => r.data.data),
  project: (id) => axiosClient.get(`/finance/projects/${id}`).then((r) => r.data.data.project),
  projectMaterialConsumption: (id, params) =>
    axiosClient.get(`/finance/projects/${id}/material-consumption`, { params }).then((r) => r.data.data),
  payments: (params) => axiosClient.get('/finance/payments', { params }).then((r) => r.data.data),
  contractorInventory: (contractorId) =>
    axiosClient.get('/finance/contractor-inventory', { params: { contractorId } }).then((r) => r.data.data),
  recordConsumption: (payload) =>
    axiosClient.post('/finance/contractor-consumption', payload).then((r) => r.data.data),

  // Restructured Finance Tabs
  projectCosts: (params) => axiosClient.get('/finance/project-costs', { params }).then((r) => r.data.data),
  actualExpenses: (params) => axiosClient.get('/finance/actual-expenses', { params }).then((r) => r.data.data),
  budgetVsActual: (params) => axiosClient.get('/finance/budget-vs-actual', { params }).then((r) => r.data.data),
  procurementLedger: (params) => axiosClient.get('/finance/procurement-ledger', { params }).then((r) => r.data.data),
  vendorPayables: (params) => axiosClient.get('/finance/vendor-payables', { params }).then((r) => r.data.data),
  recordVendorPayment: (payload) => axiosClient.post('/finance/vendor-payments', payload).then((r) => r.data.data),
  vendorPaymentsHistory: (id) => axiosClient.get(`/finance/vendor-payments/${id}`).then((r) => r.data.data),
  clientPaymentsSummary: (params) => axiosClient.get('/finance/client-payments', { params }).then((r) => r.data.data),
  recordClientPayment: (payload) => axiosClient.post('/finance/client-payments', payload).then((r) => r.data.data),
  clientPaymentsHistory: (params) => axiosClient.get('/finance/client-payments/history', { params }).then((r) => r.data.data),
  profitabilitySummary: (params) => axiosClient.get('/finance/profitability', { params }).then((r) => r.data.data),
  ledgerEntry: (params) => axiosClient.get('/finance/ledger-entry', { params }).then((r) => r.data.data),
  drilldownDetails: (params) => axiosClient.get('/finance/drilldown', { params }).then((r) => r.data.data),
};

export default financeApi;
