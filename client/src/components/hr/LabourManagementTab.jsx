import { useState, useCallback, useMemo } from 'react';
import {
  HardHat,
  Plus,
  Pencil,
  Search,
  Filter,
  Building2,
  Calendar,
  IndianRupee,
  RefreshCw,
  Eye,
  Users,
  Briefcase,
  MapPin,
  Clock,
  X,
  UserCheck,
} from 'lucide-react';
import { Card } from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import Alert from '../ui/Alert';
import Pagination from '../projects/Pagination';
import WorkerFormModal from './WorkerFormModal';
import AssignmentFormModal from './AssignmentFormModal';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import { hrApi } from '../../api/hrApi';
import { contractorsApi } from '../../api/contractorsApi';
import { projectsApi } from '../../api/projectsApi';
import { formatCurrency, formatDate } from '../../utils/format';
import { ROLES } from '../../config/roles';

const TRADES = [
  'Mason',
  'Carpenter',
  'Painter',
  'Helper',
  'Barbender',
  'Electrician',
  'Plumber',
  'Welder',
  'Tile Layer',
  'Scaffolder',
  'Site Supervisor',
];

/**
 * Quick Labour Profile Modal
 */
function LabourProfileModal({ worker, isOpen, onClose, onEdit }) {
  if (!isOpen || !worker) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-canvas px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white font-bold shadow-xs">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-base">{worker.fullName}</h3>
              <p className="text-xs text-ink-muted">
                {worker.workerCode} · {worker.skillCategory || 'General Worker'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-white hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs sm:text-sm">
          {/* Key attributes grid */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas/30 p-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Trade / Category</p>
              <p className="font-bold text-ink mt-0.5">{worker.skillCategory || 'Unskilled Helper'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Daily Wage Rate</p>
              <p className="font-bold text-emerald-700 mt-0.5">{formatCurrency(worker.dailyRate)} / day</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Assigned Contractor</p>
              <p className="font-bold text-brand-700 mt-0.5">{worker.contractorName || 'In-House Company'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Status</p>
              <div className="mt-0.5">
                <Badge tone={worker.status === 'active' ? 'positive' : 'neutral'} size="sm">
                  {worker.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Current Project Assignment */}
          <div className="rounded-xl border border-line p-3.5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Current Assignment</p>
            {worker.projectName ? (
              <div>
                <p className="font-semibold text-ink flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-brand-600" />
                  {worker.projectName}
                </p>
                {worker.siteName && (
                  <p className="text-xs text-ink-muted pl-5 flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-ink-subtle" />
                    Site: {worker.siteName}
                  </p>
                )}
                {worker.assignedWork && (
                  <p className="text-xs text-ink-subtle pl-5 mt-1">Scope: {worker.assignedWork}</p>
                )}
              </div>
            ) : (
              <p className="text-xs italic text-ink-subtle">No active project assignment currently assigned.</p>
            )}
          </div>

          {/* Contact info */}
          <div className="rounded-xl border border-line p-3.5 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Contact & Enrollment</p>
            <p className="text-ink-muted">Phone: <strong className="text-ink">{worker.phone || '—'}</strong></p>
            <p className="text-ink-muted">
              Enrollment Date: <strong className="text-ink">{worker.joiningDate ? formatDate(worker.joiningDate) : '—'}</strong>
            </p>
            {worker.notes && (
              <p className="text-ink-muted pt-1 border-t border-line text-xs">
                Notes: <span className="italic">{worker.notes}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas px-6 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onEdit?.(worker);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Worker
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * HR Module C: Labour
 * Workforce records for Trades, Wage Rates, Project Assignments, and Status.
 */
export default function LabourManagementTab() {
  const { user } = useAuth();
  const canManage = [ROLES.ADMIN, ROLES.HR, ROLES.CONTRACTOR].includes(user?.role);

  const [search, setSearch] = useState('');
  const [selectedTrade, setSelectedTrade] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedContractor, setSelectedContractor] = useState('all');
  const [page, setPage] = useState(1);

  const [contractorsList, setContractorsList] = useState([]);
  const [viewWorker, setViewWorker] = useState(null);
  const [editingWorker, setEditingWorker] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Load contractors for filtering
  useAsync(async () => {
    try {
      const res = await contractorsApi.list({ pageSize: 100 });
      setContractorsList(res.contractors ?? []);
    } catch {
      setContractorsList([]);
    }
  }, []);

  // Fetch workers
  const loadWorkers = useCallback(
    () =>
      hrApi.workers.list({
        search: search.trim() || undefined,
        skillCategory: selectedTrade !== 'all' ? selectedTrade : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        contractorId: selectedContractor !== 'all' ? selectedContractor : undefined,
        page,
        pageSize: 15,
      }),
    [search, selectedTrade, selectedStatus, selectedContractor, page]
  );

  const { data, isLoading, error, reload } = useAsync(loadWorkers, [loadWorkers]);
  const workers = data?.workers ?? [];
  const pagination = data?.pagination;

  // Stats calculation
  const totalActive = useMemo(() => workers.filter((w) => w.status === 'active').length, [workers]);
  const avgWage = useMemo(() => {
    if (!workers.length) return 0;
    const sum = workers.reduce((acc, w) => acc + (w.dailyRate || 0), 0);
    return Math.round(sum / workers.length);
  }, [workers]);

  return (
    <div className="space-y-6 p-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-line p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <HardHat className="h-5 w-5 text-amber-600" />
              Workforce &amp; Labour Management
            </h2>
            <Badge tone="warning" size="sm">Trade Records</Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted">
            Track daily-wage labour, trades (Mason, Carpenter, Painter, Helper, etc.), contractor rosters, wage rates, and site allocations.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={reload} title="Refresh records">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingWorker(null);
                setIsFormOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Register Worker
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Total Registered Labour</p>
          <p className="text-2xl font-bold text-ink mt-1">{pagination?.total ?? workers.length}</p>
          <p className="text-xs text-ink-muted mt-0.5">Across all contractor rolls</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Active Labour</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{totalActive}</p>
          <p className="text-xs text-emerald-600/80 mt-0.5">Available for site work</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Contractor Partners</p>
          <p className="text-2xl font-bold text-brand-700 mt-1">{contractorsList.length}</p>
          <p className="text-xs text-brand-600/80 mt-0.5">Providing workforce</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Average Daily Wage</p>
          <p className="text-2xl font-bold text-ink mt-1">{formatCurrency(avgWage)}</p>
          <p className="text-xs text-ink-muted mt-0.5">Per worker day</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-line p-3.5 shadow-2xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" />
          <input
            type="text"
            placeholder="Search by worker name, code, phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-xs sm:text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:bg-white"
          />
        </div>

        {/* Trade Filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-ink-subtle" />
          <select
            value={selectedTrade}
            onChange={(e) => {
              setSelectedTrade(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
          >
            <option value="all">All Trades / Categories</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Contractor Filter */}
        <select
          value={selectedContractor}
          onChange={(e) => {
            setSelectedContractor(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
        >
          <option value="all">All Contractors</option>
          {contractorsList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="on-leave">On Leave</option>
        </select>
      </div>

      {/* Main Labour Table */}
      {error && (
        <Alert tone="error" title="Could not load labour records">
          {error.message}
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : workers.length === 0 ? (
        <Card className="p-12 text-center">
          <HardHat className="mx-auto h-12 w-12 text-ink-subtle opacity-40 mb-3" />
          <h3 className="text-base font-semibold text-ink">No labour records found</h3>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted">
            Try adjusting your search criteria or register new labour workers.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-canvas border-b border-line text-ink-muted text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Worker / Code</th>
                  <th className="px-5 py-3">Trade / Category</th>
                  <th className="px-5 py-3">Assigned Contractor</th>
                  <th className="px-5 py-3">Project / Site Assigned</th>
                  <th className="px-5 py-3 text-right">Daily Wage Rate</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {workers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-canvas/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 font-bold text-xs">
                          {worker.fullName?.charAt(0) || 'W'}
                        </div>
                        <div>
                          <p className="font-semibold text-ink">{worker.fullName}</p>
                          <span className="font-mono text-xs text-ink-muted">{worker.workerCode}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 border border-amber-200">
                        {worker.skillCategory || 'General Helper'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-ink">{worker.contractorName || 'In-House Labour'}</p>
                      {worker.phone && <p className="text-xs text-ink-subtle">{worker.phone}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      {worker.projectName ? (
                        <div>
                          <p className="font-semibold text-ink flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 text-brand-600" />
                            {worker.projectName}
                          </p>
                          {worker.siteName && (
                            <p className="text-xs text-ink-muted pl-4">Site: {worker.siteName}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs italic text-ink-subtle">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-emerald-700">
                      {formatCurrency(worker.dailyRate)}
                      <span className="text-[10px] text-ink-subtle font-normal"> / day</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Badge tone={worker.status === 'active' ? 'positive' : 'neutral'} size="sm">
                        {worker.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setViewWorker(worker)}
                          title="View Profile"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingWorker(worker);
                              setIsFormOpen(true);
                            }}
                            title="Edit Worker"
                          >
                            <Pencil className="h-3.5 w-3.5 text-ink-muted" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-end">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      )}

      {/* Labour Profile Quick Modal */}
      <LabourProfileModal
        worker={viewWorker}
        isOpen={Boolean(viewWorker)}
        onClose={() => setViewWorker(null)}
        onEdit={(w) => {
          setEditingWorker(w);
          setIsFormOpen(true);
        }}
      />

      {/* Worker Form Modal */}
      <WorkerFormModal
        isOpen={isFormOpen}
        worker={editingWorker}
        onClose={() => {
          setIsFormOpen(false);
          setEditingWorker(null);
        }}
        onSaved={() => {
          setIsFormOpen(false);
          setEditingWorker(null);
          reload();
        }}
      />
    </div>
  );
}
