import { Users } from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import { StatusBadge } from '../ui/Badge';
import { formatCurrency, formatDate } from '../../utils/format';

/** Every labour record logged against a site this contractor supplies workers to. */
export default function LabourTab({ labour }) {
  const columns = [
    { key: 'site', header: 'Site', render: (row) => (
      <div className="min-w-0">
        <p className="font-medium text-ink">{row.site_name}</p>
        <p className="text-xs text-ink-subtle">{row.project_name}</p>
      </div>
    ) },
    { key: 'category', header: 'Category', render: (row) => <span className="text-ink-muted">{row.category}</span> },
    {
      key: 'workers',
      header: 'Workers',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">{row.present_count} / {row.worker_count} present</span>
      ),
    },
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.record_date)}</span> },
    {
      key: 'cost',
      header: 'Daily cost',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.daily_cost)}</span>,
    },
    { key: 'status', header: 'Payment', render: (row) => <StatusBadge status={row.payment_status} /> },
  ];

  return (
    <Card>
      <DataTable
        columns={columns}
        rows={labour}
        empty={{ icon: Users, title: 'No labour records yet', description: 'Labour is logged from a site\u2019s daily activity log.' }}
      />
    </Card>
  );
}
