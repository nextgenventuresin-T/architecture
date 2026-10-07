import { useEffect, useState } from 'react';
import { PackageCheck, X, ShieldCheck } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField } from '../ui/Field';
import { materialMovementApi } from '../../api/materialMovementApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber, formatDate } from '../../utils/format';

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

/**
 * Receive an IN-TRANSIT shipment. The receiver first enters the vehicle number.
 * If it matches the vehicle number the sender entered on dispatch, the full
 * dispatch details are fetched/shown and a Confirm Receipt button appears.
 * Confirming increases the destination warehouse stock and marks the movement
 * and its procurement request Received (duplicate receipts are prevented server-side).
 */
export default function ReceiveMovementDialog({ movement, onClose, onReceived, onError }) {
  const [vehicle, setVehicle] = useState('');
  const [verified, setVerified] = useState(false);
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVehicle('');
    setVerified(false);
    setFieldError(null);
    setError(null);
  }, [movement]);

  if (!movement) return null;

  const expectedVehicle = movement.vehicleNumber;
  const receivingDate = new Date().toISOString().slice(0, 10);

  function verify() {
    setError(null);
    if (!vehicle.trim()) {
      setFieldError('Enter the vehicle number to confirm receipt.');
      return;
    }
    // If the sender recorded a vehicle number, it must match. If they didn't,
    // accept the entered number as the receiving vehicle.
    if (expectedVehicle && norm(vehicle) !== norm(expectedVehicle)) {
      setFieldError('Vehicle number does not match the dispatch. Check with the sender.');
      return;
    }
    setFieldError(null);
    setVerified(true);
  }

  async function confirm() {
    setError(null);
    setSaving(true);
    try {
      await materialMovementApi.receive(movement.id, {
        received_quantity: movement.sentQuantity,
        vehicle_number: vehicle.trim(),
        receiving_date: receivingDate,
        remarks: `Received; vehicle ${vehicle.trim()}`,
      });
      onReceived('Material received — added to your warehouse.');
    } catch (caught) {
      const apiErr = toApiError(caught);
      const details = apiErr.details || {};
      const detailMsg = Object.values(details)[0];
      const shown = apiErr.message === 'Check the highlighted fields.' && detailMsg ? detailMsg : apiErr.message;
      setError({ ...apiErr, message: shown });
      if (onError) onError({ ...apiErr, message: shown });
    } finally {
      setSaving(false);
    }
  }

  const row = (label, value) => (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right text-ink">{value ?? '—'}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Receive material</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && <Alert tone="error" title="Could not receive">{error.message}</Alert>}

          <InputField
            label="Vehicle number"
            required
            value={vehicle}
            onChange={(e) => { setVehicle(e.target.value); setFieldError(null); setVerified(false); }}
            error={fieldError}
            placeholder="PB 11 AB 1234"
            hint="Enter the arriving vehicle number. It must match the number entered on dispatch."
            disabled={verified}
          />

          {!verified ? (
            <Button type="button" variant="primary" onClick={verify}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Verify vehicle & fetch details
            </Button>
          ) : (
            <div className="rounded-lg border border-line bg-canvas px-4 py-3 text-sm">
              <p className="mb-2 font-medium text-ink">Dispatch details — {movement.movementNumber}</p>
              {row('Material', movement.material?.name)}
              {row('Quantity', `${formatNumber(movement.sentQuantity)} ${movement.unit}`)}
              {row('Vehicle number', movement.vehicleNumber || vehicle.trim())}
              {row('Driver name', movement.driverName)}
              {row('Driver phone', movement.driverPhone)}
              {row('Source', movement.source?.contractorName || movement.source?.warehouseName)}
              {row('Destination', movement.destination?.contractorName || movement.destination?.warehouseName)}
              {row('Project', movement.project?.name)}
              {row('Site', movement.site?.name)}
              {row('Dispatch date', formatDate(movement.sentAt))}
              {row('Receiving date', formatDate(receivingDate))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" isLoading={saving} loadingText="Receiving…" onClick={confirm} disabled={!verified}>
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Confirm receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
