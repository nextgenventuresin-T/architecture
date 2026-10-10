import { useEffect, useState } from 'react';
import { PackageCheck, X, ShieldCheck } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField } from '../ui/Field';
import { materialMovementApi } from '../../api/materialMovementApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber, formatDate } from '../../utils/format';

/**
 * Receive an IN-TRANSIT shipment.
 *
 *  1. The receiver enters the arriving VEHICLE NUMBER (required).
 *  2. The dispatch the sender already recorded is FETCHED by that number from the
 *     server and shown - driver, material, quantity, source, destination, project,
 *     site, dispatch date - for the receiver to check against what arrived.
 *  3. Only "Confirm receipt" adds the stock. The server re-verifies the vehicle
 *     number and refuses a second receipt of the same shipment.
 */
export default function ReceiveMovementDialog({ movement, onClose, onReceived, onError }) {
  const [vehicle, setVehicle] = useState('');
  const [details, setDetails] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVehicle('');
    setDetails(null);
    setFieldError(null);
    setError(null);
  }, [movement]);

  if (!movement) return null;

  const receivingDate = new Date().toISOString().slice(0, 10);

  async function fetchDetails() {
    setError(null);
    if (!vehicle.trim()) {
      setFieldError('Enter the vehicle number to fetch the dispatch details.');
      return;
    }
    setFetching(true);
    try {
      const result = await materialMovementApi.lookup(vehicle.trim());
      const match = (result.shipments || []).find((s) => s.kind === 'movement' && Number(s.id) === Number(movement.id));
      if (!match) {
        setDetails(null);
        setFieldError('No dispatch for this shipment matches that vehicle number. Check the number with the driver.');
        return;
      }
      setFieldError(null);
      setDetails(match);
    } catch (caught) {
      setFieldError(toApiError(caught).message);
    } finally {
      setFetching(false);
    }
  }

  async function confirm() {
    setError(null);
    setSaving(true);
    try {
      await materialMovementApi.receive(movement.id, {
        received_quantity: details?.quantity ?? movement.sentQuantity,
        vehicle_number: vehicle.trim(),
        receiving_date: receivingDate,
        remarks: `Received; vehicle ${vehicle.trim()}`,
      });
      onReceived('Material received — added to the destination warehouse.');
    } catch (caught) {
      const apiErr = toApiError(caught);
      const detailMsg = Object.values(apiErr.details || {})[0];
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
            onChange={(e) => { setVehicle(e.target.value); setFieldError(null); setDetails(null); }}
            error={fieldError}
            placeholder="PB 11 AB 1234"
            hint="Enter the number of the vehicle that has arrived. The dispatch details are fetched from it."
            disabled={Boolean(details)}
          />

          {!details ? (
            <Button type="button" variant="primary" isLoading={fetching} loadingText="Fetching…" onClick={fetchDetails}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Fetch dispatch details
            </Button>
          ) : (
            <div className="rounded-lg border border-line bg-canvas px-4 py-3 text-sm">
              <p className="mb-2 font-medium text-ink">Dispatch details — {details.reference}</p>
              {row('Material', details.material)}
              {row('Quantity', `${formatNumber(details.quantity)} ${details.unit}`)}
              {row('Vehicle number', details.vehicleNumber)}
              {row('Driver name', details.driverName)}
              {row('Driver phone', details.driverPhone)}
              {row('Source', details.source)}
              {row('Destination', details.destination)}
              {row('Project', details.project)}
              {row('Site', details.site)}
              {row('Task', details.task)}
              {row('Dispatch date', formatDate(details.dispatchDate))}
              {row('Receiving date', formatDate(receivingDate))}
              <button type="button" className="mt-2 text-xs text-brand-700 underline" onClick={() => setDetails(null)}>
                Not this shipment? Change the vehicle number
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" isLoading={saving} loadingText="Receiving…" onClick={confirm} disabled={!details}>
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Confirm receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
