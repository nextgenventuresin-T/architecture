import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  RefreshCw,
  Download,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  CreditCard,
  Briefcase,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Plus,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import Badge from '../../../components/ui/Badge';
import { financeApi } from '../../../api/financeApi';
import FinanceDrilldownModal from '../../../components/finance/FinanceDrilldownModal';
import RecordVendorPaymentModal from '../../../components/finance/RecordVendorPaymentModal';
import VendorPaymentHistoryModal from '../../../components/finance/VendorPaymentHistoryModal';
import RecordClientPaymentModal from '../../../components/finance/RecordClientPaymentModal';
import GroupedActualExpensesModal from '../../../components/finance/GroupedActualExpensesModal';
import GroupedBudgetVsActualModal from '../../../components/finance/GroupedBudgetVsActualModal';
import GroupedProcurementLedgerModal from '../../../components/finance/GroupedProcurementLedgerModal';
import ProcurementLedgerPanel from '../../../components/finance/ProcurementLedgerPanel';
import GroupedVendorPayablesModal from '../../../components/finance/GroupedVendorPayablesModal';

export default function FinanceDashboardPage({ initialTab = 'project-costs' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [projectCosts, setProjectCosts] = useState([]);
  const [actualExpenses, setActualExpenses] = useState({ rows: [], total: 0, totalAmount: 0 });
  const [budgetVsActual, setBudgetVsActual] = useState([]);
  const [procurementLedger, setProcurementLedger] = useState({ rows: [], total: 0 });
  const [vendorPayables, setVendorPayables] = useState({ rows: [], summary: {}, total: 0 });
  const [clientPayments, setClientPayments] = useState({ rows: [], summary: {}, total: 0 });
  const [profitability, setProfitability] = useState({ rows: [], summary: {} });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Drilldown Modal
  const [drilldownModal, setDrilldownModal] = useState({
    isOpen: false,
    title: '',
    subtitle: '',
    params: null,
  });

  // Grouped View Modals
  const [groupedExpenseModal, setGroupedExpenseModal] = useState({ isOpen: false, group: null });
  const [groupedBudgetModal, setGroupedBudgetModal] = useState({ isOpen: false, group: null });
  const [groupedLedgerModal, setGroupedLedgerModal] = useState({ isOpen: false, group: null });
  const [groupedVendorModal, setGroupedVendorModal] = useState({ isOpen: false, group: null });

  // View Mode Toggles (defaults to 'grouped' to group repeated Project/Site/Vendor entries)
  const [actualExpensesViewMode, setActualExpensesViewMode] = useState('grouped');
  const [budgetVsActualViewMode, setBudgetVsActualViewMode] = useState('grouped');
  const [procurementLedgerViewMode, setProcurementLedgerViewMode] = useState('grouped');
  const [vendorPayablesViewMode, setVendorPayablesViewMode] = useState('grouped');

  // Action Modals
  const [vendorPaymentModal, setVendorPaymentModal] = useState({ isOpen: false, request: null });
  const [vendorHistoryModal, setVendorHistoryModal] = useState({ isOpen: false, requestId: null, vendorName: '' });
  const [clientPaymentModal, setClientPaymentModal] = useState({ isOpen: false, project: null });

  // Load active tab data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'project-costs') {
        const data = await financeApi.projectCosts();
        setProjectCosts(Array.isArray(data) ? data : []);
      } else if (activeTab === 'actual-expenses') {
        const data = await financeApi.actualExpenses({
          category: categoryFilter,
          search: searchTerm,
          pageSize: 50,
        });
        setActualExpenses(data || { rows: [], total: 0 });
      } else if (activeTab === 'budget-vs-actual') {
        const data = await financeApi.budgetVsActual();
        setBudgetVsActual(Array.isArray(data) ? data : []);
      } else if (activeTab === 'procurement-ledger') {
        // The typed Debit/Credit ledger loads itself (ProcurementLedgerPanel).
      } else if (activeTab === 'vendor-payables') {
        const data = await financeApi.vendorPayables({
          search: searchTerm,
          status: statusFilter,
          pageSize: 50,
        });
        setVendorPayables(data || { rows: [], summary: {}, total: 0 });
      } else if (activeTab === 'client-payments') {
        const data = await financeApi.clientPaymentsSummary({ search: searchTerm });
        setClientPayments(data || { rows: [], summary: {}, total: 0 });
      } else if (activeTab === 'profitability') {
        const data = await financeApi.profitabilitySummary({ search: searchTerm });
        setProfitability(data || { rows: [], summary: {} });
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, categoryFilter, statusFilter, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clickable cell handler
  const handleCellClick = (title, subtitle, params) => {
    setDrilldownModal({
      isOpen: true,
      title,
      subtitle,
      params,
    });
  };

  // CSV Export utility
  const exportToCSV = (filename, headers, rows) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        headers.join(','),
        ...rows.map((row) =>
          row
            .map((val) => {
              const str = String(val ?? '').replace(/"/g, '""');
              return `"${str}"`;
            })
            .join(',')
        ),
      ].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 1. Grouped Actual Expenses by Site & Project
  const groupedActualExpenses = useMemo(() => {
    const map = new Map();
    (actualExpenses.rows || []).forEach((r) => {
      const key = `${r.projectId || 0}_${r.siteId || 'none'}_${r.projectName}_${r.siteName}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          projectId: r.projectId,
          siteId: r.siteId,
          projectName: r.projectName,
          siteName: r.siteName,
          materialCost: 0,
          labourCost: 0,
          machinesToolsCost: 0,
          miscCost: 0,
          totalAmount: 0,
          rows: [],
        });
      }
      const g = map.get(key);
      const amt = Number(r.amount || 0);
      g.totalAmount += amt;
      g.rows.push(r);
      const cat = (r.categoryType || r.category || '').toLowerCase();
      if (cat.includes('material')) g.materialCost += amt;
      else if (cat.includes('labour')) g.labourCost += amt;
      else if (cat.includes('machine') || cat.includes('tool')) g.machinesToolsCost += amt;
      else if (cat.includes('misc')) g.miscCost += amt;
      else g.miscCost += amt;
    });
    return Array.from(map.values());
  }, [actualExpenses.rows]);

  // 2. Grouped Budget vs Actual by Site & Project
  const groupedBudgetVsActual = useMemo(() => {
    const map = new Map();
    (budgetVsActual || []).forEach((t) => {
      const key = `${t.projectId || 0}_${t.siteId || 'none'}_${t.projectName}_${t.siteName}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          projectId: t.projectId,
          siteId: t.siteId,
          projectName: t.projectName,
          siteName: t.siteName,
          totalBudget: 0,
          totalActual: 0,
          materialBudget: 0,
          materialActual: 0,
          labourBudget: 0,
          labourActual: 0,
          machineBudget: 0,
          machineActual: 0,
          miscBudget: 0,
          miscActual: 0,
          tasks: [],
        });
      }
      const g = map.get(key);
      g.totalBudget += Number(t.totalBudget || 0);
      g.totalActual += Number(t.totalActual || 0);
      g.materialBudget += Number(t.materialBudget || 0);
      g.materialActual += Number(t.materialActual || 0);
      g.labourBudget += Number(t.labourBudget || 0);
      g.labourActual += Number(t.labourActual || 0);
      g.machineBudget += Number(t.machineBudget || 0);
      g.machineActual += Number(t.machineActual || 0);
      g.miscBudget += Number(t.miscBudget || 0);
      g.miscActual += Number(t.miscActual || 0);
      g.tasks.push(t);
    });
    return Array.from(map.values()).map((g) => ({
      ...g,
      variance: Number((g.totalBudget - g.totalActual).toFixed(2)),
      utilization: g.totalBudget > 0 ? Number(((g.totalActual / g.totalBudget) * 100).toFixed(1)) : 0,
    }));
  }, [budgetVsActual]);

  // 3. Grouped Procurement Ledger by Site & Project
  const groupedProcurementLedger = useMemo(() => {
    const map = new Map();
    (procurementLedger.rows || []).forEach((r) => {
      const key = `${r.projectId || 0}_${r.siteId || 'none'}_${r.projectName}_${r.siteName}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          projectId: r.projectId,
          siteId: r.siteId,
          projectName: r.projectName,
          siteName: r.siteName,
          totalDebit: 0,
          totalCredit: 0,
          totalTransactions: 0,
          rows: [],
        });
      }
      const g = map.get(key);
      const debit = Number(r.debit?.amount || 0);
      const credit = Number(r.credit?.amount || 0);
      if (debit > 0 || credit > 0 || Number(r.totalAmount || 0) > 0) {
        g.totalDebit += debit;
        g.totalCredit += credit;
        g.totalTransactions += 1;
        g.rows.push(r);
      }
    });
    return Array.from(map.values()).map((g) => ({
      ...g,
      netBalance: Number((g.totalCredit - g.totalDebit).toFixed(2)),
    }));
  }, [procurementLedger.rows]);

  // 4. Grouped Vendor Payables by Vendor
  const groupedVendorPayables = useMemo(() => {
    const map = new Map();
    (vendorPayables.rows || []).forEach((r) => {
      const key = r.vendorName || 'General Vendor';
      if (!map.has(key)) {
        map.set(key, {
          key,
          vendorName: key,
          phone: r.phone || '-',
          billsCount: 0,
          totalPurchases: 0,
          totalPaid: 0,
          totalDue: 0,
          bills: [],
        });
      }
      const g = map.get(key);
      const tot = Number(r.totalAmount || 0);
      const paid = Number(r.amountPaid || 0);
      const due = Number(r.amountDue || 0);
      if (tot > 0 || paid > 0 || due > 0) {
        g.billsCount += 1;
        g.totalPurchases += tot;
        g.totalPaid += paid;
        g.totalDue += due;
        g.bills.push(r);
      }
    });
    return Array.from(map.values());
  }, [vendorPayables.rows]);

  const tabs = [
    { id: 'project-costs', label: '1. Project Cost Summary' },
    { id: 'actual-expenses', label: '2. Actual Expenses' },
    { id: 'budget-vs-actual', label: '3. Budget vs Actual' },
    { id: 'procurement-ledger', label: '4. Procurement (Debit/Credit)' },
    { id: 'vendor-payables', label: '5. Vendor Payables' },
    { id: 'client-payments', label: '6. Client Payments' },
    { id: 'profitability', label: '7. Profitability / Financial Summary' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance Management"
        description="Complete project financial audit, budget vs actuals, real expense ledgers, and cash flow."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Finance' }]}
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Tabs navigation bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex overflow-x-auto space-x-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSearchTerm('');
            }}
            className={`px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors flex items-center ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* =========================================================================
          TAB 1: PROJECT COST SUMMARY
         ========================================================================= */}
      {activeTab === 'project-costs' && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-800">Project Cost Summary</h2>
              <p className="text-xs text-slate-500">
                Project-wise itemized actuals vs estimated budget. Click any amount to drill down.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                exportToCSV(
                  'Project_Cost_Summary',
                  [
                    'Project',
                    'Code',
                    'Site',
                    'Material Cost',
                    'Labour Cost',
                    'Machine Cost',
                    'Misc Cost',
                    'Total Actual',
                    'Budget',
                    'Remaining',
                    'Utilization %',
                  ],
                  projectCosts.map((r) => [
                    r.projectName,
                    r.projectCode,
                    r.siteName,
                    r.materialCost,
                    r.labourCost,
                    r.machineToolCost,
                    r.miscCost,
                    r.totalActualCost,
                    r.budget,
                    r.remainingBudget,
                    r.utilization,
                  ])
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel/CSV
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : projectCosts.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No project cost records found. Create projects and log daily work to populate.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Project</th>
                    <th className="px-3 py-2.5 text-left">Site</th>
                    <th className="px-3 py-2.5 text-right">Material Cost</th>
                    <th className="px-3 py-2.5 text-right">Labour Cost</th>
                    <th className="px-3 py-2.5 text-right">Machine/Tool Cost</th>
                    <th className="px-3 py-2.5 text-right">Misc Cost</th>
                    <th className="px-3 py-2.5 text-right bg-slate-200">Total Actual Cost</th>
                    <th className="px-3 py-2.5 text-right">Planned Budget</th>
                    <th className="px-3 py-2.5 text-right">Remaining Budget</th>
                    <th className="px-3 py-2.5 text-center">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white font-mono">
                  {projectCosts.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 font-sans font-medium text-slate-900 whitespace-nowrap">
                        {r.projectName} <span className="text-xs text-slate-400">({r.projectCode})</span>
                      </td>
                      <td className="px-3 py-2 font-sans text-slate-600 whitespace-nowrap">{r.siteName}</td>
                      <td
                        onClick={() =>
                          handleCellClick(
                            `Material Cost Details: ${r.projectName}`,
                            `Site: ${r.siteName}`,
                            { type: 'material', projectId: r.projectId, siteId: r.siteId }
                          )
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                        title="Click to view material transactions"
                      >
                        ₹{r.materialCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(
                            `Labour Cost Details: ${r.projectName}`,
                            `Site: ${r.siteName}`,
                            { type: 'labour', projectId: r.projectId, siteId: r.siteId }
                          )
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                        title="Click to view worker logs"
                      >
                        ₹{r.labourCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(
                            `Machine / Tool Details: ${r.projectName}`,
                            `Site: ${r.siteName}`,
                            { type: 'machine', projectId: r.projectId, siteId: r.siteId }
                          )
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                        title="Click to view machine/tool logs"
                      >
                        ₹{r.machineToolCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(
                            `Miscellaneous Expenses: ${r.projectName}`,
                            `Site: ${r.siteName}`,
                            { type: 'misc', projectId: r.projectId, siteId: r.siteId }
                          )
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                        title="Click to view misc expenses"
                      >
                        ₹{r.miscCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(
                            `Total Expenses: ${r.projectName}`,
                            `Site: ${r.siteName}`,
                            { projectId: r.projectId, siteId: r.siteId }
                          )
                        }
                        className="px-3 py-2 text-right font-bold text-slate-900 bg-slate-50 cursor-pointer hover:underline"
                        title="Click to view all expenses"
                      >
                        ₹{r.totalActualCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600 font-sans">
                        ₹{r.budget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold font-sans ${
                          r.remainingBudget > 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        ₹{r.remainingBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            r.utilization > 100
                              ? 'bg-red-100 text-red-800'
                              : r.utilization >= 90
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {r.utilization}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* =========================================================================
          TAB 2: ACTUAL EXPENSES
         ========================================================================= */}
      {activeTab === 'actual-expenses' && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-800">Actual Expenses Ledger</h2>
              <p className="text-xs text-slate-500">
                Verified expenses logged by Contractors and PMs from real site operations.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  exportToCSV(
                    'Actual_Expenses',
                    [
                      'Date',
                      'Project',
                      'Site',
                      'Task',
                      'Category',
                      'Material',
                      'Quantity',
                      'Cost/Unit',
                      'Labour',
                      'Machines',
                      'Misc',
                      'Amount',
                      'Updated By',
                      'Source Transaction',
                    ],
                    actualExpenses.rows.map((r) => [
                      r.date ? String(r.date).slice(0, 10) : '',
                      r.projectName,
                      r.siteName,
                      r.taskName,
                      r.category,
                      r.material,
                      r.quantity,
                      r.costPerUnit,
                      r.labour,
                      r.machinesTools,
                      r.miscellaneous,
                      r.amount,
                      r.updatedBy,
                      r.sourceTransaction,
                    ])
                  )
                }
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel/CSV
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center space-x-1.5 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search material, worker, transaction..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-slate-600">Category:</span>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8 text-xs py-0"
              >
                <option value="all">All Categories</option>
                <option value="material">Material</option>
                <option value="labour">Labour</option>
                <option value="machines_tools">Machines/Tools</option>
                <option value="miscellaneous">Miscellaneous</option>
              </Select>
            </div>
            {/* View Mode Toggle: Grouped by Site vs All Transactions */}
            <div className="flex items-center bg-white border border-slate-300 rounded p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActualExpensesViewMode('grouped')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  actualExpensesViewMode === 'grouped'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grouped by Site
              </button>
              <button
                type="button"
                onClick={() => setActualExpensesViewMode('flat')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  actualExpensesViewMode === 'flat'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Transactions
              </button>
            </div>
            <div className="ml-auto font-bold text-slate-800 text-xs bg-white px-3 py-1.5 rounded border border-slate-200">
              Total: ₹{Number(actualExpenses.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : actualExpenses.rows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No matching expense transactions found.
            </div>
          ) : actualExpensesViewMode === 'grouped' ? (
            /* Grouped View by Site */
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Project / Site</th>
                    <th className="px-3 py-2.5 text-center">Entries</th>
                    <th className="px-3 py-2.5 text-right font-mono">Material (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono">Labour (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono">Machines/Tools (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono">Miscellaneous (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono bg-slate-200 font-bold">Total Actual (₹)</th>
                    <th className="px-3 py-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {groupedActualExpenses.map((g) => (
                    <tr key={g.key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-slate-900 font-medium whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{g.siteName || 'Central / Unassigned Site'}</div>
                        <div className="text-[11px] text-slate-400">{g.projectName}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">
                          {g.rows.length} {g.rows.length === 1 ? 'entry' : 'entries'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                        ₹{g.materialCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                        ₹{g.labourCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                        ₹{g.machinesToolsCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                        ₹{g.miscCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 bg-slate-50 whitespace-nowrap">
                        ₹{g.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setGroupedExpenseModal({ isOpen: true, group: g })}
                          className="inline-flex items-center space-x-1"
                        >
                          <span>View Details</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Flat view */
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Date</th>
                    <th className="px-3 py-2.5 text-left">Project / Site</th>
                    <th className="px-3 py-2.5 text-left">Task</th>
                    <th className="px-3 py-2.5 text-left">Category</th>
                    <th className="px-3 py-2.5 text-left">Material / Item</th>
                    <th className="px-3 py-2.5 text-right">Quantity</th>
                    <th className="px-3 py-2.5 text-right">Cost/Unit (₹)</th>
                    <th className="px-3 py-2.5 text-left">Labour Details</th>
                    <th className="px-3 py-2.5 text-left">Machines/Tools</th>
                    <th className="px-3 py-2.5 text-left">Miscellaneous</th>
                    <th className="px-3 py-2.5 text-right bg-slate-200">Amount (₹)</th>
                    <th className="px-3 py-2.5 text-left">Updated By</th>
                    <th className="px-3 py-2.5 text-left">Source Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {actualExpenses.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {r.date ? String(r.date).slice(0, 10) : '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-800 whitespace-nowrap font-medium">
                        {r.projectName} <span className="text-slate-400">({r.siteName})</span>
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.taskName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.categoryType === 'material'
                              ? 'bg-blue-100 text-blue-800'
                              : r.categoryType === 'labour'
                              ? 'bg-amber-100 text-amber-800'
                              : r.categoryType === 'machines_tools'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {r.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{r.material}</td>
                      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap font-mono">
                        {r.quantity != null ? `${r.quantity} ${r.unit}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap font-mono">
                        {r.costPerUnit != null ? `₹${r.costPerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[150px] truncate" title={r.labour}>
                        {r.labour}
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[150px] truncate" title={r.machinesTools}>
                        {r.machinesTools}
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[150px] truncate" title={r.miscellaneous}>
                        {r.miscellaneous}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(
                            `Transaction Detail: ${r.sourceTransaction}`,
                            `${r.category} - ${r.projectName}`,
                            { type: r.categoryType, projectId: r.projectId, siteId: r.siteId, taskId: r.taskId }
                          )
                        }
                        className="px-3 py-2 text-right font-bold text-slate-900 font-mono bg-slate-50 cursor-pointer hover:underline hover:text-blue-700"
                        title="Click to drill down"
                      >
                        ₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.updatedBy}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-blue-600 whitespace-nowrap">
                        {r.sourceTransaction}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* =========================================================================
          TAB 3: BUDGET VS ACTUAL
         ========================================================================= */}
      {activeTab === 'budget-vs-actual' && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-800">Budget vs Actual Comparison</h2>
              <p className="text-xs text-slate-500">
                Granular Task & Category budget variance analysis with approval tracking.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {/* View Mode Toggle: Grouped by Site vs All Tasks */}
              <div className="flex items-center bg-white border border-slate-300 rounded p-0.5 text-xs font-sans">
                <button
                  type="button"
                  onClick={() => setBudgetVsActualViewMode('grouped')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    budgetVsActualViewMode === 'grouped'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Grouped by Site
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetVsActualViewMode('flat')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    budgetVsActualViewMode === 'flat'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Tasks
                </button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  exportToCSV(
                    'Budget_vs_Actual',
                    [
                      'Project',
                      'Site',
                      'Task',
                      'Material Budget',
                      'Material Actual',
                      'Labour Budget',
                      'Labour Actual',
                      'Machine Budget',
                      'Machine Actual',
                      'Misc Budget',
                      'Misc Actual',
                      'Total Budget',
                      'Total Actual',
                      'Remaining',
                      'Variance',
                      'Util %',
                      'Status',
                      'Approved Excess',
                      'Excess Reason',
                    ],
                    budgetVsActual.map((r) => [
                      r.projectName,
                      r.siteName,
                      r.taskName,
                      r.materialBudget,
                      r.materialActual,
                      r.labourBudget,
                      r.labourActual,
                      r.machineBudget,
                      r.machineActual,
                      r.miscBudget,
                      r.miscActual,
                      r.totalBudget,
                      r.totalActual,
                      r.remaining,
                      r.variance,
                      r.utilization,
                      r.status,
                      r.approvedAdditional,
                      r.excessReason,
                    ])
                  )
                }
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel/CSV
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : budgetVsActual.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No task budget records found.
            </div>
          ) : budgetVsActualViewMode === 'grouped' ? (
            /* Grouped View by Site */
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 font-sans">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Project / Site</th>
                    <th className="px-3 py-2.5 text-center">Tasks</th>
                    <th className="px-3 py-2.5 text-right">Total Budget (₹)</th>
                    <th className="px-3 py-2.5 text-right">Total Actual (₹)</th>
                    <th className="px-3 py-2.5 text-right">Net Variance (₹)</th>
                    <th className="px-3 py-2.5 text-center">Utilization</th>
                    <th className="px-3 py-2.5 text-center font-sans">Status</th>
                    <th className="px-3 py-2.5 text-center font-sans">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {groupedBudgetVsActual.map((g) => (
                    <tr key={g.key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-sans font-medium text-slate-900 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{g.siteName || 'Central / Unassigned Site'}</div>
                        <div className="text-[11px] text-slate-400">{g.projectName}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-sans">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">
                          {g.tasks.length} {g.tasks.length === 1 ? 'task' : 'tasks'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                        ₹{g.totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                        ₹{g.totalActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${
                          g.variance >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {g.variance >= 0 ? '+' : ''}₹{g.variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-sans">
                        <span className="font-semibold text-slate-800">{g.utilization}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            g.totalActual > g.totalBudget
                              ? 'bg-red-100 text-red-800'
                              : g.totalActual === g.totalBudget
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {g.totalActual > g.totalBudget
                            ? 'Over Budget'
                            : g.totalActual === g.totalBudget
                            ? 'At Budget'
                            : 'Within Budget'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-sans">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setGroupedBudgetModal({ isOpen: true, group: g })}
                          className="inline-flex items-center space-x-1"
                        >
                          <span>View Details</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Flat view */
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 font-sans">
                  <tr>
                    <th className="px-2.5 py-2 text-left">Project / Site</th>
                    <th className="px-2.5 py-2 text-left">Task</th>
                    <th className="px-2.5 py-2 text-right">Mat. Budg</th>
                    <th className="px-2.5 py-2 text-right">Mat. Act</th>
                    <th className="px-2.5 py-2 text-right">Mat. Remaining</th>
                    <th className="px-2.5 py-2 text-right">Mat. Variance</th>
                    <th className="px-2.5 py-2 text-right">Lab. Budg</th>
                    <th className="px-2.5 py-2 text-right">Lab. Act</th>
                    <th className="px-2.5 py-2 text-right">Mach. Budg</th>
                    <th className="px-2.5 py-2 text-right">Mach. Act</th>
                    <th className="px-2.5 py-2 text-right">Misc Budg</th>
                    <th className="px-2.5 py-2 text-right">Misc Act</th>
                    <th className="px-2.5 py-2 text-right bg-slate-200">Total Budg</th>
                    <th className="px-2.5 py-2 text-right bg-slate-200">Total Act</th>
                    <th className="px-2.5 py-2 text-right">Variance</th>
                    <th className="px-2.5 py-2 text-center">Status</th>
                    <th className="px-2.5 py-2 text-left">Excess / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {budgetVsActual.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-2.5 py-2 font-sans font-medium text-slate-900 whitespace-nowrap">
                        {r.projectName} <span className="text-slate-400">({r.siteName})</span>
                      </td>
                      <td className="px-2.5 py-2 font-sans text-slate-700 whitespace-nowrap">{r.taskName}</td>
                      <td className="px-2.5 py-2 text-right text-slate-600">
                        ₹{r.materialBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Material Actual: ${r.taskName}`, r.projectName, {
                            type: 'material',
                            projectId: r.projectId,
                            taskId: r.taskId,
                          })
                        }
                        className="px-2.5 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                      >
                        ₹{r.materialActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2.5 py-2 text-right text-slate-700">
                        ₹{Number(r.materialRemaining ?? r.materialBudget - r.materialActual).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-2.5 py-2 text-right font-semibold ${Number(r.materialVariance ?? r.materialBudget - r.materialActual) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {Number(r.materialVariance ?? r.materialBudget - r.materialActual) >= 0 ? '+' : ''}
                        ₹{Number(r.materialVariance ?? r.materialBudget - r.materialActual).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2.5 py-2 text-right text-slate-600">
                        ₹{r.labourBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Labour Actual: ${r.taskName}`, r.projectName, {
                            type: 'labour',
                            projectId: r.projectId,
                            taskId: r.taskId,
                          })
                        }
                        className="px-2.5 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                      >
                        ₹{r.labourActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2.5 py-2 text-right text-slate-600">
                        ₹{r.machineBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Machine Actual: ${r.taskName}`, r.projectName, {
                            type: 'machine',
                            projectId: r.projectId,
                            taskId: r.taskId,
                          })
                        }
                        className="px-2.5 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                      >
                        ₹{r.machineActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2.5 py-2 text-right text-slate-600">
                        ₹{r.miscBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Misc Actual: ${r.taskName}`, r.projectName, {
                            type: 'misc',
                            projectId: r.projectId,
                            taskId: r.taskId,
                          })
                        }
                        className="px-2.5 py-2 text-right text-blue-700 cursor-pointer hover:underline font-semibold"
                      >
                        ₹{r.miscActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2.5 py-2 text-right font-bold text-slate-900 bg-slate-50">
                        ₹{r.totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Total Task Expenses: ${r.taskName}`, r.projectName, {
                            projectId: r.projectId,
                            taskId: r.taskId,
                          })
                        }
                        className="px-2.5 py-2 text-right font-bold text-slate-900 bg-slate-50 cursor-pointer hover:underline"
                      >
                        ₹{r.totalActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`px-2.5 py-2 text-right font-bold ${
                          r.variance >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {r.variance >= 0 ? '+' : ''}
                        ₹{r.variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2.5 py-2 text-center font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'Over Budget'
                              ? 'bg-red-100 text-red-800'
                              : r.status === 'At Budget'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 font-sans text-slate-500 max-w-xs truncate" title={r.excessReason || ''}>
                        {r.approvedAdditional > 0 && (
                          <span className="font-bold text-amber-700 mr-1 font-mono">
                            +₹{r.approvedAdditional.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        {r.excessReason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* =========================================================================
          TAB 4: PROCUREMENT FINANCE (DEBIT / CREDIT)
         ========================================================================= */}
      {activeTab === 'procurement-ledger' && <ProcurementLedgerPanel />}

      {/* =========================================================================
          TAB 5: VENDOR PAYABLES
         ========================================================================= */}
      {activeTab === 'vendor-payables' && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-800">Vendor Payables & Settlements</h2>
              <p className="text-xs text-slate-500">
                Track third-party supplier purchases, payments executed, and outstanding dues.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                exportToCSV(
                  'Vendor_Payables',
                  [
                    'Vendor',
                    'Purchase Date',
                    'Invoice/Bill',
                    'Project',
                    'Site',
                    'Material/Item',
                    'Quantity',
                    'Cost/Unit',
                    'Total Purchase',
                    'Amount Paid',
                    'Amount Due',
                    'Payment Status',
                  ],
                  vendorPayables.rows.map((r) => [
                    r.vendorName,
                    r.purchaseDate ? String(r.purchaseDate).slice(0, 10) : '',
                    r.invoiceBillNumber,
                    r.projectName,
                    r.siteName,
                    r.material,
                    r.quantity,
                    r.costPerUnit,
                    r.totalAmount,
                    r.amountPaid,
                    r.amountDue,
                    r.paymentStatus,
                  ])
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel/CSV
            </Button>
          </div>

          {/* Metric Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-xs text-slate-500 font-medium">Total Vendor Purchases</span>
              <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                ₹{Number(vendorPayables.summary?.totalVendorPurchase || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
              <span className="text-xs text-emerald-700 font-medium">Total Amount Paid</span>
              <div className="text-lg font-bold text-emerald-800 font-mono mt-0.5">
                ₹{Number(vendorPayables.summary?.totalPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
              <span className="text-xs text-amber-700 font-medium">Total Amount Outstanding (Due)</span>
              <div className="text-lg font-bold text-amber-800 font-mono mt-0.5">
                ₹{Number(vendorPayables.summary?.totalDue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center space-x-1.5 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search vendor, bill reference, material..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-slate-600">Status:</span>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 text-xs py-0"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Fully Paid</option>
              </Select>
            </div>
            {/* View Mode Toggle: Grouped by Vendor vs All Bills */}
            <div className="flex items-center bg-white border border-slate-300 rounded p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setVendorPayablesViewMode('grouped')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  vendorPayablesViewMode === 'grouped'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grouped by Vendor
              </button>
              <button
                type="button"
                onClick={() => setVendorPayablesViewMode('flat')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  vendorPayablesViewMode === 'flat'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Bills
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : vendorPayables.rows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No vendor payable records found.
            </div>
          ) : vendorPayablesViewMode === 'grouped' ? (
            /* Grouped View by Vendor */
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Vendor Name</th>
                    <th className="px-3 py-2.5 text-left">Contact / Phone</th>
                    <th className="px-3 py-2.5 text-center">Bills Count</th>
                    <th className="px-3 py-2.5 text-right font-mono">Total Purchases (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono text-emerald-700">Total Paid (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono text-amber-700">Balance Due (₹)</th>
                    <th className="px-3 py-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {groupedVendorPayables.map((g) => (
                    <tr key={g.key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                        {g.vendorName}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                        {g.phone || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">
                          {g.billsCount} {g.billsCount === 1 ? 'bill' : 'bills'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        ₹{g.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                        ₹{g.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                        ₹{g.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setGroupedVendorModal({ isOpen: true, group: g })}
                          className="inline-flex items-center space-x-1"
                        >
                          <span>View Details</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Flat view */
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Vendor</th>
                    <th className="px-3 py-2.5 text-left">Purchase Date</th>
                    <th className="px-3 py-2.5 text-left">Bill / Invoice #</th>
                    <th className="px-3 py-2.5 text-left">Project / Site</th>
                    <th className="px-3 py-2.5 text-left">Material / Item</th>
                    <th className="px-3 py-2.5 text-right">Quantity</th>
                    <th className="px-3 py-2.5 text-right">Cost/Unit</th>
                    <th className="px-3 py-2.5 text-right font-mono">Total Amount (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono text-emerald-700">Paid (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono text-amber-700">Due (₹)</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {vendorPayables.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                        {r.vendorName}
                        {r.phone && r.phone !== '-' && <div className="text-[10px] text-slate-400">{r.phone}</div>}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {r.purchaseDate ? String(r.purchaseDate).slice(0, 10) : '-'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">
                        {r.invoiceBillNumber}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {r.projectName} <span className="text-slate-400">({r.siteName})</span>
                      </td>
                      <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{r.material}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                        {r.quantity} {r.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                        ₹{r.costPerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        ₹{r.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          setVendorHistoryModal({ isOpen: true, requestId: r.id, vendorName: r.vendorName })
                        }
                        className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap cursor-pointer hover:underline"
                        title="Click to view payment history"
                      >
                        ₹{r.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                        ₹{r.amountDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.paymentStatus === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.paymentStatus === 'partially_paid'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.paymentStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap space-x-1">
                        {r.amountDue > 0 && (
                          <Button
                            size="xs"
                            onClick={() => setVendorPaymentModal({ isOpen: true, request: r })}
                          >
                            Pay
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() =>
                            setVendorHistoryModal({ isOpen: true, requestId: r.id, vendorName: r.vendorName })
                          }
                        >
                          History
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* =========================================================================
          TAB 6: CLIENT PAYMENTS
         ========================================================================= */}
      {activeTab === 'client-payments' && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-800">Client Contract Payments & Receivables</h2>
              <p className="text-xs text-slate-500">
                Monitor money received from clients across multiple projects and track remaining dues.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                exportToCSV(
                  'Client_Payments',
                  [
                    'Client Name',
                    'Project Name',
                    'Project Code',
                    'Contract Value',
                    'Amount Received',
                    'Amount Due',
                    'Status',
                    'Latest Payment Ref',
                    'Latest Payment Date',
                  ],
                  clientPayments.rows.map((r) => [
                    r.clientName,
                    r.projectName,
                    r.projectCode,
                    r.contractValue,
                    r.amountReceived,
                    r.amountDue,
                    r.paymentStatus,
                    r.latestPaymentReference,
                    r.latestPaymentDate ? String(r.latestPaymentDate).slice(0, 10) : '',
                  ])
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel/CSV
            </Button>
          </div>

          {/* Metric Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-xs text-slate-500 font-medium">Total Client Contract Revenue</span>
              <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                ₹{Number(clientPayments.summary?.totalContractValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
              <span className="text-xs text-emerald-700 font-medium">Total Amount Received</span>
              <div className="text-lg font-bold text-emerald-800 font-mono mt-0.5">
                ₹{Number(clientPayments.summary?.totalReceived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
              <span className="text-xs text-amber-700 font-medium">Total Client Receivables (Due)</span>
              <div className="text-lg font-bold text-amber-800 font-mono mt-0.5">
                ₹{Number(clientPayments.summary?.totalDue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : clientPayments.rows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No client projects found.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Client Name</th>
                    <th className="px-3 py-2.5 text-left">Project Name</th>
                    <th className="px-3 py-2.5 text-right font-mono">Contract Value (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono text-emerald-700">Amount Received (₹)</th>
                    <th className="px-3 py-2.5 text-right font-mono text-amber-700">Amount Due (₹)</th>
                    <th className="px-3 py-2.5 text-left">Latest Ref</th>
                    <th className="px-3 py-2.5 text-left">Latest Date</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {clientPayments.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{r.clientName}</td>
                      <td className="px-3 py-2 text-slate-800 whitespace-nowrap font-medium">
                        {r.projectName} <span className="text-slate-400">({r.projectCode})</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        ₹{r.contractValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        ₹{r.amountReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                        ₹{r.amountDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {r.latestPaymentReference}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {r.latestPaymentDate ? String(r.latestPaymentDate).slice(0, 10) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.paymentStatus === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.paymentStatus === 'partially_paid'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.paymentStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button
                          size="xs"
                          onClick={() => setClientPaymentModal({ isOpen: true, project: r })}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Record Receipt
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* =========================================================================
          TAB 7: PROFITABILITY / PROJECT FINANCIAL SUMMARY
         ========================================================================= */}
      {activeTab === 'profitability' && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-800">Profitability / Project Financial Summary</h2>
              <p className="text-xs text-slate-500">
                Primary executive view: Contract Revenue &minus; Planned Budget &minus; Actual Expenses = Net Profit.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                exportToCSV(
                  'Project_Profitability_Summary',
                  [
                    'Client Name',
                    'Project Name',
                    'Project Code',
                    'Contract Value (Revenue)',
                    'Estimated Budget',
                    'Actual Material',
                    'Actual Labour',
                    'Actual Machine',
                    'Actual Misc',
                    'Total Actual Expenses',
                    'Net Profit',
                    'Profit Margin %',
                    'Status',
                  ],
                  profitability.rows.map((r) => [
                    r.clientName,
                    r.projectName,
                    r.projectCode,
                    r.contractValue,
                    r.estimatedBudget,
                    r.actualMaterial,
                    r.actualLabour,
                    r.actualMachine,
                    r.actualMisc,
                    r.actualExpense,
                    r.profit,
                    r.profitMargin,
                    r.status,
                  ])
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel/CSV
            </Button>
          </div>

          {/* Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-xs text-slate-500 font-medium">Total Contract Revenue</span>
              <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                ₹{Number(profitability.summary?.totalRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-xs text-slate-500 font-medium">Planned Budget</span>
              <div className="text-base font-bold text-slate-700 font-mono mt-0.5">
                ₹{Number(profitability.summary?.totalBudget || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-xs text-slate-500 font-medium">Actual Expenses</span>
              <div className="text-base font-bold text-red-700 font-mono mt-0.5">
                ₹{Number(profitability.summary?.totalActual || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
              <span className="text-xs text-emerald-800 font-medium">Net Profit (Margin)</span>
              <div className="text-base font-bold text-emerald-800 font-mono mt-0.5">
                ₹{Number(profitability.summary?.totalProfit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                <span className="text-xs font-normal ml-1">({profitability.summary?.overallMargin || 0}%)</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : profitability.rows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No profitability records found.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 font-sans">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Client Name</th>
                    <th className="px-3 py-2.5 text-left">Project Name</th>
                    <th className="px-3 py-2.5 text-right">Contract Value</th>
                    <th className="px-3 py-2.5 text-right">Planned Budget</th>
                    <th className="px-3 py-2.5 text-right">Material Act</th>
                    <th className="px-3 py-2.5 text-right">Labour Act</th>
                    <th className="px-3 py-2.5 text-right">Machine Act</th>
                    <th className="px-3 py-2.5 text-right">Misc Act</th>
                    <th className="px-3 py-2.5 text-right bg-slate-200 font-bold">Total Expenses</th>
                    <th className="px-3 py-2.5 text-right bg-emerald-50 font-bold text-emerald-800">Net Profit</th>
                    <th className="px-3 py-2.5 text-center font-sans">Margin</th>
                    <th className="px-3 py-2.5 text-center font-sans">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {profitability.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-sans font-semibold text-slate-900 whitespace-nowrap">
                        {r.clientName}
                      </td>
                      <td className="px-3 py-2 font-sans text-slate-800 whitespace-nowrap font-medium">
                        {r.projectName} <span className="text-slate-400">({r.projectCode})</span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap">
                        ₹{r.contractValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">
                        ₹{r.estimatedBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Material Cost: ${r.projectName}`, r.clientName, {
                            type: 'material',
                            projectId: r.projectId,
                          })
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline whitespace-nowrap"
                      >
                        ₹{r.actualMaterial.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Labour Cost: ${r.projectName}`, r.clientName, {
                            type: 'labour',
                            projectId: r.projectId,
                          })
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline whitespace-nowrap"
                      >
                        ₹{r.actualLabour.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Machine Cost: ${r.projectName}`, r.clientName, {
                            type: 'machine',
                            projectId: r.projectId,
                          })
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline whitespace-nowrap"
                      >
                        ₹{r.actualMachine.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`Misc Cost: ${r.projectName}`, r.clientName, {
                            type: 'misc',
                            projectId: r.projectId,
                          })
                        }
                        className="px-3 py-2 text-right text-blue-700 cursor-pointer hover:underline whitespace-nowrap"
                      >
                        ₹{r.actualMisc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        onClick={() =>
                          handleCellClick(`All Actual Expenses: ${r.projectName}`, r.clientName, {
                            projectId: r.projectId,
                          })
                        }
                        className="px-3 py-2 text-right font-bold text-slate-900 bg-slate-50 cursor-pointer hover:underline whitespace-nowrap"
                      >
                        ₹{r.actualExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-bold bg-emerald-50/50 whitespace-nowrap ${
                          r.profit >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {r.profit >= 0 ? '+' : ''}
                        ₹{r.profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center font-sans font-bold whitespace-nowrap">
                        <span className={r.profitMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          {r.profitMargin}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-sans whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'Profitable'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'Loss'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Drill-down Modal */}
      <FinanceDrilldownModal
        isOpen={drilldownModal.isOpen}
        onClose={() => setDrilldownModal((prev) => ({ ...prev, isOpen: false }))}
        title={drilldownModal.title}
        subtitle={drilldownModal.subtitle}
        params={drilldownModal.params}
      />

      {/* Record Vendor Payment Modal */}
      <RecordVendorPaymentModal
        isOpen={vendorPaymentModal.isOpen}
        onClose={() => setVendorPaymentModal({ isOpen: false, request: null })}
        request={vendorPaymentModal.request}
        onSuccess={loadData}
      />

      {/* Vendor Payment History Modal */}
      <VendorPaymentHistoryModal
        isOpen={vendorHistoryModal.isOpen}
        onClose={() => setVendorHistoryModal({ isOpen: false, requestId: null, vendorName: '' })}
        procurementRequestId={vendorHistoryModal.requestId}
        vendorName={vendorHistoryModal.vendorName}
      />

      {/* Record Client Payment Modal */}
      <RecordClientPaymentModal
        isOpen={clientPaymentModal.isOpen}
        onClose={() => setClientPaymentModal({ isOpen: false, project: null })}
        project={clientPaymentModal.project}
        onSuccess={loadData}
      />

      {/* Grouped Details Modals */}
      <GroupedActualExpensesModal
        isOpen={groupedExpenseModal.isOpen}
        onClose={() => setGroupedExpenseModal({ isOpen: false, group: null })}
        group={groupedExpenseModal.group}
        onExportCSV={exportToCSV}
      />

      <GroupedBudgetVsActualModal
        isOpen={groupedBudgetModal.isOpen}
        onClose={() => setGroupedBudgetModal({ isOpen: false, group: null })}
        group={groupedBudgetModal.group}
        onExportCSV={exportToCSV}
      />

      <GroupedProcurementLedgerModal
        isOpen={groupedLedgerModal.isOpen}
        onClose={() => setGroupedLedgerModal({ isOpen: false, group: null })}
        group={groupedLedgerModal.group}
        onExportCSV={exportToCSV}
      />

      <GroupedVendorPayablesModal
        isOpen={groupedVendorModal.isOpen}
        onClose={() => setGroupedVendorModal({ isOpen: false, group: null })}
        group={groupedVendorModal.group}
        onExportCSV={exportToCSV}
        onRecordPayment={(bill) => setVendorPaymentModal({ isOpen: true, request: bill })}
      />
    </div>
  );
}
