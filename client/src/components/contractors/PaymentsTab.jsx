import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Card } from '../ui/Card';
import DataTable from '../ui/DataTable';
import { StatusBadge } from '../ui/Badge';
import { formatCurrency, formatDate } from '../../utils/format';

/** Contract value, amount paid and outstanding balance per project. */
export default function PaymentsTab({ payments }) {
  const columns = [
    {
      key: 'project',
      header: 'Project',
      render: (row) => (
        <Link to={`/admin/projects/${row.project_id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
          {row.project_code} — {row.project_name}
        </Link>
      ),
    },
    { key: 'contract', header: 'Contract value', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.contract_value)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.paid_amount)}</span> },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      render: (row) => (
        <span className={`tabular-nums ${row.outstanding > 0 ? 'text-danger' : 'text-ink'}`}>{formatCurrency(row.outstanding)}</span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.payment_status} /> },
    { key: 'updated', header: 'Updated', render: (row) => <span className="whitespace-nowrap text-ink-subtle">{formatDate(row.updated_at)}</span> },
  ];

  return (
    <Card>
      <DataTable
        columns={columns}
        rows={payments}
        empty={{ icon: Wallet, title: 'No contract payments recorded', description: 'Payments appear here once a contract value is logged for a project.' }}
      />
    </Card>
  );
}
