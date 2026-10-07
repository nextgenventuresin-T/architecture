import { ClipboardCheck } from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import { StatusBadge } from '../ui/Badge';
import { formatCurrency, formatDate } from '../../utils/format';
import { REQUEST_TYPE_LABELS } from '../../utils/projectOptions';

/** Approval requests raised under this contractor's name, matched the same way the project detail screen does. */
export default function ApprovalsTab({ approvals }) {
  const columns = [
    {
      key: 'title',
      header: 'Request',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.title}</p>
          <p className="text-xs text-ink-subtle">{row.project_name ?? 'No project'}{row.site_name ? ` · ${row.site_name}` : ''}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (row) => <span className="text-ink-muted">{REQUEST_TYPE_LABELS[row.request_type] ?? row.request_type}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{row.amount ? formatCurrency(row.amount) : '—'}</span> },
    { key: 'date', header: 'Requested', render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.requested_on)}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <Card>
      <DataTable
        columns={columns}
        rows={approvals}
        empty={{ icon: ClipboardCheck, title: 'No approval requests', description: 'Requests raised under this contractor\u2019s name will show up here.' }}
      />
    </Card>
  );
}
