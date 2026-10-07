import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Eye, Pencil, Users, Search, ShieldCheck } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Select from '../../../components/ui/Select';
import Pagination from '../../../components/projects/Pagination';
import useAsync from '../../../hooks/useAsync';
import { usersApi } from '../../../api/usersApi';
import { projectsApi } from '../../../api/projectsApi';
import { formatDate } from '../../../utils/format';
import { USER_STATUS_OPTIONS, USER_STATUS_LABELS, USER_STATUS_TONE, ROLE_TONE } from '../../../utils/userOptions';

const INITIAL = { search: '', role: 'all', status: 'all', projectId: 'all', siteId: 'all', page: 1 };

export default function UserListPage() {
  const [filters, setFilters] = useState(INITIAL);
  const [lookups, setLookups] = useState({ roles: [], projects: [], summary: null });
  const [sites, setSites] = useState([]);

  useEffect(() => {
    usersApi.lookups().then(setLookups).catch(() => setLookups({ roles: [], projects: [], summary: null }));
  }, []);

  useEffect(() => {
    if (filters.projectId === 'all') { setSites([]); return undefined; }
    let active = true;
    projectsApi.detail(filters.projectId)
      .then((data) => active && setSites(data.sites ?? []))
      .catch(() => active && setSites([]));
    return () => { active = false; };
  }, [filters.projectId]);

  const load = useCallback(
    () => usersApi.list({
      search: filters.search || undefined,
      role: filters.role !== 'all' ? filters.role : undefined,
      status: filters.status,
      projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
      siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
      page: filters.page,
      pageSize: 10,
    }),
    [filters]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const users = data?.users ?? [];

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value, page: 1 }));
  const setProject = (event) =>
    setFilters((f) => ({ ...f, projectId: event.target.value, siteId: 'all', page: 1 }));

  const columns = [
    {
      key: 'user',
      header: 'Name',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/admin/users/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.fullName}
          </Link>
          <p className="mt-0.5 truncate text-xs text-ink-subtle">{row.email}</p>
        </div>
      ),
    },
    { key: 'username', header: 'Username', render: (row) => <span className="text-ink-muted">{row.username || '—'}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={ROLE_TONE[row.role] ?? 'neutral'}>{row.roleName}</Badge>
          {row.hasCustomPermissions && (
            <span className="inline-flex items-center rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
              Custom perms
            </span>
          )}
        </div>
      ),
    },
    { key: 'department', header: 'Department', render: (row) => <span className="text-ink-muted">{row.department || '—'}</span> },
    {
      key: 'access',
      header: 'Projects / sites',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-ink-muted">
          {row.projectCount === 0
            ? 'All projects'
            : `${row.projectCount} project${row.projectCount === 1 ? '' : 's'}${row.siteCount ? ` · ${row.siteCount} site${row.siteCount === 1 ? '' : 's'}` : ''}`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={USER_STATUS_TONE[row.status] ?? 'neutral'}>
          {USER_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-ink-subtle">
          {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => <span className="whitespace-nowrap text-xs text-ink-subtle">{formatDate(row.createdAt)}</span>,
    },
    { key: 'actions', header: 'Actions', align: 'right', render: (row) => <RowActions row={row} /> },
  ];

  return (
    <>
      <PageHeader
        title="Users & access"
        description="Control who can sign in, what each role may do, and which projects they can reach."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Users & access' }]}
        actions={
          <>
            <Link to="/admin/users/roles">
              <Button variant="secondary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Roles & permissions
              </Button>
            </Link>
            <Link to="/admin/users/new">
              <Button>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add user
              </Button>
            </Link>
          </>
        }
      />

      {lookups.summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['Total users', lookups.summary.total],
            ['Active', lookups.summary.active],
            ['Inactive', lookups.summary.inactive],
            ['Have signed in', lookups.summary.haveLoggedIn],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-white px-4 py-3.5">
              <p className="text-xl font-semibold tabular-nums text-ink">{value}</p>
              <p className="mt-0.5 text-xs text-ink-subtle">{label}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load users">{error.message}</Alert>
            <Button className="mt-4" onClick={reload}>Try again</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
                <input
                  type="search"
                  value={filters.search}
                  onChange={set('search')}
                  placeholder="Search name, email, username…"
                  aria-label="Search users"
                  className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
                />
              </div>

              <Select
                label="Filter by role"
                value={filters.role}
                onChange={set('role')}
                className="w-[170px]"
                options={[{ value: 'all', label: 'All roles' }, ...(lookups.roles ?? []).map((r) => ({ value: r.slug, label: r.name }))]}
              />

              <Select
                label="Filter by status"
                value={filters.status}
                onChange={set('status')}
                className="w-[150px]"
                options={[{ value: 'all', label: 'All statuses' }, ...USER_STATUS_OPTIONS]}
              />

              <Select
                label="Filter by project"
                value={filters.projectId}
                onChange={setProject}
                className="w-[180px]"
                options={[{ value: 'all', label: 'All projects' }, ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))]}
              />

              <Select
                label="Filter by site"
                value={filters.siteId}
                onChange={set('siteId')}
                className="w-[160px]"
                options={[
                  { value: 'all', label: filters.projectId === 'all' ? 'All sites' : 'All sites in project' },
                  ...sites.map((s) => ({ value: String(s.id), label: s.name })),
                ]}
              />

              <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>
            </div>

            <DataTable
              columns={columns}
              rows={users}
              isLoading={isLoading}
              empty={{
                icon: Users,
                title: 'No users match these filters',
                description: 'Clear the filters, or add a user.',
                action: <Button variant="secondary" onClick={() => setFilters(INITIAL)}>Clear filters</Button>,
              }}
              renderCard={(row) => (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/admin/users/${row.id}`} className="font-medium text-ink hover:text-brand-700">
                        {row.fullName}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-ink-subtle">{row.email}</p>
                    </div>
                    <Badge tone={USER_STATUS_TONE[row.status] ?? 'neutral'}>
                      {USER_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">
                    {row.roleName}{row.department ? ` · ${row.department}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    Last login {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'never'}
                  </p>
                  <div className="mt-3"><RowActions row={row} /></div>
                </div>
              )}
            />

            <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
          </>
        )}
      </Card>
    </>
  );
}

function RowActions({ row }) {
  const base = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink';
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link to={`/admin/users/${row.id}`} className={base} aria-label={`View ${row.fullName}`}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View
      </Link>
      <Link to={`/admin/users/${row.id}/edit`} className={base} aria-label={`Edit ${row.fullName}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </Link>
    </div>
  );
}
