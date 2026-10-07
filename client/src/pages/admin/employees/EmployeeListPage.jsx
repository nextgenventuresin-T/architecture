import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Eye,
  Pencil,
  Building2,
  Users,
  LayoutGrid,
  List as ListIcon,
  Star,
  Sparkles,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import PeopleSearchFilters from '../../../components/employees/PeopleSearchFilters';
import EmployeeCard from '../../../components/employees/EmployeeCard';
import EmployeeQuickViewModal from '../../../components/employees/EmployeeQuickViewModal';
import AssignEmployeeDialog from '../../../components/employees/AssignEmployeeDialog';
import Pagination from '../../../components/projects/Pagination';
import useAsync from '../../../hooks/useAsync';
import { employeesApi } from '../../../api/employeesApi';
import { formatDate } from '../../../utils/format';
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_TONE,
  EMPLOYEE_TYPE_LABELS,
} from '../../../utils/employeeOptions';

const INITIAL_FILTERS = {
  search: '',
  status: 'all',
  type: 'all',
  designation: 'all',
  department: 'all',
  reportingManagerId: 'all',
  skill: 'all',
  minProficiency: 'all',
  careerInterest: '',
  workLocation: '',
  workMode: 'all',
  availabilityStatus: 'all',
  projectId: 'all',
  siteId: 'all',
  page: 1,
};

export default function EmployeeListPage() {
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [assigning, setAssigning] = useState(null);
  const [quickViewEmployee, setQuickViewEmployee] = useState(null);
  const [banner, setBanner] = useState(null);

  const load = useCallback(
    () =>
      employeesApi.list({
        search: filters.search?.trim() || undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        type: filters.type !== 'all' ? filters.type : undefined,
        designation: filters.designation !== 'all' ? filters.designation : undefined,
        department: filters.department !== 'all' ? filters.department : undefined,
        reportingManagerId: filters.reportingManagerId !== 'all' ? filters.reportingManagerId : undefined,
        skill: filters.skill !== 'all' ? filters.skill : undefined,
        minProficiency: filters.minProficiency !== 'all' ? filters.minProficiency : undefined,
        careerInterest: filters.careerInterest?.trim() || undefined,
        workLocation: filters.workLocation?.trim() || undefined,
        workMode: filters.workMode !== 'all' ? filters.workMode : undefined,
        availabilityStatus: filters.availabilityStatus !== 'all' ? filters.availabilityStatus : undefined,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
        page: filters.page,
        pageSize: viewMode === 'cards' ? 12 : 10,
      }),
    [
      filters.search,
      filters.status,
      filters.type,
      filters.designation,
      filters.department,
      filters.reportingManagerId,
      filters.skill,
      filters.minProficiency,
      filters.careerInterest,
      filters.workLocation,
      filters.workMode,
      filters.availabilityStatus,
      filters.projectId,
      filters.siteId,
      filters.page,
      viewMode,
    ]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const employees = data?.employees ?? [];

  const columns = [
    {
      key: 'name',
      header: 'Employee',
      render: (row) => {
        const initials = (row.fullName || '?')
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase();

        return (
          <div className="flex items-center gap-2.5 min-w-0">
            {row.avatarUrl ? (
              <img
                src={row.avatarUrl}
                alt={row.fullName}
                className="h-8 w-8 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setQuickViewEmployee(row)}
                className="text-left font-medium text-ink hover:text-brand-700 hover:underline block truncate"
              >
                {row.fullName}
              </button>
              <p className="text-[11px] font-mono text-ink-subtle">{row.employeeCode}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'role',
      header: 'Role & Department',
      render: (row) => (
        <div>
          <p className="font-medium text-ink text-xs">{row.designation}</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-ink-subtle">
            {row.department && (
              <span className="rounded bg-canvas px-1.5 py-0.2 text-[10px] font-semibold text-ink-muted">
                {row.department}
              </span>
            )}
            <span className="capitalize text-[11px]">
              {row.workMode ? `· ${row.workMode}` : ''}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'assignments',
      header: 'Current Project / Site',
      render: (row) => {
        const proj = row.currentProject || row.current?.project;
        const site = row.currentSite || row.current?.site;
        if (!proj && !site) return <span className="text-xs text-ink-subtle">—</span>;
        return (
          <div className="text-xs">
            <p className="font-medium text-ink truncate max-w-[170px]">{proj || 'General'}</p>
            {site && <p className="text-[11px] text-ink-subtle truncate max-w-[170px]">Site: {site}</p>}
          </div>
        );
      },
    },
    {
      key: 'task',
      header: 'Current Task',
      render: (row) => {
        const task = row.currentTask || row.current?.task;
        if (!task) return <span className="text-xs text-ink-subtle">—</span>;
        return (
          <span className="inline-flex items-center rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-700 truncate max-w-[160px]">
            {task}
          </span>
        );
      },
    },
    {
      key: 'manager',
      header: 'Reporting Manager',
      render: (row) => (
        <span className="text-xs text-ink-muted">
          {row.reportingManager ? row.reportingManager.name : <span className="text-ink-subtle">—</span>}
        </span>
      ),
    },
    {
      key: 'skills',
      header: 'Key Skills',
      render: (row) => {
        const topSkills = (row.skills || []).slice(0, 3);
        if (topSkills.length === 0) return <span className="text-xs text-ink-subtle">—</span>;
        return (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {topSkills.map((s, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded bg-canvas-subtle border border-line px-1.5 py-0.5 text-[11px] text-ink"
              >
                <span>{s.skillName}</span>
                <span className="text-amber-600 font-bold text-[10px]">{s.proficiency}★</span>
              </span>
            ))}
            {(row.skills || []).length > 3 && (
              <span className="text-[10px] text-ink-subtle font-medium self-center">
                +{(row.skills || []).length - 3}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'contact',
      header: 'Location / Contact',
      render: (row) => (
        <div className="text-ink-muted text-xs">
          <p className="truncate max-w-[150px]">{row.workLocation || row.phone || '—'}</p>
          <p className="text-[11px] text-ink-subtle truncate max-w-[150px]">{row.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={EMPLOYEE_STATUS_TONE[row.status] ?? 'neutral'} size="sm">
          {EMPLOYEE_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setQuickViewEmployee(row)}
            className="h-8 gap-1 text-xs px-2"
            title="Quick 360 View"
          >
            <Eye className="h-3.5 w-3.5" />
            Quick View
          </Button>

          <Link to={`/admin/employees/${row.id}`}>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-line px-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
              title="Full 360 Profile"
            >
              Profile
            </button>
          </Link>

          <button
            type="button"
            onClick={() => navigate(`/admin/employees/${row.id}/edit`)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-subtle hover:bg-canvas hover:text-ink transition-colors"
            title="Edit Employee"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setAssigning(row)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
            title="Assign to Project/Site"
          >
            <Building2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Employee Directory"
        description="Comprehensive employee directory with People Search across skills, competencies, and 360° profiles."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Employees' }]}
        actions={
          <div className="flex items-center gap-2">
            {/* View Mode Toggle Button Group */}
            <div className="flex items-center rounded-xl border border-line bg-canvas p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-ink shadow-xs'
                    : 'text-ink-subtle hover:text-ink'
                }`}
                title="Card View"
                aria-label="Card View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-ink shadow-xs'
                    : 'text-ink-subtle hover:text-ink'
                }`}
                title="Table / List View"
                aria-label="Table / List View"
              >
                <ListIcon className="h-3.5 w-3.5" />
                <span>List</span>
              </button>
            </div>

            <Link to="/admin/employees/new">
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Employee
              </Button>
            </Link>
          </div>
        }
      />

      {banner && <Alert tone={banner.tone} className="mb-4">{banner.message}</Alert>}

      {error ? (
        <>
          <Alert tone="error" title="Could not load employee directory">{error.message}</Alert>
          <Button className="mt-4" onClick={reload}>Try again</Button>
        </>
      ) : (
        <div className="space-y-4">
          {/* People Search & Filters Bar */}
          <Card>
            <div className="p-4 sm:p-5">
              <PeopleSearchFilters
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters(INITIAL_FILTERS)}
              />
            </div>
          </Card>

          {/* Directory Content Area */}
          {isLoading ? (
            viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 rounded-2xl" />
                ))}
              </div>
            ) : (
              <Card>
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </Card>
            )
          ) : employees.length === 0 ? (
            <Card>
              <div className="p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-canvas text-ink-subtle">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-ink">No employees matched your search</h3>
                <p className="mt-1 text-xs text-ink-subtle max-w-sm mx-auto">
                  Try adjusting your search keywords, clear specific filter chips, or search across broader skills.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilters(INITIAL_FILTERS)}
                  className="mt-4"
                >
                  Clear All Filters
                </Button>
              </div>
            </Card>
          ) : viewMode === 'cards' ? (
            /* VIEW A: CARD VIEW (Feature 24) */
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
                {employees.map((employee) => (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    onQuickView={setQuickViewEmployee}
                    onAssign={setAssigning}
                    navigate={navigate}
                  />
                ))}
              </div>

              <Card>
                <Pagination
                  pagination={data?.pagination}
                  onChange={(page) => setFilters((f) => ({ ...f, page }))}
                />
              </Card>
            </div>
          ) : (
            /* VIEW B: TABLE / LIST VIEW (Feature 24) */
            <Card>
              <DataTable
                columns={columns}
                rows={employees}
                isLoading={isLoading}
              />
              <Pagination
                pagination={data?.pagination}
                onChange={(page) => setFilters((f) => ({ ...f, page }))}
              />
            </Card>
          )}
        </div>
      )}

      {/* Modal 1: Employee 360° Quick View Modal */}
      <EmployeeQuickViewModal
        employee={quickViewEmployee}
        isOpen={Boolean(quickViewEmployee)}
        onClose={() => setQuickViewEmployee(null)}
      />

      {/* Modal 2: Assign Employee Dialog */}
      <AssignEmployeeDialog
        employee={assigning}
        onClose={() => setAssigning(null)}
        onSaved={(message) => {
          setAssigning(null);
          setBanner({ tone: 'success', message });
          reload();
        }}
      />
    </>
  );
}
