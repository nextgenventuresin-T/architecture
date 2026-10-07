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
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Skeleton from '../ui/Skeleton';
import PeopleSearchFilters from '../employees/PeopleSearchFilters';
import EmployeeCard from '../employees/EmployeeCard';
import EmployeeQuickViewModal from '../employees/EmployeeQuickViewModal';
import AssignEmployeeDialog from '../employees/AssignEmployeeDialog';
import Pagination from '../projects/Pagination';
import useAsync from '../../hooks/useAsync';
import { employeesApi } from '../../api/employeesApi';
import { formatDate } from '../../utils/format';
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_TONE,
  EMPLOYEE_TYPE_LABELS,
} from '../../utils/employeeOptions';

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

/**
 * HR Module A: Employee Directory
 * Direct real-time link to Admin -> Employees records.
 * No duplicate employee database is maintained.
 */
export default function HrEmployeeDirectoryTab() {
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
        pageSize: viewMode === 'cards' ? 12 : 15,
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
  const pagination = data?.pagination;

  // Table columns definition
  const columns = [
    {
      key: 'employee',
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
          <div className="flex items-center gap-3">
            {row.avatarUrl ? (
              <img
                src={row.avatarUrl}
                alt={row.fullName}
                className="h-9 w-9 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-xs font-bold text-white shadow-xs">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setQuickViewEmployee(row)}
                className="text-left font-semibold text-ink hover:text-brand-700 transition-colors block truncate"
              >
                {row.fullName}
              </button>
              <span className="font-mono text-xs font-medium text-brand-700 bg-brand-50 px-1 rounded">
                {row.employeeCode}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'designation',
      header: 'Role & Dept',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.designation}</p>
          <p className="text-xs text-ink-subtle">{row.department || '—'}</p>
        </div>
      ),
    },
    {
      key: 'reporting',
      header: 'Reporting Line',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          {row.reportingManager ? (
            <p className="font-medium text-ink flex items-center gap-1">
              <UserCheck className="h-3 w-3 text-teal-600 shrink-0" />
              <span>{row.reportingManager.name}</span>
            </p>
          ) : (
            <span className="text-ink-subtle italic">Executive / Head</span>
          )}
          {row.managersManager && (
            <p className="text-ink-subtle pl-4">
              ↳ <span className="text-ink-muted">{row.managersManager.name}</span>
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="text-xs text-ink-muted">
          {EMPLOYEE_TYPE_LABELS[row.employeeType] ?? row.employeeType}
        </span>
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
            title="Quick View"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Link to={`/admin/employees/${row.id}`}>
            <Button variant="ghost" size="sm" title="Full 360 Profile">
              <ExternalLink className="h-3.5 w-3.5 text-brand-600" />
            </Button>
          </Link>
          <Link to={`/admin/employees/${row.id}/edit`}>
            <Button variant="ghost" size="sm" title="Edit Employee">
              <Pencil className="h-3.5 w-3.5 text-ink-muted" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Subheader / Directory banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-line p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-600" />
              Employee Directory
            </h2>
            <Badge tone="info" size="sm">Linked with Master</Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted">
            Directly connected to company employee records. View full 360° profiles, skills, and reporting lines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-xl border border-line bg-canvas p-1">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'cards'
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
              Table
            </button>
          </div>

          <Button variant="secondary" size="sm" onClick={reload} title="Refresh records">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          <Link to="/admin/employees/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </Button>
          </Link>
        </div>
      </div>

      {banner && (
        <Alert tone="success" onClose={() => setBanner(null)}>
          {banner}
        </Alert>
      )}

      {/* Advanced People Search & Filters */}
      <PeopleSearchFilters
        filters={filters}
        onChange={(next) => setFilters(next)}
        onReset={() => setFilters(INITIAL_FILTERS)}
      />

      {/* Error state */}
      {error && (
        <Alert tone="error" title="Could not load employee directory">
          {error.message}
        </Alert>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!isLoading && !error && (
        <>
          {employees.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-ink-subtle opacity-40 mb-3" />
              <h3 className="text-base font-semibold text-ink">No employees found</h3>
              <p className="mt-1 text-xs sm:text-sm text-ink-muted">
                Try adjusting your search query, department, or skill filters.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => setFilters(INITIAL_FILTERS)}
              >
                Reset all filters
              </Button>
            </Card>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
              {employees.map((emp) => (
                <EmployeeCard
                  key={emp.id}
                  employee={emp}
                  onQuickView={(e) => setQuickViewEmployee(e)}
                  onAssign={(e) => setAssigning(e)}
                  navigate={navigate}
                />
              ))}
            </div>
          ) : (
            <Card>
              <DataTable
                columns={columns}
                rows={employees}
                emptyState="No employees match your search criteria."
              />
            </Card>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex justify-end">
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
              />
            </div>
          )}
        </>
      )}

      {/* Quick View 360 Modal */}
      <EmployeeQuickViewModal
        employee={quickViewEmployee}
        isOpen={Boolean(quickViewEmployee)}
        onClose={() => setQuickViewEmployee(null)}
      />

      {/* Assign to Project Dialog */}
      <AssignEmployeeDialog
        employee={assigning}
        onClose={() => setAssigning(null)}
        onSaved={(msg) => {
          setAssigning(null);
          setBanner(msg || 'Assignment created.');
          reload();
        }}
      />
    </div>
  );
}
