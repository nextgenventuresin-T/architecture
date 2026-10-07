import { PackagePlus, Truck } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Button from '../ui/Button';
import ProgressBar from '../ui/ProgressBar';
import { formatDate, formatNumber } from '../../utils/format';

/** Remaining quantity, a progress bar toward the ordered total, and every receiving record so far. */
export default function ReceivingTab({ request, receipts, onReceive, canReceive }) {
  if (!request.purchaseOrder) {
    return (
      <Card>
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Truck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold text-ink">Nothing to receive yet</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            Receiving opens up once this request has a purchase order and moves to Ordered.
          </p>
        </div>
      </Card>
    );
  }

  const ordered = request.purchaseOrder.orderedQuantity ?? 0;
  const received = request.receiving.receivedQuantity;
  const remaining = request.receiving.remainingQuantity ?? 0;
  const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;

  const columns = [
    { key: 'date', header: 'Receiving date', render: (row) => <span className="whitespace-nowrap text-ink">{formatDate(row.receivingDate)}</span> },
    {
      key: 'quantity',
      header: 'Quantity received',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink">{formatNumber(row.receivedQuantity)} {request.unit}</span>,
    },
    { key: 'notes', header: 'Notes', render: (row) => <span className="text-ink-muted">{row.notes || '—'}</span> },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Receiving progress"
          description={`${formatNumber(received)} of ${formatNumber(ordered)} ${request.unit} received.`}
          action={
            canReceive && ['ordered', 'partially_received'].includes(request.status) ? (
              <Button onClick={onReceive}>
                <PackagePlus className="h-4 w-4" aria-hidden="true" />
                Receive material
              </Button>
            ) : null
          }
        />
        <CardBody>
          <ProgressBar value={percent} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink-muted">{percent}% received</span>
            <span className={remaining > 0 ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>
              {remaining > 0 ? `${formatNumber(remaining)} ${request.unit} remaining` : 'Fully received'}
            </span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Receiving history"
          description={`${receipts.length} ${receipts.length === 1 ? 'delivery' : 'deliveries'} recorded.`}
        />
        <DataTable
          columns={columns}
          rows={receipts}
          empty={{ icon: Truck, title: 'No deliveries recorded yet', description: 'Receipts appear here as material arrives against this order.' }}
        />
      </Card>
    </div>
  );
}
