import { ShoppingCart } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import InfoList from '../projects/InfoList';
import Button from '../ui/Button';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';

/** Purchase-order fields — populated once a request reaches Ordered. */
export default function PurchaseOrderTab({ request, onPlaceOrder, canManage }) {
  if (!request.purchaseOrder) {
    return (
      <Card>
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold text-ink">No purchase order yet</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            {request.status === 'approved'
              ? 'This request is approved. Place the order to stamp a PO number and move it to Ordered.'
              : 'A purchase order is created once this request is approved and ordered.'}
          </p>
          {request.status === 'approved' && canManage && (
            <Button className="mt-4" onClick={onPlaceOrder}>
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              Place order
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const po = request.purchaseOrder;

  return (
    <Card>
      <CardHeader title="Purchase order" description="Stamped when this request moved to Ordered." />
      <CardBody>
        <InfoList
          columns={2}
          items={[
            { label: 'PO number', value: po.poNumber },
            { label: 'Ordered quantity', value: `${formatNumber(po.orderedQuantity)} ${request.unit}` },
            { label: 'Rate', value: formatCurrency(po.rate) },
            { label: 'Total amount', value: po.totalAmount !== null ? formatCurrency(po.totalAmount) : '—' },
            { label: 'Order date', value: formatDate(po.orderDate) },
            { label: 'Expected delivery', value: formatDate(po.expectedDeliveryDate) },
          ]}
        />
      </CardBody>
    </Card>
  );
}
