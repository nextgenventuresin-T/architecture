import { useCallback, useState } from 'react';
import { Plus, Square, HardHat, RefreshCw } from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Pagination from '../projects/Pagination';
import AssignmentFormModal from './AssignmentFormModal';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import { hrApi } from '../../api/hrApi';
import { toApiError } from '../../api/axiosClient';
import { formatDate } from '../../utils/format';
import { ASSIGNMENT_STATUS_TONE } from '../../utils/hrOptions';
import { ROLES } from '../../config/roles';

const INITIAL_FILTERS = { status: 'active', page: 1 };

/**
 * Reused as three distinct dashboard tabs — Company Labour, Contractor
 * Labour and Assignments — by fixing `fixedLabourType`. All three read the
 * same `GET /hr/assignments`; a company/contractor split is a filter on
 * that one list, not a separate resource server-side.
 */
export default function AssignmentsTab({ fixedLabourType, title = 'Assignments' }) {
  const { user } = useAuth();
  const canManage = [ROLES.ADMIN, ROLES.HR].includes(user?.role);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [endingId, setEndingId] = useState(null);

  const load = useCallback(
    () => hrApi.assignments.list({
      labourType: fixedLabourType || undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      page: filters.page,
      pageSize: 10,
    }),
    [fixedLabourType, filters.status, filters.page]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const assignments = data?.assignments ?? [];

  async function endAssignment(row) {
    setEndingId(row.id);
    setActionError(null);
    try {
      await hrApi.assignments.end(row.id, new Date().toISOString().slice(0, 10));
      reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setEndingId(null);
    }
  }

  const columns = [
    {
      key: 'worker',
      header: 'Worker',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.worker.name}</p>
          <p className="text-xs text-ink-subtle">
            {row.labourType === 'company' ? row.worker.designation : row.worker.skillCategory}
            {row.contractor ? ` · ${row.contractor.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <Badge tone={row.labourType === 'company' ? 'brand' : 'warning'}>{row.labourType === 'company' ? 'Company' : 'Contractor'}</Badge>,
    },
    {
      key: 'where',
      header: 'Project / site',
      render: (row) => (
        <div>
          <p className="text-ink-muted">{row.project.name}</p>
          {row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Period',
      render: (row) => (
        <span className="whitespace-nowrap text-ink-muted">
          {formatDate(row.startDate)} → {row.endDate ? formatDate(row.endDate) : 'ongoing'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={ASSIGNMENT_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) =>
        row.status === 'active' ? (
          <Button
            variant="secondary"
            size="md"
            className="!h-8 !px-2.5 !text-xs"
            onClick={() => endAssignment(row)}
            isLoading={endingId === row.id}
            loadingText="Ending…"
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            End
          </Button>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    });
  }

  return (
    <div className="p-5">
      {actionError && <Alert tone="error" className="mb-4" title="Could not update this assignment">{actionError.message}</Alert>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
            <p className="text-sm text-ink-muted">Who is currently posted where.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </select>
            <Button variant="secondary" onClick={reload} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
            {canManage && (
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Post assignment
              </Button>
            )}
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load assignments">{error.message}</Alert>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={assignments}
              isLoading={isLoading}
              empty={{ icon: HardHat, title: 'No assignments found', description: 'Post labour to a project to see it here.' }}
            />
            <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
          </>
        )}
      </Card>

      {canManage && (
        <AssignmentFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onCreated={reload}
          fixedLabourType={fixedLabourType}
        />
      )}
    </div>
  );
}
