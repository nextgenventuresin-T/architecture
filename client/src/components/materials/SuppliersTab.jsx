import { Truck, ClipboardList } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge, { StatusBadge } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import DataTable from '../ui/DataTable';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';

/**
 * Who supplies this material, and the material requests raised against the
 * projects it is stocked on. `approval_requests` is a generic Interface 3
 * table with no material_id, so requests are project-scoped and the ones whose
 * title names this material are flagged rather than assumed.
 */
export default function SuppliersTab({ material, suppliers, requests }) {
  const supplierColumns = [
    { key: 'supplier', header: 'Supplier', render: (row) => <span className="font-medium text-ink">{row.supplier}</span> },
    {
      key: 'deliveries',
      header: 'Deliveries',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{row.delivery_count}</span>,
    },
    {
      key: 'quantity',
      header: 'Total supplied',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">
          {formatNumber(row.total_quantity)} {material.unit}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Average rate',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.avg_rate)}</span>,
    },
    {
      key: 'last',
      header: 'Last delivery',
      render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.last_delivery)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Supplier information"
          description="Everyone who has delivered this material, from its stock entries."
        />
        <DataTable
          columns={supplierColumns}
          rows={suppliers}
          empty={{
            icon: Truck,
            title: 'No suppliers recorded',
            description: 'Suppliers named on stock entries will be summarised here.',
          }}
          renderCard={(row) => (
            <div>
              <p className="font-medium text-ink">{row.supplier}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {row.delivery_count} deliveries · {formatNumber(row.total_quantity)} {material.unit} ·{' '}
                {formatCurrency(row.avg_rate)} avg
              </p>
              <p className="mt-1 text-xs text-ink-subtle">Last: {formatDate(row.last_delivery)}</p>
            </div>
          )}
        />
      </Card>

      <Card>
        <CardHeader
          title="Material requests"
          description="Requests on the projects where this material is stocked."
        />
        {requests.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No material requests"
            description="Material requests raised for these projects will appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((req) => (
              <li key={req.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{req.title}</p>
                    {Number(req.mentions_material) === 1 && <Badge tone="brand">Names this material</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {req.project_name}
                    {req.site_name ? ` · ${req.site_name}` : ''} · by {req.requested_by} ·{' '}
                    {formatDate(req.requested_on)}
                  </p>
                  {req.details && <p className="mt-1.5 text-sm text-ink-muted">{req.details}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {req.amount != null && (
                    <span className="whitespace-nowrap text-sm tabular-nums text-ink-muted">
                      {formatCurrency(req.amount)}
                    </span>
                  )}
                  <StatusBadge status={req.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
