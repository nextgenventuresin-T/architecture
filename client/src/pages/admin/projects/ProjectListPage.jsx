import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Users, Building2, FolderOpen } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/Badge';
import ProgressBar from '../../../components/ui/ProgressBar';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Modal from '../../../components/ui/Modal';
import ProjectFilters from '../../../components/projects/ProjectFilters';
import Pagination from '../../../components/projects/Pagination';
import AssignTeamDialog from '../../../components/projects/AssignTeamDialog';
import useAsync from '../../../hooks/useAsync';
import useAuth from '../../../hooks/useAuth';
import { projectsApi } from '../../../api/projectsApi';
import { toApiError } from '../../../api/axiosClient';
import { formatCompactCurrency, formatDate } from '../../../utils/format';
import { ROLES } from '../../../config/roles';

const INITIAL_FILTERS = { search: '', status: 'all', contractorId: 'all', clientId: 'all', page: 1 };

export default function ProjectListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = user?.role === ROLES.ADMIN;

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [assigning, setAssigning] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [banner, setBanner] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: lookups } = useAsync(() => projectsApi.lookups(), []);

  const load = useCallback(
    () => projectsApi.list({
      search: filters.search || undefined,
      status: filters.status,
      contractorId: filters.contractorId,
      clientId: filters.clientId,
      page: filters.page,
      pageSize: 10,
    }),
    [filters.search, filters.status, filters.contractorId, filters.clientId, filters.page]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const projects = data?.projects ?? [];

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await projectsApi.archive(confirmDelete.id);
      setBanner({ tone: 'success', message: `${confirmDelete.name} was archived.` });
      setConfirmDelete(null);
      reload();
    } catch (caught) {
      setBanner({ tone: 'error', message: toApiError(caught).message });
    } finally {
      setIsDeleting(false);
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Project',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/admin/projects/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.name}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{row.code} · {row.location}</p>
        </div>
      ),
    },
    { key: 'client', header: 'Client', render: (row) => <span className="text-ink-muted">{row.client?.name ?? '—'}</span> },
    {
      key: 'team',
      header: 'Team',
      render: (row) => (
        <div className="text-ink-muted">
          <p>{row.team.projectManager?.name ?? '—'}</p>
          <p className="text-xs text-ink-subtle">{row.team.siteEngineer?.name ?? 'No engineer'}</p>
        </div>
      ),
    },
    { key: 'contractor', header: 'Contractor', render: (row) => <span className="text-ink-muted">{row.contractor?.name ?? '—'}</span> },
    {
      key: 'dates',
      header: 'Timeline',
      render: (row) => (
        <div className="whitespace-nowrap text-ink-muted">
          <p>{formatDate(row.startDate)}</p>
          <p className="text-xs text-ink-subtle">to {formatDate(row.expectedCompletion)}</p>
        </div>
      ),
    },
    {
      key: 'budget',
      header: 'Budget / spent',
      align: 'right',
      render: (row) => (
        <div className="whitespace-nowrap tabular-nums">
          <p className="text-ink">{formatCompactCurrency(row.estimatedBudget)}</p>
          <p className="text-xs text-ink-subtle">{formatCompactCurrency(row.spentAmount)} spent</p>
        </div>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (row) => (
        <div className="w-32">
          <ProgressBar value={row.progress} status={row.status} showLabel />
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => <RowActions row={row} canDelete={canDelete} navigate={navigate} onAssign={setAssigning} onDelete={setConfirmDelete} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Projects & Sites"
        description="Every construction project, its team, budget and current progress."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Projects / Sites' }]}
        actions={
          <Link to="/admin/projects/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New project
            </Button>
          </Link>
        }
      />

      {banner && (
        <Alert tone={banner.tone} className="mb-4">{banner.message}</Alert>
      )}

      {error ? (
        <>
          <Alert tone="error" title="Could not load projects">{error.message}</Alert>
          <Button className="mt-4" onClick={reload}>Try again</Button>
        </>
      ) : (
        <Card>
          <div className="border-b border-line px-5 py-4">
            <ProjectFilters filters={filters} onChange={setFilters} lookups={lookups} />
          </div>

          <DataTable
            columns={columns}
            rows={projects}
            isLoading={isLoading}
            empty={{
              icon: Building2,
              title: 'No projects match these filters',
              description: 'Clear the filters, or create the first project to get started.',
              action: (
                <Button variant="secondary" onClick={() => setFilters(INITIAL_FILTERS)}>Clear filters</Button>
              ),
            }}
            renderCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/admin/projects/${row.id}`} className="font-medium text-ink hover:text-brand-700">{row.name}</Link>
                    <p className="mt-0.5 text-xs text-ink-subtle">{row.code} · {row.location}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {row.client?.name ?? 'No client'} · {row.contractor?.name ?? 'No contractor'}
                </p>
                <ProgressBar value={row.progress} status={row.status} showLabel className="mt-3" />
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="tabular-nums text-ink">
                    {formatCompactCurrency(row.spentAmount)} / {formatCompactCurrency(row.estimatedBudget)}
                  </span>
                  <span className="text-ink-subtle">{formatDate(row.expectedCompletion)}</span>
                </div>
                <div className="mt-3">
                  <RowActions row={row} canDelete={canDelete} navigate={navigate} onAssign={setAssigning} onDelete={setConfirmDelete} />
                </div>
              </div>
            )}
          />

          <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
        </Card>
      )}

      <AssignTeamDialog
        project={assigning}
        lookups={lookups}
        onClose={() => setAssigning(null)}
        onSaved={(updated) => {
          setAssigning(null);
          setBanner({ tone: 'success', message: `Team updated for ${updated.name}.` });
          reload();
        }}
      />

      <Modal
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Archive this project?"
        description={confirmDelete?.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button onClick={handleDelete} isLoading={isDeleting} loadingText="Archiving…" className="bg-danger hover:bg-danger/90">
              Archive project
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-muted">
          The project disappears from this list, but its sites, expenses and approval history stay in
          the database so finance and reporting remain accurate. Nothing is permanently deleted.
        </p>
      </Modal>
    </>
  );
}

function RowActions({ row, canDelete, navigate, onAssign, onDelete }) {
  const base = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors';

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link to={`/admin/projects/${row.id}`} className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`} aria-label={`View ${row.name}`}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View
      </Link>
      <button type="button" onClick={() => navigate(`/admin/projects/${row.id}/edit`)} className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`} aria-label={`Edit ${row.name}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </button>
      <button type="button" onClick={() => onAssign(row)} className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`} aria-label={`Assign team for ${row.name}`}>
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        Team
      </button>
      <Link to={`/admin/projects/${row.id}`} className={`${base} border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100`} aria-label={`Open ${row.name}`}>
        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
        Open
      </Link>
      {canDelete && (
        <button type="button" onClick={() => onDelete(row)} className={`${base} border-danger/30 text-danger hover:bg-danger-soft`} aria-label={`Archive ${row.name}`}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Archive
        </button>
      )}
    </div>
  );
}
