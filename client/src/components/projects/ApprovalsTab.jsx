import { useState } from 'react';
import { Check, X, ClipboardCheck } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import DataTable from '../ui/DataTable';
import { StatusBadge } from '../ui/Badge';
import Alert from '../ui/Alert';
import { approvalsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';
import { formatCurrency, formatDate } from '../../utils/format';
import { REQUEST_TYPE_LABELS, labelFor } from '../../utils/projectOptions';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../config/roles';

/**
 * Requests raised by site teams against this project. Admin and Finance can
 * decide them here; everyone else sees the queue read-only.
 */
export default function ApprovalsTab({ detail, onChanged }) {
  const { user } = useAuth();
  const canDecide = [ROLES.ADMIN, ROLES.FINANCE].includes(user?.role);

  const [pendingId, setPendingId] = useState(null);
  const [banner, setBanner] = useState(null);

  async function decide(approval, decision) {
    setPendingId(approval.id);
    setBanner(null);
    try {
      await approvalsApi.decide(approval.id, decision);
      setBanner({ tone: 'success', message: `${approval.title} was ${decision}.` });
      await onChanged();
    } catch (caught) {
      setBanner({ tone: 'error', message: toApiError(caught).message });
    } finally {
      setPendingId(null);
    }
  }

  const columns = [
    {
      key: 'request',
      header: 'Request',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.title}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {labelFor(REQUEST_TYPE_LABELS, row.request_type)}{row.site_name ? ` · ${row.site_name}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'by', header: 'Requested by', render: (row) => <span className="text-ink-muted">{row.requested_by}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="tabular-nums text-ink">{row.amount ? formatCurrency(row.amount) : '—'}</span> },
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.requested_on)}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (row) => {
        if (row.status !== 'pending') {
          return <span className="text-xs text-ink-subtle">{row.decision_note || `Decided ${formatDate(row.decided_on)}`}</span>;
        }
        if (!canDecide) return <span className="text-xs text-ink-subtle">Awaiting admin</span>;

        const busy = pendingId === row.id;
        return (
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(row, 'approved')}
              aria-label={`Approve ${row.title}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(row, 'rejected')}
              aria-label={`Reject ${row.title}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </button>
          </div>
        );
      },
    },
  ];

  const pendingCount = detail.approvals.filter((a) => a.status === 'pending').length;

  return (
    <>
      {banner && <Alert tone={banner.tone} className="mb-4">{banner.message}</Alert>}
      <Card>
        <CardHeader
          title="Approvals"
          description={pendingCount ? `${pendingCount} awaiting a decision` : 'Nothing awaiting a decision'}
        />
        <DataTable
          columns={columns}
          rows={detail.approvals}
          empty={{ icon: ClipboardCheck, title: 'No requests raised', description: 'Material and payment requests from this project will appear here.' }}
        />
      </Card>
    </>
  );
}
