import { useCallback, useState, useEffect, useMemo } from 'react';
import {
  Plus,
  CalendarClock,
  RefreshCw,
  Search,
  Filter,
  Building2,
  Calendar,
  Briefcase,
  Users,
  HardHat,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Pagination from '../projects/Pagination';
import AttendanceMarkModal from './AttendanceMarkModal';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import { hrApi } from '../../api/hrApi';
import { contractorsApi } from '../../api/contractorsApi';
import { projectsApi } from '../../api/projectsApi';
import { formatDate } from '../../utils/format';
import { ATTENDANCE_STATUS_TONE } from '../../utils/hrOptions';
import { ROLES } from '../../config/roles';

const today = new Date().toISOString().slice(0, 10);
const INITIAL_FILTERS = {
  date: today,
  status: 'all',
  labourType: 'all',
  contractorId: 'all',
  projectId: 'all',
  search: '',
  page: 1,
};

/**
 * HR Module E: Attendance
 * Dedicated Attendance page covering Company Employees, Labour, and Contractor Workers.
 * Filters: Worker type, Contractor, Project, Date, Attendance status.
 */
export default function AttendanceTab({ readOnly = false }) {
  const { user } = useAuth();
  const canMark = !readOnly && [ROLES.ADMIN, ROLES.HR, ROLES.CONTRACTOR].includes(user?.role);
  const isContractor = user?.role === ROLES.CONTRACTOR;

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [contractorsList, setContractorsList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [isMarkOpen, setIsMarkOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  // Load dropdown lookups
  useEffect(() => {
    if (!isContractor) {
      contractorsApi.list({ pageSize: 100 })
        .then((r) => setContractorsList(r.contractors ?? []))
        .catch(() => setContractorsList([]));
    }
    projectsApi.list({ pageSize: 100 })
      .then((r) => setProjectsList(r.projects ?? []))
      .catch(() => setProjectsList([]));
  }, [isContractor]);

  const load = useCallback(
    () =>
      hrApi.attendance.list({
        date: filters.date || undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        labourType: filters.labourType !== 'all' ? filters.labourType : undefined,
        contractorId: filters.contractorId !== 'all' ? filters.contractorId : undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        search: filters.search.trim() || undefined,
        page: filters.page,
        pageSize: 15,
      }),
    [
      filters.date,
      filters.status,
      filters.labourType,
      filters.contractorId,
      filters.projectId,
      filters.search,
      filters.page,
    ]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const records = data?.records ?? [];

  // KPI counts computed from current results or summary
  const summaryCounts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let leave = 0;
    records.forEach((r) => {
      if (r.status === 'PRESENT') present += 1;
      else if (r.status === 'ABSENT') absent += 1;
      else if (r.status === 'HALF_DAY') halfDay += 1;
      else if (r.status === 'LEAVE') leave += 1;
    });
    return { present, absent, halfDay, leave, total: records.length };
  }, [records]);

  function openMark() {
    setEditingRecord(null);
    setIsMarkOpen(true);
  }

  function openEdit(record) {
    setEditingRecord(record);
    setIsMarkOpen(true);
  }

  const columns = [
    {
      key: 'worker',
      header: 'Person / Worker',
      render: (row) => {
        const isCompany = row.labourType === 'company';
        const name = row.worker?.name || (isCompany ? row.employee?.fullName : row.worker?.fullName) || '—';
        const sub = isCompany
          ? `${row.worker?.designation || 'Company Employee'}`
          : `${row.worker?.skillCategory || 'Contractor Worker'}${row.contractor ? ` · ${row.contractor.name}` : ''}`;

        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                isCompany ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isCompany ? <Users className="h-4 w-4" /> : <HardHat className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">{name}</p>
              <p className="text-xs text-ink-muted">{sub}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Worker Type',
      render: (row) => (
        <Badge tone={row.labourType === 'company' ? 'brand' : 'warning'} size="sm">
          {row.labourType === 'company' ? 'Company Staff' : 'Contractor Labour'}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className="whitespace-nowrap font-medium text-ink">{formatDate(row.date)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Attendance Status',
      render: (row) => (
        <Badge tone={ATTENDANCE_STATUS_TONE[row.status] ?? 'neutral'} size="sm">
          {row.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'location',
      header: 'Project / Site',
      render: (row) => (
        <div>
          {row.project?.name ? (
            <div>
              <p className="font-medium text-ink flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-brand-600" />
                {row.project.name}
              </p>
              {row.site?.name && <p className="text-xs text-ink-subtle pl-4">Site: {row.site.name}</p>}
            </div>
          ) : (
            <span className="text-xs text-ink-muted italic">Head Office / General</span>
          )}
        </div>
      ),
    },
    {
      key: 'times',
      header: 'In / Out Times',
      render: (row) => (
        <div className="text-xs text-ink-muted font-mono">
          {row.checkIn || row.checkOut ? (
            <span>
              {row.checkIn ?? '—'} <span className="text-ink-subtle">to</span> {row.checkOut ?? '—'}
            </span>
          ) : (
            <span className="text-ink-subtle italic font-sans">Full day mark</span>
          )}
        </div>
      ),
    },
    {
      key: 'remarks',
      header: 'Remarks',
      render: (row) => (
        <span className="text-xs text-ink-subtle line-clamp-1">{row.remarks || '—'}</span>
      ),
    },
    ...(!readOnly
      ? [
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (
              <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-line p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-brand-600" />
              Attendance Management
            </h2>
            <Badge tone="brand" size="sm">Company &amp; Contractor Workforce</Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted">
            Daily attendance roster covering Company Employees, Labour, and Contractor Workers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={reload} title="Refresh records">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canMark && (
            <Button size="sm" onClick={openMark} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Mark Attendance
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards for current view */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-line bg-white p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Total Marked</p>
          <p className="text-xl font-bold text-ink mt-0.5">{data?.pagination?.total ?? summaryCounts.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Present</p>
          <p className="text-xl font-bold text-emerald-700 mt-0.5">{summaryCounts.present}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800">Absent</p>
          <p className="text-xl font-bold text-rose-700 mt-0.5">{summaryCounts.absent}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Half Day</p>
          <p className="text-xl font-bold text-amber-700 mt-0.5">{summaryCounts.halfDay}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">On Leave</p>
          <p className="text-xl font-bold text-blue-700 mt-0.5">{summaryCounts.leave}</p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" />
              <input
                type="search"
                placeholder="Search person or worker…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
                className="h-9 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-xs sm:text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:bg-white"
              />
            </div>

            {/* Worker Type Filter */}
            <select
              value={filters.labourType}
              onChange={(e) => setFilters((f) => ({ ...f, labourType: e.target.value, page: 1 }))}
              className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
            >
              <option value="all">All Worker Types</option>
              <option value="company">Company Employees</option>
              <option value="contractor">Contractor Workers / Labour</option>
            </select>

            {/* Contractor Filter */}
            {!isContractor && (
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
            )}

            {/* Project Filter */}
            <select
              value={filters.projectId}
              onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value, page: 1 }))}
              className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
            >
              <option value="all">All Projects</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Date Picker */}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-ink-subtle" />
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value, page: 1 }))}
                className="h-9 rounded-xl border border-line bg-canvas px-2.5 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
              />
            </div>

            {/* Attendance Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="LEAVE">Leave</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load attendance records">
              {error.message}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={records}
              isLoading={isLoading}
              empty={{
                icon: CalendarClock,
                title: 'No attendance records found',
                description: 'Mark attendance or adjust your date/worker filters.',
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

      {/* Mark / Edit Attendance Modal */}
      <AttendanceMarkModal
        isOpen={isMarkOpen}
        onClose={() => {
          setIsMarkOpen(false);
          setEditingRecord(null);
        }}
        onSaved={reload}
        record={editingRecord}
      />
    </div>
  );
}
