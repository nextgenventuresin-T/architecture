import { useCallback, useState } from 'react';
import { Plus, CalendarDays, RefreshCw } from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Pagination from '../projects/Pagination';
import LeaveFormModal from './LeaveFormModal';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import { hrApi } from '../../api/hrApi';
import { toApiError } from '../../api/axiosClient';
import { formatDate } from '../../utils/format';
import { LEAVE_STATUS_TONE } from '../../utils/hrOptions';
import { ROLES } from '../../config/roles';

const INITIAL_FILTERS = { status: 'all', page: 1 };

/**
 * Leave list tab.
 *
 * - Employees see their own leave; "Apply" button creates a new request.
 * - HR/Admin see all leave; can approve or reject individual rows.
 * - Contractors don't have leave (this tab is not wired into /contractor).
 *
 * Props:
 *   employeeOnly — true when mounted in /employee workspace; hides approve/reject,
 *                  shows "Apply for leave" button instead.
 */
export default function LeaveTab({ employeeOnly = false }) {
  const { user } = useAuth();
  const isHrOrAdmin = [ROLES.ADMIN, ROLES.HR].includes(user?.role);
  const canApply = Boolean(user); // any authenticated user can apply
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const load = useCallback(
    () =>
      hrApi.leave.list({
        status: filters.status !== 'all' ? filters.status : undefined,
        page: filters.page,
        pageSize: 15,
      }),
    [filters.status, filters.page]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const leaves = data?.leaves ?? [];

  async function handleApprove(row) {
    setBusyId(row.id);
    setBusyAction('approve');
    setActionError(null);
    try {
      await hrApi.leave.approve(row.id, '');
      reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function handleReject(row) {
    const note = window.prompt('Rejection reason (required):');
    if (note === null) return;
    if (!note.trim()) {
      setActionError({ message: 'A rejection reason is required.' });
      return;
    }
    setBusyId(row.id);
    setBusyAction('reject');
    setActionError(null);
    try {
      await hrApi.leave.reject(row.id, note.trim());
      reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.employee?.fullName ?? '—'}</p>
          <p className="text-xs text-ink-subtle">{row.employee?.designation ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Leave type',
      render: (row) => (
        <span className="text-ink-muted capitalize">{row.leaveType?.replace('_', ' ') ?? '—'}</span>
      ),
    },
    {
      key: 'dates',
      header: 'Period',
      render: (row) => (
        <span className="whitespace-nowrap text-ink-muted">
          {formatDate(row.startDate)} → {formatDate(row.endDate)}
          <span className="ml-1 text-xs text-ink-subtle">({row.daysCount ?? '?'} day{row.daysCount !== 1 ? 's' : ''})</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={LEAVE_STATUS_TONE[row.status] ?? 'neutral'}>
          {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <span className="block max-w-[200px] truncate text-sm text-ink-subtle">
          {row.reason ?? '—'}
        </span>
      ),
    },
  ];

  // HR/Admin: inline approve/reject on pending rows
  if (!employeeOnly && isHrOrAdmin) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) =>
        row.status === 'PENDING' ? (
          <div className="flex gap-1.5 justify-end">
            <Button
              size="md"
              className="!h-8 !px-2.5 !text-xs"
              onClick={() => handleApprove(row)}
              isLoading={busyId === row.id && busyAction === 'approve'}
              loadingText="…"
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              tone="danger"
              size="md"
              className="!h-8 !px-2.5 !text-xs"
              onClick={() => handleReject(row)}
              isLoading={busyId === row.id && busyAction === 'reject'}
              loadingText="…"
            >
              Reject
            </Button>
          </div>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    });
  }

  // Employee: cancel own pending requests
  if (employeeOnly) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'PENDING' ? (
          <Button
            variant="secondary"
            tone="danger"
            size="md"
            className="!h-8 !px-2.5 !text-xs"
            onClick={async () => {
              setBusyId(row.id);
              try { await hrApi.leave.cancel(row.id); reload(); }
              catch (caught) { setActionError(toApiError(caught)); }
              finally { setBusyId(null); }
            }}
            isLoading={busyId === row.id}
            loadingText="…"
          >
            Withdraw
          </Button>
        ) : null,
    });
  }

  return (
    <div className="p-5">
      {actionError && (
        <Alert tone="error" className="mb-4" title="Action failed">
          {actionError.message}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Leave</h3>
            <p className="text-sm text-ink-muted">
              {employeeOnly ? 'Your leave requests and history.' : 'Employee leave requests.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="all">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button variant="secondary" onClick={reload} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
            {canApply && (
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Apply for leave
              </Button>
            )}
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load leave records">
              {error.message}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={leaves}
              isLoading={isLoading}
              empty={{
                icon: CalendarDays,
                title: 'No leave records',
                description: 'Apply for leave using the button above.',
              }}
            />
            <Pagination
              pagination={data?.pagination}
              onChange={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </>
        )}
      </Card>

      <LeaveFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onCreated={reload}
      />
    </div>
  );
}
