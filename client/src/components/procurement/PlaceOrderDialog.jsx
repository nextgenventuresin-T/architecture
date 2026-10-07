import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField } from '../ui/Field';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';

const today = () => new Date().toISOString().slice(0, 10);

/** Approved -> Ordered. Stamps po_number, ordered_quantity and the two dates in one step. */
export default function PlaceOrderDialog({ request, onClose, onSaved }) {
  const [values, setValues] = useState({
    po_number: '',
    ordered_quantity: '',
    order_date: today(),
    expected_delivery_date: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!request) return;
    setError(null);
    setFieldErrors({});
    setValues({
      po_number: '',
      ordered_quantity: String(request.quantity),
      order_date: today(),
      expected_delivery_date: '',
    });
  }, [request]);

  if (!request) return null;

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  function validate() {
    const errors = {};
    if (!values.ordered_quantity || Number(values.ordered_quantity) <= 0) {
      errors.ordered_quantity = 'Enter a quantity greater than zero.';
    }
    if (!values.order_date) errors.order_date = 'Enter the order date.';
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
      await procurementApi.placeOrder(request.id, {
        po_number: values.po_number.trim() || undefined,
        ordered_quantity: Number(values.ordered_quantity),
        order_date: values.order_date,
        expected_delivery_date: values.expected_delivery_date || null,
      });
      onSaved('Request moved to Ordered.');
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
      title="Place order"
      description={`${request.requestNumber} · ${request.material.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} loadingText="Placing order…">Place order</Button>
        </>
      }
    >
      {error && !error.details && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="PO number"
          value={values.po_number}
          onChange={set('po_number')}
          error={fieldErrors.po_number}
          placeholder="Leave blank and one will be generated."
          className="sm:col-span-2"
        />
        <InputField
          label={`Ordered quantity (${request.unit})`}
          required
          type="number"
          min="0"
          step="0.01"
          value={values.ordered_quantity}
          onChange={set('ordered_quantity')}
          error={fieldErrors.ordered_quantity}
        />
        <InputField
          label="Order date"
          required
          type="date"
          value={values.order_date}
          onChange={set('order_date')}
          error={fieldErrors.order_date}
        />
        <InputField
          label="Expected delivery date"
          type="date"
          value={values.expected_delivery_date}
          onChange={set('expected_delivery_date')}
          error={fieldErrors.expected_delivery_date}
          className="sm:col-span-2"
        />
      </div>
    </Modal>
  );
}
