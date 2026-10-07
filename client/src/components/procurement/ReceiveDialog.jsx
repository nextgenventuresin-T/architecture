import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, TextAreaField } from '../ui/Field';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber } from '../../utils/format';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records a delivery against an ordered (or already partially received)
 * request. The remaining quantity is the ceiling — the API rejects anything
 * over it, but showing it here means the mistake is caught before it's sent.
 */
export default function ReceiveDialog({ request, onClose, onSaved }) {
  const [values, setValues] = useState({ received_quantity: '', receiving_date: today(), notes: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!request) return;
    setError(null);
    setFieldErrors({});
    setValues({
      received_quantity: request.receiving.remainingQuantity !== null ? String(request.receiving.remainingQuantity) : '',
      receiving_date: today(),
      notes: '',
    });
  }, [request]);

  if (!request) return null;

  const remaining = request.receiving.remainingQuantity;

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  function validate() {
    const errors = {};
    const qty = Number(values.received_quantity);
    if (!values.received_quantity || qty <= 0) errors.received_quantity = 'Enter a quantity greater than zero.';
    else if (remaining !== null && qty > remaining) {
      errors.received_quantity = `Only ${formatNumber(remaining)} ${request.unit} remains to be received.`;
    }
    if (!values.receiving_date) errors.receiving_date = 'Enter the receiving date.';
    else if (new Date(values.receiving_date) > new Date()) {
      errors.receiving_date = 'The receiving date cannot be in the future.';
    }
    return errors;
  }

  async function handleSave() {
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await procurementApi.receive(request.id, {
        received_quantity: Number(values.received_quantity),
        receiving_date: values.receiving_date,
        notes: values.notes.trim() || null,
      });
      const isFull = remaining !== null && Number(values.received_quantity) >= remaining;
      onSaved(isFull ? 'Delivery recorded — request fully received.' : 'Partial delivery recorded.');
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Receive material"
      description={`${request.requestNumber} · ${request.material.name}${
        request.purchaseOrder ? ` · ${request.purchaseOrder.poNumber}` : ''
      }`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} loadingText="Recording…">Record receiving</Button>
        </>
      }
    >
      {error && !error.details && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      {remaining !== null && (
        <p className="mb-4 text-sm text-ink-muted">
          {formatNumber(request.receiving.receivedQuantity)} of {formatNumber(request.purchaseOrder?.orderedQuantity ?? 0)}{' '}
          {request.unit} received so far · {formatNumber(remaining)} {request.unit} remaining.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label={`Received quantity (${request.unit})`}
          required
          type="number"
          min="0"
          step="0.01"
          value={values.received_quantity}
          onChange={set('received_quantity')}
          error={fieldErrors.received_quantity}
          hint={remaining !== null ? `Prefilled with the full remaining ${formatNumber(remaining)} — reduce it for a partial delivery.` : undefined}
        />
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
          placeholder="Challan number, vehicle, condition on arrival…"
        />
      </div>
    </Modal>
  );
}
