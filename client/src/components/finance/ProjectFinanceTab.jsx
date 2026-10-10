import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Search, Package, Calculator, ArrowUpRight, Scale, CheckCircle2 } from 'lucide-react';
import DataTable from '../ui/DataTable';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import ProgressBar from '../ui/ProgressBar';
import Pagination from '../projects/Pagination';
import useAsync from '../../hooks/useAsync';
import { financeApi } from '../../api/financeApi';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';

const INITIAL = { search: '', projectId: 'all', page: 1 };

/**
 * Budget versus spend per project.
 *
 * Core Accounting Formula:
 *   Material Cost + Labour Cost + Contractor Payments + Other Expenses = Project Spend
 *   Remaining budget = project budget - total spent
 *
 * Material consumption is tracked as a distinct column linked directly to warehouse
 * ledger transactions.
 */
export default function ProjectFinanceTab({ lookups }) {
  const [filters, setFilters] = useState(INITIAL);

  // Selected project for viewing itemized material consumption drawer/modal
  const [activeProjectForConsumption, setActiveProjectForConsumption] = useState(null);
  const [consumptionRecords, setConsumptionRecords] = useState([]);
  const [loadingConsumption, setLoadingConsumption] = useState(false);

  const load = useCallback(
    () =>
      financeApi.projects({
        search: filters.search || undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        page: filters.page,
        pageSize: 10,
      }),
    [filters]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const projects = data?.projects ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));

  const openConsumptionModal = async (project) => {
    setActiveProjectForConsumption(project);
    setLoadingConsumption(true);
    try {
      const records = await financeApi.projectMaterialConsumption(project.id);
      setConsumptionRecords(records?.items || (Array.isArray(records) ? records : []));
    } catch (err) {
      console.error('Failed to load project material consumption:', err);
      setConsumptionRecords([]);
    } finally {
      setLoadingConsumption(false);
    }
  };

  const consumptionColumns = [
    {
      key: 'material',
      header: 'Material / Tool',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.materialName || row.material_name}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {(row.materialCode || row.material_code) && `${row.materialCode || row.material_code} · `}
            {row.category}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity Used',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-semibold text-amber-700">
          {formatNumber(row.quantityUsed ?? row.quantity_used)}{' '}
          <span className="text-xs font-normal text-ink-subtle">{row.unit}</span>
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Unit Rate',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">
          {formatCurrency(row.unitRate ?? row.rate)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Total Cost',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-semibold text-ink">
          {formatCurrency(row.materialCost ?? row.amount)}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Usage Date',
      render: (row) => (
        <span className="whitespace-nowrap text-ink">
          {formatDate(row.date || row.expense_date)}
        </span>
      ),
    },
    {
      key: 'site_phase',
      header: 'Task / Scope',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.taskName || row.task_name || row.phaseTitle || row.phase_name || 'General'}</p>
          <p className="text-xs text-ink-subtle">
            {row.subcategory ? `${row.subcategory} · ` : ''}
            {row.siteName || row.site_name || 'Project Site'}
          </p>
        </div>
      ),
    },
    {
      key: 'contractor',
      header: 'Contractor',
      render: (row) => (
        <span className="text-ink">{row.contractorName || row.contractor_name || '—'}</span>
      ),
    },
    {
      key: 'ref',
      header: 'Warehouse Ledger Ref',
      render: (row) => (
        <span className="font-mono text-xs text-ink-subtle">
          {row.transactionNumber || row.transaction_number || row.reference || '—'}
        </span>
      ),
    },
  ];

  const columns = [
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
    {
      key: 'budget',
      header: 'Budget',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.budget)}</span>,
    },
    {
      key: 'material',
      header: 'Material Used',
      align: 'right',
      render: (row) => {
        const val = Number(row.materialConsumptionCost || 0);
        return (
          <button
            type="button"
            onClick={() => openConsumptionModal(row)}
            className="group inline-flex items-center gap-1 tabular-nums font-semibold text-amber-700 hover:text-amber-900 hover:underline"
            title="Click to view itemized material consumption ledger"
          >
            <span>{formatCurrency(val)}</span>
            <ArrowUpRight className="h-3 w-3 opacity-60 group-hover:opacity-100" />
          </button>
        );
      },
    },
    {
      key: 'labour',
      header: 'Labour Cost',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.labourCost)}</span>,
    },
    {
      key: 'contractor',
      header: 'Contractor Payments',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.contractorPayments)}</span>,
    },
    {
      key: 'other',
      header: 'Other Expenses',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.otherExpenses)}</span>,
    },
    {
      key: 'spent',
      header: 'Total Spent',
      align: 'right',
      render: (row) => <span className="tabular-nums font-bold text-ink">{formatCurrency(row.totalSpent)}</span>,
    },
    {
      key: 'remaining',
      header: 'Remaining Budget',
      align: 'right',
      render: (row) => (
        <span className={`tabular-nums font-semibold ${row.remainingBudget < 0 ? 'text-danger' : 'text-emerald-700'}`}>
          {formatCurrency(row.remainingBudget)}
        </span>
      ),
    },
    {
      key: 'utilisation',
      header: 'Utilisation',
      render: (row) =>
        row.utilisation === null ? (
          <span className="text-xs text-ink-subtle">No budget set</span>
        ) : (
          <div className="min-w-[110px]">
            <ProgressBar
              value={Math.min(row.utilisation, 100)}
              status={row.isOverBudget ? 'delayed' : row.utilisation > 85 ? 'attention' : 'on-track'}
              showLabel
            />
          </div>
        ),
    },
  ];

  return (
    <>
      {/* Formula Accounting Card */}
      <div className="border-b border-line bg-canvas-subtle/50 px-6 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-ink">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-brand-700">
              <Calculator className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-ink">Project Spend Formula:</span>
            <span className="rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800 border border-amber-200">
              Material Cost
            </span>
            <span>+</span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-800 border border-blue-200">
              Labour Cost
            </span>
            <span>+</span>
            <span className="rounded-md bg-purple-50 px-2 py-0.5 font-medium text-purple-800 border border-purple-200">
              Contractor Payments
            </span>
            <span>+</span>
            <span className="rounded-md bg-canvas px-2 py-0.5 font-medium text-ink-muted border border-line">
              Other Expenses
            </span>
            <span>=</span>
            <span className="rounded-md bg-ink px-2 py-0.5 font-bold text-white">
              Total Project Spend
            </span>
          </div>
          <span className="text-ink-subtle">
            Material usage is linked directly to Warehouse Ledger transactions
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            type="search"
            value={filters.search}
            onChange={set('search')}
            placeholder="Search project name or code…"
            aria-label="Search projects"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
        </div>

        <Select
          label="Filter by project"
          value={filters.projectId}
          onChange={set('projectId')}
          className="w-[200px]"
          options={[
            { value: 'all', label: 'All projects' },
            ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
          ]}
        />

        <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        rows={projects}
        isLoading={isLoading}
        empty={{
          icon: Building2,
          title: 'No projects match these filters',
          description: 'Archived projects are excluded from the financial view.',
          action: <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>,
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/admin/projects/${row.id}`} className="font-medium text-ink hover:text-brand-700">
                  {row.name}
                </Link>
                <p className="mt-0.5 text-xs text-ink-subtle">{row.code}</p>
              </div>
              <span className={`shrink-0 text-sm font-medium tabular-nums ${row.remainingBudget < 0 ? 'text-danger' : 'text-emerald-700'}`}>
                {formatCurrency(row.remainingBudget)}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {formatCurrency(row.totalSpent)} spent of {formatCurrency(row.budget)}
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-ink-subtle">
              <span>Material Used: {formatCurrency(row.materialConsumptionCost || 0)}</span>
              <span>Labour: {formatCurrency(row.labourCost || 0)}</span>
            </div>
            {row.utilisation !== null && (
              <div className="mt-2">
                <ProgressBar
                  value={Math.min(row.utilisation, 100)}
                  status={row.isOverBudget ? 'delayed' : row.utilisation > 85 ? 'attention' : 'on-track'}
                  showLabel
                />
              </div>
            )}
          </div>
        )}
      />

      <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />

      {/* Modal: Itemized Material Consumption Audit */}
      <Modal
        isOpen={!!activeProjectForConsumption}
        onClose={() => setActiveProjectForConsumption(null)}
        title={`Material Consumption: ${activeProjectForConsumption?.name || ''}`}
        description={`Itemized daily work usage deducted from contractor warehouse inventory for ${activeProjectForConsumption?.code || ''}`}
        size="xl"
        footer={
          <Button variant="secondary" onClick={() => setActiveProjectForConsumption(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-canvas-subtle p-3.5 flex items-center justify-between">
            <span className="text-xs text-ink-muted">Total Material Consumption Cost:</span>
            <span className="font-display text-lg font-bold text-amber-800">
              {formatCurrency(
                consumptionRecords.reduce((sum, r) => sum + Number(r.materialCost ?? r.amount ?? 0), 0)
              )}
            </span>
          </div>

          <DataTable
            columns={consumptionColumns}
            rows={consumptionRecords}
            isLoading={loadingConsumption}
            empty={{
              icon: Package,
              title: 'No material consumption recorded',
              description: 'When contractors submit daily work updates with material consumption, itemized records appear here.',
            }}
          />
        </div>
      </Modal>
    </>
  );
}
