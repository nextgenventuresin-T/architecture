import { useCallback, useState } from 'react';
import { Plus, ClipboardList, RefreshCw } from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Pagination from '../projects/Pagination';
import LabourRequestFormModal from './LabourRequestFormModal';
import LabourRequestDetailModal from './LabourRequestDetailModal';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import { hrApi } from '../../api/hrApi';
import { formatDate } from '../../utils/format';
import {
  LABOUR_REQUEST_STATUS_LABELS,
  LABOUR_REQUEST_STATUS_TONE,
  PRIORITY_TONE,
} from '../../utils/hrOptions';
import { ROLES } from '../../config/roles';

const INITIAL_FILTERS = { status: 'all', priority: 'all', page: 1 };

/**
 * Labour Requests list tab. Contractor users see only their own requests;
 * Admin/HR see all. "New request" is available to Contractor (and HR/Admin
 * for internal requests). The status filter respects the full lifecycle.
 */
export default function LabourRequestsTab() {
  const { user } = useAuth();
  const canCreate = [ROLES.ADMIN, ROLES.HR, ROLES.CONTRACTOR].includes(user?.role);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(
    () =>
      hrApi.requests.list({
        status: filters.status !== 'all' ? filters.status : undefined,
        priority: filters.priority !== 'all' ? filters.priority : undefined,
        page: filters.page,
        pageSize: 10,
      }),
    [filters.status, filters.priority, filters.page]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const requests = data?.requests ?? [];

  const columns = [
    {
      key: 'title',
      header: 'Request',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.title}</p>
          <p className="text-xs text-ink-subtle">
            {row.requestNumber} · {row.labourType === 'company' ? 'Company' : 'Contractor'} ·{' '}
            {row.quantity} worker{row.quantity !== 1 ? 's' : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <Badge tone={PRIORITY_TONE[row.priority] ?? 'neutral'}>
          {row.priority.charAt(0).toUpperCase() + row.priority.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={LABOUR_REQUEST_STATUS_TONE[row.status] ?? 'neutral'}>
          {LABOUR_REQUEST_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (row) => (
        <div>
          <p className="text-ink-muted">{row.project?.name ?? '—'}</p>
          {row.site && <p className="text-xs text-ink-subtle">{row.site.name}</p>}
        </div>
      ),
    },
    {
      key: 'requiredFrom',
      header: 'Required from',
      render: (row) => (
        <span className="whitespace-nowrap text-ink-muted">
          {row.requiredFrom ? formatDate(row.requiredFrom) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="md"
          className="!h-8 !px-2.5 !text-xs"
          onClick={() => setSelectedId(row.id)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="p-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Labour Requests</h3>
            <p className="text-sm text-ink-muted">
              Requests for contractor or company labour on projects.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="all">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="APPROVED">Approved</option>
              <option value="PARTIALLY_ASSIGNED">Partially assigned</option>
              <option value="FULLY_ASSIGNED">Fully assigned</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <select
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value, page: 1 }))}
              className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="all">All priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <Button variant="secondary" onClick={reload} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
            {canCreate && (
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New request
              </Button>
            )}
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load labour requests">
              {error.message}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={requests}
              isLoading={isLoading}
              empty={{
                icon: ClipboardList,
                title: 'No labour requests found',
                description: 'Create a new request to get started.',
              }}
            />
            <Pagination
              pagination={data?.pagination}
              onChange={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </>
        )}
      </Card>

      {canCreate && (
        <LabourRequestFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onCreated={reload}
        />
      )}

      {selectedId && (
        <LabourRequestDetailModal
          requestId={selectedId}
          onClose={() => {
            setSelectedId(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
