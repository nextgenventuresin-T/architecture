import { useEffect, useState } from 'react';
import { PackageCheck, X, ShieldCheck } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField } from '../ui/Field';
import { materialMovementApi } from '../../api/materialMovementApi';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber, formatDate, formatCurrency } from '../../utils/format';

/**
 * Admin: "Fulfil / Receive into Warehouse" for a vendor purchase.
 *
 *  1. The receiving person enters the arriving VEHICLE NUMBER (required).
 *  2. The dispatch recorded with the purchase is FETCHED by that number (driver
 *     name/phone, material, quantity, vendor, destination, dispatch date) and
 *     shown for verification.
 *  3. They confirm the ACTUAL cost per unit / total, then "Confirm receipt".
 *     Stock, receipt record, ledger row and request status are posted together,
 *     once - the server refuses a repeat.
 */
export default function VerifiedReceiptDialog({ request, onClose, onSaved, onError }) {
  const [vehicle, setVehicle] = useState('');
  const [details, setDetails] = useState(null);
  const [rate, setRate] = useState('');
  const [total, setTotal] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVehicle('');
    setDetails(null);
    setFieldErrors({});
    setError(null);
    setRate(request?.purchaseRate != null ? String(request.purchaseRate) : '');
    setTotal(request?.totalAmount != null ? String(request.totalAmount) : '');
  }, [request]);

  if (!request) return null;

  // Vendor deliveries into the central warehouse (or any delivery with a recorded dispatch vehicle)
  // are verified by vehicle number first; an unrecorded supplier->contractor delivery has nothing to verify.
  const needsVehicle = request.kind === 'central_purchase' || Boolean(request.vehicleNumber);
  const qty = details?.quantity ?? request.purchaseOrder?.orderedQuantity ?? request.quantity;
  const today = new Date().toISOString().slice(0, 10);

  function changeRate(value) {
    setRate(value);
    setFieldErrors((c) => ({ ...c, purchase_rate: undefined }));
    setTotal(value && qty ? String(Number((Number(value) * Number(qty)).toFixed(2))) : '');
  }

  async function fetchDetails() {
    setError(null);
    if (!vehicle.trim()) {
      setFieldErrors({ vehicle_number: 'Enter the vehicle number to fetch the dispatch details.' });
      return;
    }
    setFetching(true);
    try {
      const result = await materialMovementApi.lookup(vehicle.trim());
      const match = (result.shipments || []).find((s) => s.kind === 'vendor_purchase' && Number(s.id) === Number(request.id));
      if (!match) {
        setDetails(null);
        setFieldErrors({ vehicle_number: 'No dispatch for this purchase matches that vehicle number. Check the number with the driver.' });
        return;
      }
      setFieldErrors({});
      setDetails(match);
      if (!rate && match.costPerUnit) changeRate(String(match.costPerUnit));
    } catch (caught) {
      setFieldErrors({ vehicle_number: toApiError(caught).message });
    } finally {
      setFetching(false);
    }
  }

  async function confirm() {
    setError(null);
    const errs = {};
    if (!rate || Number(rate) <= 0) errs.purchase_rate = 'Enter the actual cost per unit.';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setSaving(true);
    try {
      await procurementApi.fulfil(request.id, {
        vehicle_number: needsVehicle ? vehicle.trim() : undefined,
        purchase_rate: Number(rate),
        total_amount: total ? Number(total) : undefined,
        receiving_date: today,
      });
      onSaved('Material received into warehouse stock — receipt verified and recorded once.');
    } catch (caught) {
      const apiErr = toApiError(caught);
      if (apiErr.details) setFieldErrors(apiErr.details);
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Receive into warehouse</h2>
            <p className="text-xs text-ink-subtle">{request.requestNumber} · {request.material?.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && <Alert tone="error" title="Could not receive">{error.message}</Alert>}

          {needsVehicle && (
          <InputField
            label="Vehicle number"
            required
            value={vehicle}
            onChange={(e) => { setVehicle(e.target.value); setFieldErrors((c) => ({ ...c, vehicle_number: undefined })); setDetails(null); }}
            error={fieldErrors.vehicle_number}
            placeholder="PB 10 AB 1234"
            hint="Enter the number of the vehicle that has arrived. The recorded dispatch is fetched from it."
            disabled={Boolean(details)}
          />
          )}

          {needsVehicle && !details ? (
            <Button type="button" variant="primary" isLoading={fetching} loadingText="Fetching…" onClick={fetchDetails}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Fetch dispatch details
            </Button>
          ) : needsVehicle && details ? (
            <>
              <div className="rounded-lg border border-line bg-canvas px-4 py-3 text-sm">
                <p className="mb-2 font-medium text-ink">Dispatch details — {details.reference}</p>
                {row('Material', details.material)}
                {row('Quantity', `${formatNumber(details.quantity)} ${details.unit}`)}
                {row('Vehicle number', details.vehicleNumber)}
                {row('Driver name', details.driverName)}
                {row('Driver phone', details.driverPhone)}
                {row('Source (vendor)', details.source)}
                {row('Destination', details.destination)}
                {row('Dispatch date', formatDate(details.dispatchDate))}
                {row('Recorded cost / unit', details.costPerUnit != null ? formatCurrency(details.costPerUnit) : '—')}
                {row('Recorded total', details.totalCost != null ? formatCurrency(details.totalCost) : '—')}
                <button type="button" className="mt-2 text-xs text-brand-700 underline" onClick={() => setDetails(null)}>
                  Not this delivery? Change the vehicle number
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  label="Actual cost per unit"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(e) => changeRate(e.target.value)}
                  error={fieldErrors.purchase_rate}
                  hint="Kept with the stock so later usage is costed correctly."
                />
                <InputField
                  label="Total cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  hint={rate ? `${formatNumber(qty)} × ${formatCurrency(Number(rate))}` : undefined}
                />
              </div>
            </>
          ) : null}

          {!needsVehicle && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="Actual cost per unit" required type="number" min="0" step="0.01" value={rate} onChange={(e) => changeRate(e.target.value)} error={fieldErrors.purchase_rate} />
              <InputField label="Total cost" type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" isLoading={saving} loadingText="Receiving…" onClick={confirm} disabled={needsVehicle && !details}>
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Confirm receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
