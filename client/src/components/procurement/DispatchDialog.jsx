import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, TextAreaField } from '../ui/Field';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber } from '../../utils/format';

/**
 * SEND MATERIAL for a movement-kind request. Issues source stock now and
 * creates the linked in-transit movement; the destination only gains stock when
 * it is received. Request details are shown read-only.
 *
 * For a contractor-to-contractor transfer the request must already be
 * source_confirmed, and the vehicle number is required — it is the token the
 * receiving contractor verifies against on arrival.
 */
export default function DispatchDialog({ request, onClose, onSaved, onError }) {
  const [values, setValues] = useState({
    sent_quantity: '', vehicle_number: '', driver_name: '', driver_phone: '',
    transport_cost: '', other_expenses: '', remarks: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!request) return;
    setError(null);
    setFieldErrors({});
    setValues({
      sent_quantity: String(request.quantity ?? ''),
      vehicle_number: '', driver_name: '', driver_phone: '',
      transport_cost: '', other_expenses: '', remarks: '',
    });
  }, [request]);

  if (!request) return null;

  const isInternalTransfer = request.kind === 'internal_transfer';
  const isCentral = request.kind === 'central_purchase' ||
    request.sourceType === 'central_warehouse' ||
    request.destinationType === 'central_warehouse' ||
    request.source?.type === 'central_warehouse' ||
    request.destination?.type === 'central_warehouse';
  const isVehicleRequired = isInternalTransfer || isCentral;

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function submit() {
    if (!values.sent_quantity || Number(values.sent_quantity) <= 0) {
      setFieldErrors({ sent_quantity: 'Enter a quantity greater than zero.' });
      return;
    }
    if (request.sourceAvailableStock !== undefined && request.sourceAvailableStock !== null && Number(values.sent_quantity) > request.sourceAvailableStock) {
      setFieldErrors({
        sent_quantity: `Only ${formatNumber(request.sourceAvailableStock)} ${request.unit} available in ${request.source?.name || 'source warehouse'}.`,
      });
      return;
    }
    // The receiving contractor verifies this number before the stock lands, and
    // Central Warehouse shipments require a vehicle number.
    if (isVehicleRequired && !values.vehicle_number.trim()) {
      setFieldErrors({ vehicle_number: isCentral ? 'Vehicle number is mandatory for Central Warehouse shipments.' : 'Enter the vehicle number — the receiving contractor verifies it.' });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await procurementApi.dispatch(request.id, {
        sent_quantity: Number(values.sent_quantity),
        vehicle_number: values.vehicle_number.trim() || null,
        driver_name: values.driver_name.trim() || null,
        driver_phone: values.driver_phone.trim() || null,
        transport_cost: values.transport_cost ? Number(values.transport_cost) : 0,
        other_expenses: values.other_expenses ? Number(values.other_expenses) : 0,
        remarks: values.remarks.trim() || null,
      });
      onSaved('Material dispatched — the shipment is now in transit.');
    } catch (caught) {
      const apiErr = toApiError(caught);
      const details = apiErr.details || {};
      // The backend reports a stock shortage under `quantity`, but this dialog's
      // field is `sent_quantity` — map it so the concrete reason (e.g. "Only 0
      // cu.m available.") shows under the field instead of being lost.
      const mapped = { ...details };
      if (details.quantity && !details.sent_quantity) mapped.sent_quantity = details.quantity;
      setFieldErrors(mapped);
      // Show the specific reason in the banner too, not just "Check the highlighted fields."
      const detailMsg = Object.values(details)[0];
      const shown = apiErr.message === 'Check the highlighted fields.' && detailMsg ? detailMsg : apiErr.message;
      setError({ ...apiErr, message: shown });
      if (onError) onError({ ...apiErr, message: shown });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Send material">
      {error && <Alert tone="error" title="Could not dispatch" className="mb-4">{error.message}</Alert>}

      <div className="mb-4 rounded-lg bg-canvas px-4 py-3 text-sm text-ink-muted">
        <p><span className="text-ink-subtle">Material:</span> {request.material?.name} · <span className="text-ink-subtle">Requested:</span> {formatNumber(request.quantity)} {request.unit}</p>
        <p className="mt-0.5"><span className="text-ink-subtle">From:</span> {request.source?.name || '—'} → <span className="text-ink-subtle">To:</span> {request.destination?.name || '—'}</p>
        {request.sourceAvailableStock !== undefined && request.sourceAvailableStock !== null && (
          <p className="mt-1 text-xs">
            <span className="text-ink-subtle">Available in source warehouse: </span>
            <span className={`font-semibold tabular-nums ${request.sourceAvailableStock <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {formatNumber(request.sourceAvailableStock)} {request.unit}
            </span>
          </p>
        )}
        {request.sourceAvailableStock !== undefined && request.sourceAvailableStock !== null && request.sourceAvailableStock <= 0 && (
          <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            ⚠️ <strong>Zero stock available:</strong> The source warehouse currently has 0 {request.unit} of {request.material?.name}. Stock must be received or transferred into this warehouse before dispatching.
          </div>
        )}
        {(request.project || request.site) && (
          <p className="mt-0.5"><span className="text-ink-subtle">Project/Site:</span> {request.project?.name || '—'}{request.site ? ` · ${request.site.name}` : ''}</p>
        )}
        <p className="mt-0.5"><span className="text-ink-subtle">Reference:</span> {request.requestNumber}</p>
        {isInternalTransfer && (
          <p className="mt-1.5 text-xs text-ink-subtle">
            You confirmed this request. Sending it now takes the material out of your warehouse; it reaches the
            destination only when they receive it.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField label="Quantity to dispatch" required type="number" min="0" step="0.01" value={values.sent_quantity} onChange={set('sent_quantity')} error={fieldErrors.sent_quantity} />
        <InputField label="Vehicle number" required={isVehicleRequired} value={values.vehicle_number} onChange={set('vehicle_number')} error={fieldErrors.vehicle_number} placeholder="PB11 AB 1234" description={isCentral ? "Mandatory for Central Warehouse shipments" : undefined} />
        <InputField label="Driver name" value={values.driver_name} onChange={set('driver_name')} error={fieldErrors.driver_name} />
        <InputField label="Driver phone" value={values.driver_phone} onChange={set('driver_phone')} error={fieldErrors.driver_phone} />
        <InputField label="Transport cost" type="number" min="0" step="0.01" value={values.transport_cost} onChange={set('transport_cost')} error={fieldErrors.transport_cost} />
        <InputField label="Other expense" type="number" min="0" step="0.01" value={values.other_expenses} onChange={set('other_expenses')} error={fieldErrors.other_expenses} />
        <TextAreaField label="Remarks" value={values.remarks} onChange={set('remarks')} rows={2} className="sm:col-span-2" />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button type="button" onClick={submit} isLoading={isSaving} loadingText="Dispatching…">Send material</Button>
      </div>
    </Modal>
  );
}
