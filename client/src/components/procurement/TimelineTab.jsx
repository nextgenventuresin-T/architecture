import {
  FileText, Send, Hourglass, CheckCircle2, XCircle, ShoppingCart, PackageCheck, Ban,
} from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { formatDate, formatNumber } from '../../utils/format';
import { PROCUREMENT_STATUS_LABELS } from '../../utils/procurementOptions';

const EVENT_ICON = {
  raised: FileText,
  requested: Send,
  pending_approval: Hourglass,
  approved: CheckCircle2,
  rejected: XCircle,
  ordered: ShoppingCart,
  receipt: PackageCheck,
  cancelled: Ban,
};

/**
 * A chronological read of the request's life so far. Built from the fields
 * the schema already carries (created_at, order_date, each receipt's
 * receiving_date) plus the current status — there's no separate status-log
 * table, so this is a derived view rather than a stored history.
 */
export default function TimelineTab({ request, receipts }) {
  const events = [];

  events.push({
    key: 'raised',
    icon: 'raised',
    title: 'Request raised',
    detail: request.requestedBy?.name ? `By ${request.requestedBy.name}` : null,
    date: request.createdAt,
  });

  if (request.purchaseOrder?.orderDate) {
    events.push({
      key: 'ordered',
      icon: 'ordered',
      title: `Purchase order placed — ${request.purchaseOrder.poNumber}`,
      detail: `${formatNumber(request.purchaseOrder.orderedQuantity)} ${request.unit} ordered`,
      date: request.purchaseOrder.orderDate,
    });
  }

  for (const receipt of receipts) {
    events.push({
      key: `receipt-${receipt.id}`,
      icon: 'receipt',
      title: 'Material received',
      detail: `${formatNumber(receipt.receivedQuantity)} ${request.unit}${receipt.notes ? ` · ${receipt.notes}` : ''}`,
      date: receipt.receivingDate,
    });
  }

  if (['rejected', 'cancelled'].includes(request.status)) {
    events.push({
      key: 'terminal',
      icon: request.status,
      title: `Request ${PROCUREMENT_STATUS_LABELS[request.status]?.toLowerCase() ?? request.status}`,
      detail: null,
      date: request.updatedAt,
    });
  }

  const sorted = events
    .filter((e) => e.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <Card>
      <CardHeader title="Timeline" description="Key events in this request's life, oldest first." />
      <ol className="space-y-5 px-5 py-5">
        {sorted.map((event, index) => {
          const Icon = EVENT_ICON[event.icon] ?? FileText;
          return (
            <li key={event.key} className="relative flex gap-3.5 pl-1">
              {index < sorted.length - 1 && (
                <span className="absolute left-[15px] top-8 h-[calc(100%-0.5rem)] w-px bg-line" aria-hidden="true" />
              )}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium text-ink">{event.title}</p>
                {event.detail && <p className="mt-0.5 text-sm text-ink-muted">{event.detail}</p>}
                <p className="mt-0.5 text-xs text-ink-subtle">{formatDate(event.date)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
