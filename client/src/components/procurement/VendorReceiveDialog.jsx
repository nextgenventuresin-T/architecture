import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, TextAreaField } from '../ui/Field';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber, formatDate } from '../../utils/format';

const today = () => new Date().toISOString().slice(0, 10);
const plate = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Contractor receives a vendor order that Admin placed for delivery to them - the
 * same way as a Central -> Contractor shipment:
 *  1. Enter the arriving VEHICLE NUMBER; it must match the one Admin recorded.
 *  2. The dispatch details (driver, phone, challan, vendor, PO, quantity) are shown.
 *  3. "Confirm receipt" adds the stock to the contractor's warehouse. The server
 *     re-verifies the vehicle, so this check is never only on the screen.
 */
export default function VendorReceiveDialog({ request, onClose, onSaved }) {
  const [vehicle, setVehicle] = useState('');
  const [verified, setVerified] = useState(false);
  const [values, setValues] = useState({ received_quantity: '', receiving_date: today(), notes: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!request) return;
    setVehicle('');
    setVerified(false);
    setError(null);
    setFieldErrors({});
    setValues({
      received_quantity: request.receiving?.remainingQuantity != null ? String(request.receiving.remainingQuantity) : '',
      receiving_date: today(),
      notes: '',
    });
  }, [request]);

  if (!request) return null;

  // A dispatched machine is received the same way, but as one serial-numbered unit.
  const isMachine = request.itemType === 'tool';
  const remaining = request.receiving?.remainingQuantity ?? null;
  const recorded = request.vehicleNumber;

  function verify() {
    if (!vehicle.trim()) {
      setFieldErrors({ vehicle_number: 'Enter the number of the vehicle that has arrived.' });
      return;
    }
    if (recorded && plate(vehicle) !== plate(recorded)) {
      setFieldErrors({ vehicle_number: 'This vehicle does not match the dispatch Admin recorded. Check the number with the driver.' });
      return;
    }
    setFieldErrors({});
    setVerified(true);
  }

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function handleConfirm() {
    const errors = {};
    const qty = Number(values.received_quantity);
    if (!isMachine) {
      if (!(qty > 0)) errors.received_quantity = 'Enter a quantity greater than zero.';
      else if (remaining !== null && qty > remaining) errors.received_quantity = `Only ${formatNumber(remaining)} ${request.unit} remains to be received.`;
    }
    if (!values.receiving_date) errors.receiving_date = 'Enter the receiving date.';
    else if (new Date(values.receiving_date) > new Date()) errors.receiving_date = 'The receiving date cannot be in the future.';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (isMachine) {
        await procurementApi.toolReceive(request.id, {
          vehicle_number: vehicle.trim(),
          receiving_date: values.receiving_date,
          notes: values.notes.trim() || null,
        });
        onSaved('Machine received - it can now be used on the task.');
        return;
      }
      await procurementApi.receive(request.id, {
        received_quantity: qty,
        receiving_date: values.receiving_date,
        vehicle_number: vehicle.trim(),
        notes: [`Vehicle: ${vehicle.trim()}`, request.driverName ? `Driver: ${request.driverName}` : '', values.notes.trim()]
          .filter(Boolean).join(' | '),
      });
      const isFull = remaining !== null && qty >= remaining;
      onSaved(isFull ? 'Material received into your stock.' : 'Partial delivery received into your stock.');
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) {
        setFieldErrors(apiError.details);
        if (apiError.details.vehicle_number) setVerified(false);
      }
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  const row = (label, value) => (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-right font-medium text-ink">{value || '—'}</dd>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isMachine ? 'Receive machine' : 'Receive material'}
      description={`${request.requestNumber} · ${isMachine ? request.tool?.name : request.material?.name}${request.purchaseOrder ? ` · ${request.purchaseOrder.poNumber}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {verified ? (
            <Button onClick={handleConfirm} isLoading={isSaving} loadingText="Receiving…">Confirm receipt</Button>
          ) : (
            <Button onClick={verify}>Verify vehicle</Button>
          )}
        </>
      }
    >
      {error && !error.details && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      <InputField
        label="Vehicle number"
        required
        value={vehicle}
        onChange={(e) => { setVehicle(e.target.value); setVerified(false); setFieldErrors({}); }}
        error={fieldErrors.vehicle_number}
        placeholder="e.g. MH-12-AB-1234"
        hint="Enter the number of the vehicle that has arrived. It must match the vendor dispatch Admin recorded."
      />

      {verified && (
        <>
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">Vehicle verified - dispatch details</p>
            <dl className="divide-y divide-emerald-100">
              {row('Vehicle number', recorded || vehicle.trim())}
              {row('Driver name', request.driverName)}
              {row('Driver phone', request.driverPhone)}
              {row('Delivery challan', request.challanNumber)}
              {isMachine && row('Machine', request.tool?.name)}
              {isMachine && row('Serial number', request.toolUnit?.serialNumber)}
              {row('Vendor', request.vendor?.name || request.supplier)}
              {!isMachine && row('PO', request.purchaseOrder?.poNumber)}
              {!isMachine && row('Ordered', `${formatNumber(request.purchaseOrder?.orderedQuantity ?? request.quantity)} ${request.unit}`)}
              {request.purchaseOrder?.expectedDeliveryDate && row('Expected', formatDate(request.purchaseOrder.expectedDeliveryDate))}
              {row('Project / site', [request.project?.name, request.site?.name].filter(Boolean).join(' · '))}
            </dl>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!isMachine && <InputField
              label={`Received quantity (${request.unit})`}
              required
              type="number"
              min="0"
              step="0.01"
              value={values.received_quantity}
              onChange={set('received_quantity')}
              error={fieldErrors.received_quantity}
              hint={remaining !== null ? `${formatNumber(remaining)} ${request.unit} still to receive - reduce it for a partial delivery.` : undefined}
            />}
            <InputField
              label="Receiving date"
              required
              type="date"
              value={values.receiving_date}
              onChange={set('receiving_date')}
              error={fieldErrors.receiving_date}
            />
            <TextAreaField
              label="Notes"
              value={values.notes}
              onChange={set('notes')}
              rows={2}
              className="sm:col-span-2"
              placeholder="Condition on arrival, shortages, damage…"
            />
          </div>
        </>
      )}
    </Modal>
  );
}
