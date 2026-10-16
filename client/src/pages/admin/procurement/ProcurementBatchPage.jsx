import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Send, Check, X, ShoppingCart, Truck, PackageCheck, ClipboardCheck } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Modal from '../../../components/ui/Modal';
import { InputField } from '../../../components/ui/Field';
import { procurementApi } from '../../../api/procurementApi';
import { toApiError } from '../../../api/axiosClient';
import useAuth from '../../../hooks/useAuth';
import { ROLES } from '../../../config/roles';
import { formatCurrency, formatDate, formatNumber } from '../../../utils/format';
import { PROCUREMENT_STATUS_LABELS, PROCUREMENT_STATUS_TONE, procurementFlowLabel } from '../../../utils/procurementOptions';

const today = () => new Date().toISOString().slice(0, 10);
const plate = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * One multi-item request. Lists every item with its own source, destination, links and
 * status, and offers the actions this viewer can take on ALL applicable items at once.
 * Each action runs the normal per-item step on every item (results shown per item);
 * any single item can still be opened and handled on its own.
 */
export default function ProcurementBatchPage({ basePath = '/admin' }) {
  const { batchId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role;
  const modulePath = basePath === '/admin' ? '/admin/procurement' : basePath;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null); // 'order' | 'dispatch' | 'receive'

  const load = useCallback(() => {
    procurementApi.batch(batchId).then(setData).catch((e) => setError(toApiError(e)));
  }, [batchId]);
  useEffect(load, [load]);

  async function act(action, payload = {}, label) {
    setBusy(action);
    setResults(null);
    setFlash(null);
    try {
      const out = await procurementApi.batchAction(batchId, action, payload);
      setData({ batch: out.batch, items: out.items });
      setResults({ label, rows: out.results });
      setDialog(null);
    } catch (e) {
      const apiError = toApiError(e);
      setResults({ label, error: apiError.details?.vehicle_number || apiError.message });
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Alert tone="error" title="Could not load this request">{error.message}</Alert>;
  if (!data) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const { batch, items } = data;
  const isAdmin = role === ROLES.ADMIN;
  const canOrderRole = [ROLES.ADMIN, ROLES.PROCUREMENT].includes(role);
  const count = (fn) => items.filter(fn).length;

  const nSubmit = count((r) => r.status === 'requested');
  const nApprove = isAdmin ? count((r) => r.status === 'pending_approval') : 0;
  const nConfirm = count((r) => r.canConfirmSource);
  const nOrder = canOrderRole ? count((r) => r.status === 'approved' && r.itemType !== 'tool' && r.sourceType === 'supplier' && r.kind !== 'central_purchase') : 0;
  const nDispatch = count((r) => r.canDispatch);
  const awaitingVehicle = items.filter((r) =>
    (r.movement?.status === 'in_transit')
    || (['ordered', 'partially_received'].includes(r.status) && (r.canReceiveOrder || r.canReceiveTool || [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(role)))
    || (r.kind === 'central_purchase' && r.status === 'approved' && [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(role)));
  const totalValue = items.reduce((s, r) => s + Number(r.estimatedTotal || 0), 0);
  const totalTransport = items.reduce((s, r) => s + Number(r.transportCost || 0), 0);
  // Freight quoted on the items being sent: prefilled for the shared vehicle, booked once.
  const quotedForDispatch = items.filter((r) => r.canDispatch).reduce((s, r) => s + Number(r.transportCost || 0), 0);

  return (
    <>
      <PageHeader
        title={`${batch.number} · ${items.length} item${items.length === 1 ? '' : 's'}`}
        description={`${batch.flowLabel} · raised by ${batch.requestedBy?.name || 'unknown'} on ${formatDate(batch.createdAt)}`}
        breadcrumbs={[{ label: 'Procurement', to: modulePath }, { label: batch.number }]}
      />

      {flash && <Alert tone="positive" className="mb-4" onClose={() => setFlash(null)}>{flash}</Alert>}

      <Card className="mb-4">
        <CardHeader title="Actions on all items" description="Each runs the normal step on every item it applies to. You can still open any item and handle it alone." />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {nSubmit > 0 && (
              <Button onClick={() => act('submit', {}, 'Submit for approval')} isLoading={busy === 'submit'}>
                <Send className="h-4 w-4" aria-hidden="true" /> Submit {nSubmit} for approval
              </Button>
            )}
            {nApprove > 0 && (
              <>
                <Button onClick={() => act('approve', {}, 'Approve')} isLoading={busy === 'approve'}>
                  <Check className="h-4 w-4" aria-hidden="true" /> Approve {nApprove}
                </Button>
                <Button variant="secondary" isLoading={busy === 'reject'}
                  onClick={() => window.confirm(`Reject all ${nApprove} pending item(s)?`) && act('reject', {}, 'Reject')}>
                  <X className="h-4 w-4" aria-hidden="true" /> Reject {nApprove}
                </Button>
              </>
            )}
            {nConfirm > 0 && (
              <Button onClick={() => act('confirm', {}, 'Confirm as source')} isLoading={busy === 'confirm'}>
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Confirm {nConfirm} you supply
              </Button>
            )}
            {nOrder > 0 && (
              <Button onClick={() => setDialog('order')}>
                <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Place orders for {nOrder} vendor item{nOrder === 1 ? '' : 's'}
              </Button>
            )}
            {nDispatch > 0 && (
              <Button onClick={() => setDialog('dispatch')}>
                <Truck className="h-4 w-4" aria-hidden="true" /> Send {nDispatch} item{nDispatch === 1 ? '' : 's'}
              </Button>
            )}
            {awaitingVehicle.length > 0 && (
              <Button onClick={() => setDialog('receive')}>
                <PackageCheck className="h-4 w-4" aria-hidden="true" /> Receive by vehicle
              </Button>
            )}
            {!nSubmit && !nApprove && !nConfirm && !nOrder && !nDispatch && !awaitingVehicle.length && (
              <p className="text-sm text-ink-subtle">Nothing is waiting on you in this request right now.</p>
            )}
          </div>

          {results && (
            <div className="mt-4 rounded-lg border border-line bg-canvas/60 p-3 text-sm">
              <p className="font-semibold text-ink">{results.label}</p>
              {results.error ? (
                <p className="mt-1 text-danger">{results.error}</p>
              ) : results.rows.length === 0 ? (
                <p className="mt-1 text-ink-muted">No item needed this action.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {results.rows.map((r) => (
                    <li key={r.id} className={r.ok ? 'text-emerald-700' : 'text-danger'}>
                      {r.ok ? '✓' : '✗'} {r.requestNumber}{r.ok ? ' done' : ` - ${r.message}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Items"
          description={totalValue > 0 || totalTransport > 0
            ? `Estimated value ${formatCurrency(totalValue)}${totalTransport > 0 ? ` + ${formatCurrency(totalTransport)} transport` : ''}`
            : undefined}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
              <tr>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5">From → To</th>
                <th className="px-4 py-2.5">Project › Site › Task</th>
                <th className="px-4 py-2.5 text-right">Value</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <Link to={`${modulePath}/${r.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">{r.requestNumber}</Link>
                    <p className="text-xs text-ink-muted">
                      {r.itemType === 'tool' ? `Machine · ${r.tool?.name}` : r.material?.name}
                      {r.itemType === 'tool' && r.rentalDays ? ` · ${r.rentalDays} day(s)` : ''}
                    </p>
                    {r.isExcess && <Badge tone="warning">{Number(r.plannedQuantityAtRequest || 0) === 0 ? 'Unplanned' : 'Over plan'}</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.quantity)} {r.unit}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">
                    <p>{r.vendor?.name || r.source?.name || r.supplier || procurementFlowLabel(r)}</p>
                    <p>→ {r.destination?.name || r.responsibleContractor?.name || r.project?.name || '—'}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">
                    {[r.project?.name, r.site?.name, r.task?.name, r.subtask?.name].filter(Boolean).join(' › ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.estimatedTotal ? formatCurrency(r.estimatedTotal) : '—'}
                    {Number(r.transportCost) > 0 && (
                      <p className="text-xs text-ink-subtle">
                        + {formatCurrency(r.transportCost)} transport{Number(r.transportPaid) > 0 ? ' (booked)' : ' (quoted)'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={PROCUREMENT_STATUS_TONE[r.status] ?? 'neutral'}>{PROCUREMENT_STATUS_LABELS[r.status] ?? r.status}</Badge>
                    {r.movement?.status === 'in_transit' && <p className="mt-1 text-xs text-amber-700">In transit · {r.movement.vehicleNumber}</p>}
                    {r.status === 'ordered' && r.vehicleNumber && !r.movement && <p className="mt-1 text-xs text-ink-subtle">Vehicle {r.vehicleNumber}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {dialog && (
        <BatchDialog
          kind={dialog}
          items={dialog === 'receive' ? awaitingVehicle : items}
          quotedTransport={quotedForDispatch}
          busy={Boolean(busy)}
          onClose={() => setDialog(null)}
          onSubmit={(payload) => act(dialog, payload, dialog === 'order' ? 'Place orders' : dialog === 'dispatch' ? 'Send items' : 'Receive by vehicle')}
        />
      )}
    </>
  );
}

/** Shared vehicle / driver details for ordering, sending or receiving many items at once. */
function BatchDialog({ kind, items, quotedTransport = 0, busy, onClose, onSubmit }) {
  const [v, setV] = useState({
    vehicle_number: '', driver_name: '', driver_phone: '', challan_number: '',
    order_date: today(), expected_delivery_date: '',
    transport_cost: kind === 'dispatch' && quotedTransport > 0 ? String(quotedTransport) : '',
    receiving_date: today(),
  });
  const quotedOnVehicle = items.reduce((s, r) => s + (Number(r.transportCost) > 0 && !(Number(r.transportPaid) > 0) ? Number(r.transportCost) : 0), 0);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => { setV((c) => ({ ...c, [k]: e.target.value })); setErr(null); };

  const matching = kind === 'receive' && plate(v.vehicle_number)
    ? items.filter((r) => [r.movement?.vehicleNumber, r.vehicleNumber].some((x) => x && plate(x) === plate(v.vehicle_number)))
    : [];

  function submit() {
    if ((kind !== 'order' || items.some((r) => r.responsibleContractor || r.site)) && !v.vehicle_number.trim()) {
      setErr('Enter the vehicle number.');
      return;
    }
    if (kind === 'receive') onSubmit({ vehicle_number: v.vehicle_number.trim(), receiving_date: v.receiving_date });
    else if (kind === 'dispatch') onSubmit({
      vehicle_number: v.vehicle_number.trim(), driver_name: v.driver_name.trim() || null, driver_phone: v.driver_phone.trim() || null,
      transport_cost: v.transport_cost ? Number(v.transport_cost) : null,
    });
    else onSubmit({
      vehicle_number: v.vehicle_number.trim() || null, driver_name: v.driver_name.trim() || null, driver_phone: v.driver_phone.trim() || null,
      challan_number: v.challan_number.trim() || null, order_date: v.order_date, expected_delivery_date: v.expected_delivery_date || null,
    });
  }

  const title = kind === 'order' ? 'Place vendor orders' : kind === 'dispatch' ? 'Send items' : 'Receive by vehicle';
  const description = kind === 'order'
    ? 'One PO per item. The vendor\'s vehicle and driver are recorded so the receiver can verify them.'
    : kind === 'dispatch'
      ? 'Everything goes on one vehicle. The receiver verifies this vehicle number. Freight is booked once, not per item.'
      : 'Enter the vehicle that arrived. Every item on it that you may receive is received in full, after the vehicle is verified.';

  return (
    <Modal isOpen onClose={onClose} title={title} description={description}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} isLoading={busy}>{title}</Button></>}>
      {err && <Alert tone="error" className="mb-3">{err}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InputField label="Vehicle number" required={kind !== 'order'} value={v.vehicle_number} onChange={set('vehicle_number')} placeholder="MH-12-AB-1234" />
        {kind === 'receive' ? (
          <InputField label="Receiving date" type="date" value={v.receiving_date} onChange={set('receiving_date')} />
        ) : (
          <>
            <InputField label="Driver name" value={v.driver_name} onChange={set('driver_name')} />
            <InputField label="Driver phone" value={v.driver_phone} onChange={set('driver_phone')} />
          </>
        )}
        {kind === 'order' && (
          <>
            <InputField label="Challan no." value={v.challan_number} onChange={set('challan_number')} />
            <InputField label="Order date" type="date" value={v.order_date} onChange={set('order_date')} />
            <InputField label="Expected delivery" type="date" value={v.expected_delivery_date} onChange={set('expected_delivery_date')} />
          </>
        )}
        {kind === 'dispatch' && (
          <InputField label="Transport cost for the vehicle (₹)" type="number" min="0" value={v.transport_cost} onChange={set('transport_cost')}
            hint={quotedTransport > 0 ? `Prefilled with the ${formatCurrency(quotedTransport)} quoted on the items. Booked once for the whole shipment.` : 'Booked once for the whole shipment.'} />
        )}
      </div>
      {kind === 'receive' && plate(v.vehicle_number) && (
        <div className="mt-3 rounded-lg border border-line bg-canvas/60 p-3 text-xs">
          {matching.length ? (
            <>
              <p className="font-semibold text-emerald-700">On this vehicle ({matching.length}):</p>
              <ul className="mt-1 space-y-0.5 text-ink">
                {matching.map((r) => (
                  <li key={r.id}>{r.requestNumber} · {r.itemType === 'tool' ? r.tool?.name : `${formatNumber(r.movement?.sentQuantity ?? r.receiving?.remainingQuantity ?? r.quantity)} ${r.unit} ${r.material?.name}`}
                    {(r.movement?.driverName || r.driverName) && ` · driver ${r.movement?.driverName || r.driverName}`}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-amber-700">No item in this request is on that vehicle. Check the number with the driver.</p>
          )}
          {matching.length > 0 && quotedOnVehicle > 0 && (
            <p className="mt-2 text-ink-muted">Transport quoted on these items is booked with their receipt, once.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
