import { Link } from 'react-router-dom';
import { useState } from 'react';
import { procurementApi } from '../../api/procurementApi';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import InfoList from '../projects/InfoList';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import { PRIORITY_LABELS, PRIORITY_TONE, PROCUREMENT_KIND_LABELS, procurementFlowLabel } from '../../utils/procurementOptions';

/** Project/site, material, supplier and the request's own quantity/cost details. */
export default function OverviewTab({ request, movement }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Flow" description="Where this material comes from and where it goes." />
        <CardBody>
          <InfoList
            columns={2}
            items={[
              { label: 'Type', value: PROCUREMENT_KIND_LABELS[request.kind] || 'Project / site' },
              { label: 'Flow', value: procurementFlowLabel(request) },
              { label: 'Source', value: request.source?.name || request.supplier || '—' },
              { label: 'Destination', value: request.destination?.name || (request.project ? `${request.project.name}${request.site ? ` · ${request.site.name}` : ''}` : '—') },
              {
                label: 'Project',
                value: request.project ? (
                  <Link to={`/admin/projects/${request.project.id}`} className="text-brand-700 hover:underline">
                    {request.project.code} — {request.project.name}
                  </Link>
                ) : '—',
              },
              {
                label: 'Site',
                value: request.site && request.project ? (
                  <Link
                    to={`/admin/projects/${request.project.id}/sites/${request.site.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {request.site.name}
                  </Link>
                ) : (request.site?.name || '—'),
              },
              ...(request.warehouseTransactionId ? [{ label: 'Stock movement', value: `Linked · ${request.billReference ? `Bill ${request.billReference}` : 'internal transfer'}` }] : []),
              ...(request.billFile ? [{ label: 'Bill / invoice', value: <BillLink id={request.id} file={request.billFile} /> }] : []),
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Material & Vendor" description="What is being procured and from which vendor." />
        <CardBody>
          <InfoList
            columns={2}
            items={[
              { label: 'Material', value: `${request.material.name} (${request.material.category})` },
              {
                label: 'Vendor',
                value: request.vendor ? (
                  <span className="font-semibold text-brand-700">
                    {request.vendor.name}
                    {request.vendor.contactPerson ? ` (${request.vendor.contactPerson})` : ''}
                  </span>
                ) : (
                  request.supplier || 'Not specified'
                ),
              },
              ...(request.vendor?.phone ? [{ label: 'Vendor Phone', value: request.vendor.phone }] : []),
              { label: 'Quantity requested', value: `${formatNumber(request.quantity)} ${request.unit}` },
              {
                label: 'Cost per unit',
                value: formatCurrency(request.purchaseRate != null ? request.purchaseRate : (request.estimatedRate || 0)),
              },
              {
                label: 'Total cost',
                value: formatCurrency(
                  request.totalAmount != null
                    ? request.totalAmount
                    : (request.purchaseRate != null
                        ? Number((Number(request.quantity || 0) * Number(request.purchaseRate)).toFixed(2))
                        : (request.estimatedTotal || 0))
                ),
              },
              { label: 'Priority', value: <Badge tone={PRIORITY_TONE[request.priority]}>{PRIORITY_LABELS[request.priority]}</Badge> },
            ]}
          />
        </CardBody>
      </Card>

      {(request.vehicleNumber || request.driverName || request.challanNumber || request.invoiceNumber || request.remarks) && (
        <Card>
          <CardHeader title="Transport & Delivery Challan" description="Vehicle, driver, challan and tax invoice details." />
          <CardBody>
            <InfoList
              columns={2}
              items={[
                ...(request.vehicleNumber ? [{ label: 'Vehicle Number', value: <span className="font-mono font-bold text-ink">{request.vehicleNumber}</span> }] : []),
                ...(request.driverName ? [{ label: 'Driver', value: `${request.driverName}${request.driverPhone ? ` (${request.driverPhone})` : ''}` }] : []),
                ...(request.challanNumber ? [{ label: 'Delivery Challan No', value: <span className="font-mono">{request.challanNumber}</span> }] : []),
                ...(request.challanDate ? [{ label: 'Challan Date', value: formatDate(request.challanDate) }] : []),
                ...(request.invoiceNumber ? [{ label: 'Invoice No', value: <span className="font-mono">{request.invoiceNumber}</span> }] : []),
                ...(request.invoiceDate ? [{ label: 'Invoice Date', value: formatDate(request.invoiceDate) }] : []),
                ...(request.remarks ? [{ label: 'Transport Remarks', value: request.remarks }] : []),
              ]}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Request details" description="Who raised it and when it's needed." />
        <CardBody>
          <InfoList
            columns={2}
            items={[
              { label: 'Requested by', value: request.requestedBy?.name ?? 'Not recorded' },
              { label: 'Required by', value: formatDate(request.requiredDate) },
              { label: 'Raised on', value: formatDate(request.createdAt) },
              { label: 'Last updated', value: formatDate(request.updatedAt) },
            ]}
          />
          {request.notes && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs uppercase tracking-wide text-ink-subtle">Notes</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink">{request.notes}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {movement && (
        <Card>
          <CardHeader
            title="Linked material movement"
            description="The dispatch/receive shipment created from this request."
          />
          <CardBody>
            <InfoList
              columns={2}
              items={[
                { label: 'Movement no.', value: movement.movementNumber },
                { label: 'Status', value: <Badge tone={movement.status === 'received' ? 'positive' : movement.status === 'in_transit' ? 'warning' : 'neutral'}>{String(movement.status || '').replace('_', ' ')}</Badge> },
                { label: 'Requested', value: movement.requestedQuantity != null ? `${formatNumber(movement.requestedQuantity)} ${movement.unit}` : '—' },
                { label: 'Dispatched', value: `${formatNumber(movement.sentQuantity)} ${movement.unit}` },
                { label: 'Received', value: movement.receivedQuantity != null ? `${formatNumber(movement.receivedQuantity)} ${movement.unit}` : '—' },
                { label: 'Vehicle', value: movement.vehicleNumber || '—' },
                { label: 'Driver', value: movement.driverName ? `${movement.driverName}${movement.driverPhone ? ` · ${movement.driverPhone}` : ''}` : '—' },
                { label: 'Transport cost', value: formatCurrency(movement.transportCost || 0) },
                { label: 'Other expense', value: formatCurrency(movement.otherExpenses || 0) },
                { label: 'Sent', value: movement.sentBy ? `${movement.sentBy.name || ''} · ${formatDate(movement.sentAt)}` : formatDate(movement.sentAt) },
                { label: 'Received on', value: movement.receivedAt ? formatDate(movement.receivedAt) : '—' },
              ]}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/** Opens the real bill/invoice through an authenticated blob fetch. */
function BillLink({ id, file }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const blob = await procurementApi.billBlob(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={open} disabled={busy} className="text-brand-700 hover:underline disabled:opacity-60">
      {busy ? 'Opening…' : `View ${file.name || 'bill'}`}
    </button>
  );
}
