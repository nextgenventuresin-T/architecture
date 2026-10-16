import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField } from '../ui/Field';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import { isVendorToContractor, receivingContractorName } from '../../utils/procurementOptions';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Approved -> Ordered. Stamps po_number, ordered_quantity and the two dates in one step.
 * For a vendor delivering straight to a contractor it also records the vendor's vehicle
 * and driver, which the contractor verifies when receiving.
 */
export default function PlaceOrderDialog({ request, onClose, onSaved }) {
  const [values, setValues] = useState({
    po_number: '',
    ordered_quantity: '',
    order_date: today(),
    expected_delivery_date: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    challan_number: '',
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
      vehicle_number: request.vehicleNumber || '',
      driver_name: request.driverName || '',
      driver_phone: request.driverPhone || '',
      challan_number: request.challanNumber || '',
    });
  }, [request]);

  if (!request) return null;
  const toContractor = isVendorToContractor(request);

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
    if (toContractor && !values.vehicle_number.trim()) {
      errors.vehicle_number = "Enter the vendor's vehicle number - the contractor verifies it on arrival.";
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
      await procurementApi.placeOrder(request.id, {
        po_number: values.po_number.trim() || undefined,
        ordered_quantity: Number(values.ordered_quantity),
        order_date: values.order_date,
        expected_delivery_date: values.expected_delivery_date || null,
        ...(toContractor ? {
          vehicle_number: values.vehicle_number.trim(),
          driver_name: values.driver_name.trim() || null,
          driver_phone: values.driver_phone.trim() || null,
          challan_number: values.challan_number.trim() || null,
        } : {}),
      });
      onSaved(toContractor
        ? `Order placed. ${receivingContractorName(request)} has been notified to receive it.`
        : 'Request moved to Ordered.');
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

        {toContractor && (
          <>
            <div className="sm:col-span-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-xs text-brand-900">
              <p className="font-semibold">Vendor delivers directly to {receivingContractorName(request)}</p>
              <p className="mt-0.5 text-brand-800">
                Enter the vendor&rsquo;s vehicle and driver. The contractor is notified, verifies the vehicle number when
                the material arrives, and receives it into their stock.
              </p>
            </div>
            <InputField
              label="Vehicle number"
              required
              value={values.vehicle_number}
              onChange={set('vehicle_number')}
              error={fieldErrors.vehicle_number}
              placeholder="e.g. MH-12-AB-1234"
            />
            <InputField
              label="Delivery challan no."
              value={values.challan_number}
              onChange={set('challan_number')}
              error={fieldErrors.challan_number}
              placeholder="e.g. DC-9988"
            />
            <InputField
              label="Driver name"
              value={values.driver_name}
              onChange={set('driver_name')}
              error={fieldErrors.driver_name}
              placeholder="Driver full name"
            />
            <InputField
              label="Driver phone"
              value={values.driver_phone}
              onChange={set('driver_phone')}
              error={fieldErrors.driver_phone}
              placeholder="e.g. 98765 43210"
            />
          </>
        )}
      </div>
    </Modal>
  );
}
