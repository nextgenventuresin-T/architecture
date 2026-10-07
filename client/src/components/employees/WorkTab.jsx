import { ClipboardList, Users } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge, { StatusBadge } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import DataTable from '../ui/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

/**
 * What is actually happening on this employee's sites: the latest daily
 * activity logs, and the labour recorded against those sites. Both are read
 * from the Interface 3 tables — nothing here is employee-specific data entry.
 */
export default function WorkTab({ activities, labour }) {
  const labourColumns = [
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.category}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">{row.site_name} · {row.project_name}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.record_date)}</span> },
    {
      key: 'headcount',
      header: 'Present / total',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">
          {row.present_count} / {row.worker_count}
        </span>
      ),
    },
    { key: 'contractor', header: 'Contractor', render: (row) => <span className="text-ink-muted">{row.contractor_name || '—'}</span> },
    { key: 'cost', header: 'Daily cost', render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.daily_cost)}</span> },
    { key: 'payment', header: 'Payment', render: (row) => <StatusBadge status={row.payment_status} /> },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Recent site activity"
          description="Latest daily logs from the sites this employee covers."
        />
        {activities.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No activity logged yet"
            description="Daily activity recorded against this employee's sites will appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {activities.map((activity) => (
              <li key={activity.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{activity.site_name}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">{activity.project_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{formatDate(activity.activity_date)}</Badge>
                    <Badge tone="brand">{activity.labour_present} present</Badge>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                  {activity.work_completed}
                </p>
                {activity.issues && (
                  <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{activity.issues}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Labour on their sites"
          description="Labour records for every site this employee is attached to."
        />
        <DataTable
          columns={labourColumns}
          rows={labour}
          empty={{
            icon: Users,
            title: 'No labour records',
            description: "Labour logged against this employee's sites will show up here.",
          }}
          renderCard={(row) => (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.category}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">{row.site_name}</p>
                </div>
                <StatusBadge status={row.payment_status} />
              </div>
              <p className="mt-2 text-sm text-ink-muted">
                {formatDate(row.record_date)} · {row.present_count}/{row.worker_count} present ·{' '}
                {formatCurrency(row.daily_cost)}
              </p>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
