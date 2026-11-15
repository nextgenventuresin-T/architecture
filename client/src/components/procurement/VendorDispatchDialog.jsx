import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField } from '../ui/Field';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import { toDateInputValue } from '../../utils/format';

/**
 * "Vendor confirmed - add vehicle". A vendor purchase can be raised and ordered
 * without a vehicle; once the vendor confirms, Admin / Procurement records the
 * dispatch here. The vehicle number is mandatory - whoever receives the goods
 * verifies it on arrival, and nothing can be received until it is recorded.
 */
export default function VendorDispatchDialog({ request, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!request) return;
    setError(null);
    setFieldErrors({});
    setValues({
      vehicle_number: request.vehicleNumber || '',
      driver_name: request.driverName || '',
      driver_phone: request.driverPhone || '',
      challan_number: request.challanNumber || '',
      challan_date: request.challanDate ? toDateInputValue(request.challanDate) : '',
      expected_delivery_date: request.purchaseOrder?.expectedDeliveryDate ? toDateInputValue(request.purchaseOrder.expectedDeliveryDate) : '',
    });
  }, [request]);

  if (!request) return null;
  const isUpdate = Boolean(request.vehicleNumber);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function handleSave() {
    if (!String(values.vehicle_number || '').trim()) {
      setFieldErrors({ vehicle_number: "Enter the vendor's vehicle number." });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await procurementApi.recordVendorDispatch(request.id, {
        vehicle_number: values.vehicle_number.trim(),
        driver_name: values.driver_name.trim() || null,
        driver_phone: values.driver_phone.trim() || null,
        challan_number: values.challan_number.trim() || null,
        challan_date: values.challan_date || null,
        expected_delivery_date: values.expected_delivery_date || null,
      });
      onSaved(isUpdate ? 'Vendor dispatch updated.' : 'Vendor confirmed - vehicle recorded. It can now be received after the vehicle is verified.');
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
      title={isUpdate ? 'Update vendor dispatch' : 'Vendor confirmed - add vehicle'}
      description={`${request.requestNumber} · ${request.material.name}${request.vendor?.name || request.supplier ? ` · ${request.vendor?.name || request.supplier}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} loadingText="Saving…">{isUpdate ? 'Save changes' : 'Record dispatch'}</Button>
        </>
      }
    >
      {error && !error.details && <Alert tone="error" className="mb-4">{error.message}</Alert>}
      <p className="mb-4 rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-xs text-brand-900">
        Enter the details the vendor gave when confirming the order. The receiver must enter the same vehicle
        number to receive the goods.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField label="Vehicle number" required value={values.vehicle_number} onChange={set('vehicle_number')}
          error={fieldErrors.vehicle_number} placeholder="e.g. MH-12-AB-1234" />
        <InputField label="Delivery challan no." value={values.challan_number} onChange={set('challan_number')}
          error={fieldErrors.challan_number} placeholder="e.g. DC-9988" />
        <InputField label="Driver name" value={values.driver_name} onChange={set('driver_name')} error={fieldErrors.driver_name} />
        <InputField label="Driver phone" value={values.driver_phone} onChange={set('driver_phone')} error={fieldErrors.driver_phone}
          placeholder="e.g. 98765 43210" />
        <InputField label="Challan date" type="date" value={values.challan_date} onChange={set('challan_date')} error={fieldErrors.challan_date} />
        <InputField label="Expected delivery" type="date" value={values.expected_delivery_date} onChange={set('expected_delivery_date')}
          error={fieldErrors.expected_delivery_date} />
      </div>
    </Modal>
  );
}
