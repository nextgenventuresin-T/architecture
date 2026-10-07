import { useCallback, useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  HardHat,
  RefreshCw,
  Building2,
  MapPin,
  Briefcase,
  Search,
  Filter,
} from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Pagination from '../projects/Pagination';
import WorkerFormModal from './WorkerFormModal';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import { hrApi } from '../../api/hrApi';
import { contractorsApi } from '../../api/contractorsApi';
import { formatCurrency, formatDate } from '../../utils/format';
import { ROLES } from '../../config/roles';

const INITIAL_FILTERS = { status: 'all', search: '', contractorId: 'all', page: 1 };

/**
 * HR Module D: Contractor Workers
 * Clear visibility of workers working under each Contractor:
 * Contractor name, Worker details, Project / site, Assigned work, Status
 */
export default function ContractorWorkersTab() {
  const { user } = useAuth();
  const isContractor = user?.role === ROLES.CONTRACTOR;
  const canCreate = [ROLES.ADMIN, ROLES.HR, ROLES.CONTRACTOR].includes(user?.role);

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [contractorsList, setContractorsList] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);

  // Load contractors list for filtering
  useEffect(() => {
    if (!isContractor) {
      contractorsApi.list({ pageSize: 100 })
        .then((res) => setContractorsList(res.contractors ?? []))
        .catch(() => setContractorsList([]));
    }
  }, [isContractor]);

  const load = useCallback(
    () =>
      hrApi.workers.list({
        status: filters.status !== 'all' ? filters.status : undefined,
        contractorId: filters.contractorId !== 'all' ? filters.contractorId : undefined,
        search: filters.search.trim() || undefined,
        page: filters.page,
        pageSize: 15,
      }),
    [filters.status, filters.contractorId, filters.search, filters.page]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const workers = data?.workers ?? [];

  function openCreate() {
    setEditingWorker(null);
    setIsFormOpen(true);
  }

  function openEdit(worker) {
    setEditingWorker(worker);
    setIsFormOpen(true);
  }

  const columns = [
    {
      key: 'worker',
      header: 'Worker Details',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{row.fullName}</p>
          <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <span className="font-mono text-ink-muted">{row.workerCode}</span>
            {row.phone && <span>· {row.phone}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'contractor',
      header: 'Contractor Name',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-brand-600" />
            {row.contractorName}
          </p>
          <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
            {row.skillCategory || 'General'}
          </span>
        </div>
      ),
    },
    {
      key: 'assignment',
      header: 'Project / Site Assigned',
      render: (row) => (
        <div>
          {row.projectName ? (
            <div>
              <p className="font-medium text-ink flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-brand-600" />
                {row.projectName}
              </p>
              {row.siteName && (
                <p className="text-xs text-ink-subtle pl-4 flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-ink-subtle" />
                  Site: {row.siteName}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs italic text-ink-subtle">Not currently on site</span>
          )}
        </div>
      ),
    },
    {
      key: 'assignedWork',
      header: 'Assigned Work / Scope',
      render: (row) => (
        <div className="max-w-xs truncate text-xs text-ink-muted">
          {row.assignedWork || <span className="text-ink-subtle italic">Standard Trade Tasks</span>}
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Daily Rate',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-mono font-medium text-ink">
          {formatCurrency(row.dailyRate)}
          <span className="text-[10px] text-ink-subtle"> / day</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge tone={row.status === 'active' ? 'positive' : 'neutral'} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => openEdit(row)}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-line p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-brand-600" />
              Contractor Workers
            </h2>
            <Badge tone="info" size="sm">Roster by Contractor</Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted">
            Dedicated view of workers enrolled under each contractor company, including site allocations and work scopes.
          </p>
        </div>

        {canCreate && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={reload} title="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Worker
            </Button>
          </div>
        )}
      </div>

      <Card>
        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" />
              <input
                type="search"
                placeholder="Search worker by name, code, phone…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
                className="h-9 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-xs sm:text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:bg-white"
              />
            </div>

            {!isContractor && (
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-ink-subtle" />
                <select
                  value={filters.contractorId}
                  onChange={(e) => setFilters((f) => ({ ...f, contractorId: e.target.value, page: 1 }))}
                  className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
                >
                  <option value="all">All Contractors ({contractorsList.length})</option>
                  {contractorsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load contractor workers">
              {error.message}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={workers}
              isLoading={isLoading}
              empty={{
                icon: HardHat,
                title: 'No contractor workers found',
                description: 'Add a worker or adjust filters to view records.',
              }}
            />
            {data?.pagination && data.pagination.totalPages > 1 && (
              <div className="p-4 border-t border-line flex justify-end">
                <Pagination
                  page={data.pagination.page}
                  totalPages={data.pagination.totalPages}
                  total={data.pagination.total}
                  onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
                />
              </div>
            )}
          </>
        )}
      </Card>

      <WorkerFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={reload}
        worker={editingWorker}
      />
    </div>
  );
}
