import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Eye, Pencil, Search, UserCheck, KeyRound } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Select from '../../../components/ui/Select';
import Pagination from '../../../components/projects/Pagination';
import useAsync from '../../../hooks/useAsync';
import { projectManagersApi } from '../../../api/projectManagersApi';
import { EMPLOYEE_STATUSES, EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONE } from '../../../utils/employeeOptions';

const INITIAL_FILTERS = { search: '', status: 'all', page: 1 };

/** Project Managers directory - who manages which projects, sites and tasks. */
export default function ProjectManagerListPage() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));

  const load = useCallback(
    () => projectManagersApi.list({
      search: filters.search || undefined,
      status: filters.status,
      page: filters.page,
      pageSize: 10,
    }),
    [filters.search, filters.status, filters.page]
  );
  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const managers = data?.managers ?? [];
  const summary = data?.summary;

  const columns = [
    {
      key: 'name',
      header: 'Project manager',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/admin/project-managers/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.fullName}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{row.employeeCode}{row.workLocation ? ` · ${row.workLocation}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Phone / Email',
      render: (row) => (
        <div className="text-ink-muted">
          <p>{row.phone || '—'}</p>
          <p className="text-xs text-ink-subtle">{row.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'workload',
      header: 'Workload',
      render: (row) => (
        <div className="whitespace-nowrap text-ink-muted">
          <p>{row.activeProjectCount} active project{row.activeProjectCount === 1 ? '' : 's'} · {row.siteCount} site{row.siteCount === 1 ? '' : 's'}</p>
          <p className="text-xs text-ink-subtle">{row.openTaskCount} open of {row.taskCount} assigned task{row.taskCount === 1 ? '' : 's'}</p>
        </div>
      ),
    },
    {
      key: 'login',
      header: 'Login',
      render: (row) => (row.login
        ? <Badge tone={row.login.isActive ? 'positive' : 'neutral'}>{row.login.isActive ? 'Active login' : 'Login disabled'}</Badge>
        : <span className="text-ink-subtle">No login</span>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={EMPLOYEE_STATUS_TONE[row.status] ?? 'neutral'}>{EMPLOYEE_STATUS_LABELS[row.status] ?? row.status}</Badge>,
    },
    { key: 'actions', header: 'Actions', align: 'right', render: (row) => <RowActions row={row} /> },
  ];

  return (
    <>
      <PageHeader
        title="Project Managers"
        description="Employees who manage projects, sites and tasks. Their details come from the Employees module."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Project Managers' }]}
        actions={
          <Link to="/admin/project-managers/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add project manager
            </Button>
          </Link>
        }
      />

      {summary && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryTile icon={UserCheck} label="Project managers" value={summary.total} />
          <SummaryTile icon={UserCheck} label="Active" value={summary.active} />
          <SummaryTile icon={KeyRound} label="With a PM login" value={summary.withLogin} />
        </div>
      )}

      {error ? (
        <>
          <Alert tone="error" title="Could not load project managers">{error.message}</Alert>
          <Button className="mt-4" onClick={reload}>Try again</Button>
        </>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              <input
                type="search"
                value={filters.search}
                onChange={set('search')}
                placeholder="Search name, ID, phone, location…"
                aria-label="Search project managers"
                className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
              />
            </div>
            <Select
              label="Filter by status"
              value={filters.status}
              onChange={set('status')}
              className="w-[160px]"
              options={[{ value: 'all', label: 'All statuses' }, ...EMPLOYEE_STATUSES]}
            />
          </div>

          <DataTable
            columns={columns}
            rows={managers}
            isLoading={isLoading}
            empty={{
              icon: UserCheck,
              title: 'No project managers found',
              description: 'Clear the filters, or add a project manager so they can be assigned to projects and tasks.',
              action: <Button variant="secondary" onClick={() => setFilters(INITIAL_FILTERS)}>Clear filters</Button>,
            }}
            renderCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/admin/project-managers/${row.id}`} className="font-medium text-ink hover:text-brand-700">{row.fullName}</Link>
                    <p className="mt-0.5 text-xs text-ink-subtle">{row.phone || row.email || row.employeeCode}</p>
                  </div>
                  <Badge tone={EMPLOYEE_STATUS_TONE[row.status] ?? 'neutral'}>{EMPLOYEE_STATUS_LABELS[row.status] ?? row.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {row.activeProjectCount} active project{row.activeProjectCount === 1 ? '' : 's'} · {row.openTaskCount} open task{row.openTaskCount === 1 ? '' : 's'}
                </p>
                <div className="mt-3"><RowActions row={row} /></div>
              </div>
            )}
          />

          <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
        </Card>
      )}
    </>
  );
}

function SummaryTile({ icon: Icon, label, value }) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-subtle">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-ink">{value}</p>
      </div>
    </Card>
  );
}

function RowActions({ row }) {
  const base = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink';
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link to={`/admin/project-managers/${row.id}`} className={base} aria-label={`View ${row.fullName}`}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View
      </Link>
      <Link to={`/admin/employees/${row.id}/edit`} className={base} aria-label={`Edit employee details of ${row.fullName}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </Link>
    </div>
  );
}
