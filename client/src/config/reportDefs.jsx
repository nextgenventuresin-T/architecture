import { Link } from 'react-router-dom';
import {
  FolderKanban,
  MapPin,
  HardHat,
  Users,
  Package,
  ShoppingCart,
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  Receipt,
  Banknote,
  Wallet,
  ClipboardList,
  CalendarCheck,
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import reportsApi from '../api/reportsApi';
import hrApi from '../api/hrApi';
import { formatCurrency, formatDate, formatNumber } from '../utils/format';
import { PROJECT_STATUSES } from '../utils/projectOptions';
import { CONTRACTOR_STATUSES, CONTRACTOR_STATUS_TONE } from '../utils/contractorOptions';
import { EMPLOYEE_STATUSES, EMPLOYEE_STATUS_TONE } from '../utils/employeeOptions';
import { MATERIAL_STATUSES, STOCK_STATUSES, STOCK_STATUS_TONE, STOCK_STATUS_LABELS } from '../utils/materialOptions';
import { PROCUREMENT_STATUS_OPTIONS, PROCUREMENT_STATUS_TONE, PROCUREMENT_STATUS_LABELS } from '../utils/procurementOptions';
import {
  STOCK_STATUS_OPTIONS as WH_STOCK_STATUS_OPTIONS,
  STOCK_STATUS_TONE as WH_STOCK_STATUS_TONE,
  STOCK_STATUS_LABELS as WH_STOCK_STATUS_LABELS,
  TRANSACTION_TYPE_OPTIONS,
  TRANSACTION_TYPE_TONE,
  TRANSACTION_TYPE_LABELS,
  transactionSign,
} from '../utils/warehouseOptions';
import { EXPENSE_STATUS_OPTIONS, EXPENSE_STATUS_TONE, EXPENSE_STATUS_LABELS, categoryLabel } from '../utils/financeOptions';
import {
  LABOUR_REQUEST_STATUS_LABELS,
  LABOUR_REQUEST_STATUS_TONE,
  ASSIGNMENT_STATUS_TONE,
  ATTENDANCE_STATUS_TONE,
} from '../utils/hrOptions';

/**
 * One entry per drill-down table. `load(params)` always returns the raw
 * `{ [rowsKey]: [...], pagination }` envelope the matching API call
 * returns — components never reshape it further. `filters` describes which
 * of the date/project/site/contractor/status controls this report supports,
 * matching exactly what each backend model actually filters on (verified
 * against the model source, not guessed) — showing a control the API would
 * silently ignore would be worse than not showing it.
 */
export const REPORT_DEFS = {
  projects: {
    title: 'Projects',
    icon: FolderKanban,
    load: (params) => reportsApi.projects(params),
    rowsKey: 'projects',
    detailPath: (row) => `/admin/projects/${row.id}`,
    filters: [{ type: 'search' }, { type: 'status', options: PROJECT_STATUSES }, { type: 'contractor' }],
    columns: () => [
      {
        key: 'project',
        header: 'Project',
        render: (row) => (
          <div className="min-w-0">
            <Link to={`/admin/projects/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
              {row.name}
            </Link>
            <p className="mt-0.5 text-xs text-ink-subtle">{row.code}</p>
          </div>
        ),
      },
      { key: 'client', header: 'Client', render: (row) => <span className="text-ink-muted">{row.client?.name || '—'}</span> },
      { key: 'contractor', header: 'Contractor', render: (row) => <span className="text-ink-muted">{row.contractor?.name || '—'}</span> },
      { key: 'sites', header: 'Sites', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.siteCount)}</span> },
      { key: 'progress', header: 'Progress', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{row.progress ?? 0}%</span> },
      { key: 'budget', header: 'Budget', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.estimatedBudget)}</span> },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <Badge tone={row.status === 'completed' ? 'brand' : row.status === 'delayed' ? 'danger' : row.status === 'attention' ? 'warning' : row.status === 'on-hold' ? 'neutral' : 'positive'}>{PROJECT_STATUSES.find((s) => s.value === row.status)?.label ?? row.status}</Badge>,
      },
    ],
    empty: { title: 'No projects match these filters', description: 'Clear the filters to see every project.' },
  },

  sites: {
    title: 'Sites',
    icon: MapPin,
    load: (params) => reportsApi.sites(params),
    rowsKey: 'sites',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'status', options: [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'on-hold', label: 'On hold' }] }],
    columns: () => [
      {
        key: 'site',
        header: 'Site',
        render: (row) => (
          <Link to={`/admin/projects/${row.project.id}/sites/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.name}
          </Link>
        ),
      },
      { key: 'project', header: 'Project', render: (row) => <span className="text-ink-muted">{row.project.name}</span> },
      { key: 'contractor', header: 'Contractor', render: (row) => <span className="text-ink-muted">{row.contractor?.name || '—'}</span> },
      { key: 'labour', header: 'Labour', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.labourCount)}</span> },
      { key: 'progress', header: 'Progress', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{row.progress}%</span> },
      { key: 'issues', header: 'Open issues', align: 'right', render: (row) => <span className={`tabular-nums ${row.openIssues > 0 ? 'text-danger' : 'text-ink-muted'}`}>{formatNumber(row.openIssues)}</span> },
      { key: 'safety', header: 'Safety', render: (row) => <Badge tone={row.safetyStatus === 'incident' ? 'danger' : row.safetyStatus === 'caution' ? 'warning' : 'positive'}>{row.safetyStatus}</Badge> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone="neutral">{row.status}</Badge> },
    ],
    empty: { title: 'No sites match these filters', description: 'Clear the filters to see every site.' },
  },

  contractors: {
    title: 'Contractors',
    icon: HardHat,
    load: (params) => reportsApi.contractors(params),
    rowsKey: 'contractors',
    filters: [{ type: 'search' }, { type: 'status', options: CONTRACTOR_STATUSES }],
    columns: () => [
      {
        key: 'contractor',
        header: 'Contractor',
        render: (row) => (
          <Link to={`/admin/contractors/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.name}
          </Link>
        ),
      },
      { key: 'type', header: 'Type', render: (row) => <span className="text-ink-muted">{row.type}</span> },
      { key: 'projects', header: 'Projects', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.stats?.projectCount)}</span> },
      { key: 'labour', header: 'Labour', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.stats?.labourCount)}</span> },
      { key: 'contract', header: 'Contract value', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.stats?.contractValue)}</span> },
      { key: 'outstanding', header: 'Outstanding', align: 'right', render: (row) => <span className={`tabular-nums ${row.stats?.outstanding > 0 ? 'text-danger' : 'text-ink-muted'}`}>{formatCurrency(row.stats?.outstanding)}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={CONTRACTOR_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge> },
    ],
    empty: { title: 'No contractors match these filters', description: 'Clear the filters to see every contractor.' },
  },

  employees: {
    title: 'Employees',
    icon: Users,
    load: (params) => reportsApi.employees(params),
    rowsKey: 'employees',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'site' }, { type: 'status', options: EMPLOYEE_STATUSES }],
    columns: () => [
      {
        key: 'employee',
        header: 'Employee',
        render: (row) => (
          <div className="min-w-0">
            <Link to={`/admin/employees/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
              {row.fullName}
            </Link>
            <p className="mt-0.5 text-xs text-ink-subtle">{row.employeeCode}</p>
          </div>
        ),
      },
      { key: 'designation', header: 'Designation', render: (row) => <span className="text-ink-muted">{row.designation}</span> },
      { key: 'current', header: 'Current project', render: (row) => <span className="text-ink-muted">{row.current?.project?.name || row.current?.project || '—'}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={EMPLOYEE_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge> },
    ],
    empty: { title: 'No employees match these filters', description: 'Clear the filters to see every employee.' },
  },

  materials: {
    title: 'Materials',
    icon: Package,
    load: (params) => reportsApi.materials(params),
    rowsKey: 'materials',
    filters: [
      { type: 'search' },
      { type: 'project' },
      { type: 'site' },
      { type: 'select', key: 'stockStatus', label: 'Stock level', options: STOCK_STATUSES },
      { type: 'status', options: MATERIAL_STATUSES },
    ],
    columns: () => [
      {
        key: 'material',
        header: 'Material',
        render: (row) => (
          <div className="min-w-0">
            <Link to={`/admin/materials/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
              {row.name}
            </Link>
            <p className="mt-0.5 text-xs text-ink-subtle">{row.code} · {row.category}</p>
          </div>
        ),
      },
      { key: 'stock', header: 'Current stock', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.currentStock)} {row.unit}</span> },
      { key: 'value', header: 'Stock value', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.stats?.stockValue)}</span> },
      { key: 'stockStatus', header: 'Stock level', render: (row) => <Badge tone={STOCK_STATUS_TONE[row.stockStatus] ?? 'neutral'}>{STOCK_STATUS_LABELS[row.stockStatus] ?? row.stockStatus}</Badge> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone="neutral">{row.status}</Badge> },
    ],
    empty: { title: 'No materials match these filters', description: 'Clear the filters to see every material.' },
  },

  procurement: {
    title: 'Procurement requests',
    icon: ShoppingCart,
    load: (params) => reportsApi.procurement(params),
    rowsKey: 'requests',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'site' }, { type: 'select', key: 'status', label: 'Status', options: PROCUREMENT_STATUS_OPTIONS }],
    columns: () => [
      {
        key: 'request',
        header: 'Request',
        render: (row) => (
          <Link to={`/admin/procurement/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.requestNumber}
          </Link>
        ),
      },
      { key: 'material', header: 'Material', render: (row) => <span className="text-ink-muted">{row.material?.name}</span> },
      { key: 'project', header: 'Project / site', render: (row) => <div className="whitespace-nowrap"><p className="text-ink-muted">{row.project?.name}</p>{row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}</div> },
      { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.quantity)} {row.unit}</span> },
      { key: 'total', header: 'Estimated total', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.estimatedTotal)}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={PROCUREMENT_STATUS_TONE[row.status] ?? 'neutral'}>{PROCUREMENT_STATUS_LABELS[row.status] ?? row.status}</Badge> },
    ],
    empty: { title: 'No procurement requests match these filters', description: 'Clear the filters to see every request.' },
  },

  warehouseStock: {
    title: 'Warehouse stock',
    icon: WarehouseIcon,
    load: (params) => reportsApi.warehouseStock(params),
    rowsKey: 'stock',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'site' }, { type: 'select', key: 'stockStatus', label: 'Stock level', options: WH_STOCK_STATUS_OPTIONS }],
    columns: () => [
      { key: 'material', header: 'Material', render: (row) => <span className="font-medium text-ink">{row.material?.name}</span> },
      { key: 'warehouse', header: 'Warehouse', render: (row) => <Link to={`/admin/warehouse/${row.warehouse?.id}`} className="text-ink-muted hover:text-brand-700 hover:underline">{row.warehouse?.name}</Link> },
      { key: 'location', header: 'Project / site', render: (row) => <div className="whitespace-nowrap"><p className="text-ink-muted">{row.project?.name || '—'}</p>{row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}</div> },
      { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatNumber(row.quantity)} {row.unit}</span> },
      { key: 'status', header: 'Stock level', render: (row) => <Badge tone={WH_STOCK_STATUS_TONE[row.stockStatus] ?? 'neutral'}>{WH_STOCK_STATUS_LABELS[row.stockStatus] ?? row.stockStatus}</Badge> },
    ],
    empty: { title: 'No warehouse stock matches these filters', description: 'Clear the filters to see every stock line.' },
  },

  warehouseTransactions: {
    title: 'Warehouse transactions',
    icon: ArrowLeftRight,
    load: (params) => reportsApi.warehouseTransactions(params),
    rowsKey: 'transactions',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'site' }, { type: 'select', key: 'type', label: 'Type', options: TRANSACTION_TYPE_OPTIONS }, { type: 'date' }],
    columns: () => [
      {
        key: 'transaction',
        header: 'Transaction',
        render: (row) => (
          <div className="min-w-0">
            <span className="font-medium text-ink">{row.transactionNumber}</span>
            <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.createdAt)}</p>
          </div>
        ),
      },
      { key: 'material', header: 'Material', render: (row) => <span className="text-ink-muted">{row.material?.name}</span> },
      { key: 'warehouse', header: 'Warehouse', render: (row) => <span className="text-ink-muted">{row.warehouse?.name}</span> },
      { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{transactionSign(row)}{formatNumber(row.quantity)} {row.unit}</span> },
      { key: 'type', header: 'Type', render: (row) => <Badge tone={TRANSACTION_TYPE_TONE[row.type] ?? 'neutral'}>{TRANSACTION_TYPE_LABELS[row.type] ?? row.type}</Badge> },
    ],
    empty: { title: 'No transactions match these filters', description: 'Clear the filters to see every movement.' },
  },

  expenses: {
    title: 'Expenses',
    icon: Receipt,
    load: (params) => reportsApi.expenses(params),
    rowsKey: 'expenses',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'site' }, { type: 'select', key: 'status', label: 'Status', options: EXPENSE_STATUS_OPTIONS }, { type: 'date' }],
    columns: () => [
      {
        key: 'expense',
        header: 'Expense',
        render: (row) => (
          <div className="min-w-0">
            <Link to={`/admin/finance/expenses/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
              {row.expenseNumber}
            </Link>
            <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(row.date)}</p>
          </div>
        ),
      },
      { key: 'project', header: 'Project / site', render: (row) => <div className="whitespace-nowrap"><p className="text-ink-muted">{row.project?.name}</p>{row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}</div> },
      { key: 'category', header: 'Category', render: (row) => <span className="text-ink-muted">{categoryLabel(row.category)}</span> },
      { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="tabular-nums font-medium text-ink">{formatCurrency(row.amount)}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={EXPENSE_STATUS_TONE[row.status] ?? 'neutral'}>{EXPENSE_STATUS_LABELS[row.status] ?? row.status}</Badge> },
    ],
    empty: { title: 'No expenses match these filters', description: 'Clear the filters to see every expense.' },
  },

  contractorPayments: {
    title: 'Contractor payments',
    icon: Banknote,
    load: (params) => reportsApi.contractorPayments(params),
    rowsKey: 'payments',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'contractor' }, { type: 'select', key: 'status', label: 'Status', options: EXPENSE_STATUS_OPTIONS }],
    columns: () => [
      { key: 'contractor', header: 'Contractor', render: (row) => <span className="font-medium text-ink">{row.contractor?.name}</span> },
      { key: 'project', header: 'Project / site', render: (row) => <div className="whitespace-nowrap"><p className="text-ink-muted">{row.project?.name}</p>{row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}</div> },
      { key: 'contract', header: 'Contract value', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.contractValue)}</span> },
      { key: 'paid', header: 'Paid', align: 'right', render: (row) => <span className="tabular-nums font-medium text-ink">{formatCurrency(row.paidAmount)}</span> },
      { key: 'outstanding', header: 'Outstanding', align: 'right', render: (row) => <span className={`tabular-nums ${row.outstanding > 0 ? 'text-danger' : 'text-ink-muted'}`}>{formatCurrency(row.outstanding)}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={EXPENSE_STATUS_TONE[row.status] ?? 'neutral'}>{EXPENSE_STATUS_LABELS[row.status] ?? row.status}</Badge> },
    ],
    empty: { title: 'No contractor payments match these filters', description: 'Clear the filters to see every payment.' },
  },

  projectFinancials: {
    title: 'Project financials',
    icon: Wallet,
    load: (params) => reportsApi.projectFinancials(params),
    rowsKey: 'projects',
    filters: [{ type: 'search' }, { type: 'project' }],
    columns: () => [
      {
        key: 'project',
        header: 'Project',
        render: (row) => (
          <Link to={`/admin/finance/projects/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.name}
          </Link>
        ),
      },
      { key: 'budget', header: 'Budget', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.budget)}</span> },
      { key: 'spent', header: 'Spent', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.totalSpent)}</span> },
      { key: 'remaining', header: 'Remaining', align: 'right', render: (row) => <span className={`tabular-nums ${row.isOverBudget ? 'text-danger' : 'text-ink-muted'}`}>{formatCurrency(row.remainingBudget)}</span> },
      { key: 'utilisation', header: 'Utilisation', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{row.utilisation ?? '—'}{row.utilisation !== null ? '%' : ''}</span> },
    ],
    empty: { title: 'No project financials match these filters', description: 'Clear the filters to see every project.' },
  },

  // ------------------------------------------------------------------
  // Labour & workforce (Interface 11 data). No dedicated /reports list
  // endpoint exists for these — the reports dashboard KPI numbers are
  // computed straight from hrDashboardModel, so their drill-downs reuse
  // the already-built, already-scoped HR & Labour API (hrApi.js) rather
  // than inventing a parallel one. hrScope on the server applies the same
  // contractor/employee isolation there as everywhere else in HR.
  // ------------------------------------------------------------------
  labourAssignments: {
    title: 'Workforce assignments',
    icon: Users,
    load: (params) => hrApi.assignments.list(params),
    rowsKey: 'assignments',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'site' }, { type: 'contractor' }, { type: 'select', key: 'labourType', label: 'Labour type', options: [{ value: 'company', label: 'Company' }, { value: 'contractor', label: 'Contractor' }] }, { type: 'select', key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }] }],
    columns: () => [
      { key: 'worker', header: 'Worker', render: (row) => <span className="font-medium text-ink">{row.worker?.name}</span> },
      { key: 'type', header: 'Type', render: (row) => <Badge tone={row.labourType === 'company' ? 'brand' : 'warning'}>{row.labourType === 'company' ? 'Company' : 'Contractor'}</Badge> },
      { key: 'contractor', header: 'Contractor', render: (row) => <span className="text-ink-muted">{row.contractor?.name || '—'}</span> },
      { key: 'project', header: 'Project / site', render: (row) => <div className="whitespace-nowrap"><p className="text-ink-muted">{row.project?.name}</p>{row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}</div> },
      { key: 'start', header: 'Start date', render: (row) => <span className="whitespace-nowrap text-xs text-ink-subtle">{formatDate(row.startDate)}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={ASSIGNMENT_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge> },
    ],
    empty: { title: 'No assignments match these filters', description: 'Clear the filters to see the full workforce.' },
  },

  labourRequests: {
    title: 'Labour requests',
    icon: ClipboardList,
    load: (params) => hrApi.requests.list(params),
    rowsKey: 'requests',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'contractor' }, { type: 'select', key: 'status', label: 'Status', options: Object.entries(LABOUR_REQUEST_STATUS_LABELS).map(([value, label]) => ({ value, label })) }],
    columns: () => [
      { key: 'request', header: 'Request', render: (row) => <span className="font-medium text-ink">{row.requestNumber}</span> },
      { key: 'contractor', header: 'Contractor', render: (row) => <span className="text-ink-muted">{row.contractor?.name}</span> },
      { key: 'project', header: 'Project / site', render: (row) => <div className="whitespace-nowrap"><p className="text-ink-muted">{row.project?.name}</p>{row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}</div> },
      { key: 'skill', header: 'Skill', render: (row) => <span className="text-ink-muted">{row.skillCategory}</span> },
      { key: 'quantity', header: 'Quantity', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{row.assignedCount}/{row.quantity}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={LABOUR_REQUEST_STATUS_TONE[row.status] ?? 'neutral'}>{LABOUR_REQUEST_STATUS_LABELS[row.status] ?? row.status}</Badge> },
    ],
    empty: { title: 'No labour requests match these filters', description: 'Clear the filters to see every request.' },
  },

  attendance: {
    title: 'Attendance',
    icon: CalendarCheck,
    load: (params) => hrApi.attendance.list(params),
    rowsKey: 'records',
    filters: [{ type: 'search' }, { type: 'project' }, { type: 'contractor' }, { type: 'select', key: 'status', label: 'Status', options: [{ value: 'PRESENT', label: 'Present' }, { value: 'ABSENT', label: 'Absent' }, { value: 'HALF_DAY', label: 'Half day' }, { value: 'LEAVE', label: 'Leave' }] }, { type: 'date' }],
    columns: () => [
      { key: 'worker', header: 'Worker', render: (row) => <span className="font-medium text-ink">{row.worker?.name}</span> },
      { key: 'type', header: 'Type', render: (row) => <Badge tone={row.labourType === 'company' ? 'brand' : 'warning'}>{row.labourType === 'company' ? 'Company' : 'Contractor'}</Badge> },
      { key: 'project', header: 'Project / site', render: (row) => <div className="whitespace-nowrap"><p className="text-ink-muted">{row.project?.name}</p>{row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}</div> },
      { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap text-xs text-ink-subtle">{formatDate(row.date)}</span> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={ATTENDANCE_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge> },
    ],
    empty: { title: 'No attendance records match these filters', description: 'Clear the filters to see today\u2019s attendance.' },
  },
};

export const reportDefFor = (id) => REPORT_DEFS[id];
