import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField } from '../ui/Field';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import { toDateInputValue } from '../../utils/format';

/**
 * "Vendor confirmed - add Bilty / AWB". A vendor purchase can be raised and ordered
 * without any transport details; once the vendor confirms, Admin / Procurement records
 * the Bilty / AWB number here (mandatory; vehicle, driver and challan optional).
 * Whoever receives the goods must enter the same Bilty / AWB number, and nothing can
 * be received until it is recorded.
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
      bilty_number: request.biltyNumber || '',
      vehicle_number: request.vehicleNumber || '',
      driver_name: request.driverName || '',
      driver_phone: request.driverPhone || '',
      challan_number: request.challanNumber || '',
      challan_date: request.challanDate ? toDateInputValue(request.challanDate) : '',
      expected_delivery_date: request.purchaseOrder?.expectedDeliveryDate ? toDateInputValue(request.purchaseOrder.expectedDeliveryDate) : '',
    });
  }, [request]);

  if (!request) return null;
  const isUpdate = Boolean(request.biltyNumber);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function handleSave() {
    if (!String(values.bilty_number || '').trim()) {
      setFieldErrors({ bilty_number: 'Enter the Bilty / AWB number.' });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await procurementApi.recordVendorDispatch(request.id, {
        bilty_number: values.bilty_number.trim(),
        vehicle_number: values.vehicle_number.trim() || null,
        driver_name: values.driver_name.trim() || null,
        driver_phone: values.driver_phone.trim() || null,
        challan_number: values.challan_number.trim() || null,
        challan_date: values.challan_date || null,
        expected_delivery_date: values.expected_delivery_date || null,
      });
      onSaved(isUpdate ? 'Vendor dispatch updated.' : 'Vendor confirmed - Bilty / AWB recorded. It can now be received with that number.');
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
      title={isUpdate ? 'Update vendor dispatch' : 'Vendor confirmed - add Bilty / AWB'}
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
        Enter the Bilty / AWB number the vendor gave when confirming the order. The receiver (Project Manager,
        site engineer or contractor) must enter the same number to receive the goods.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField label="Bilty / AWB number" required value={values.bilty_number} onChange={set('bilty_number')}
          error={fieldErrors.bilty_number} placeholder="e.g. LR-458812 / AWB 7781 2234" />
        <InputField label="Vehicle number (optional)" value={values.vehicle_number} onChange={set('vehicle_number')}
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
