import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField } from '../ui/Field';
import { ChargeFields, HEALTH_OPTIONS } from '../tools/ToolUnitsPanel';
import { procurementApi } from '../../api/procurementApi';
import { vendorApi } from '../../api/vendorApi';
import { toApiError } from '../../api/axiosClient';
import { formatCurrency } from '../../utils/format';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Admin completes an APPROVED machine request by obtaining the physical, serial-numbered unit:
 *   Purchased / Owned : pick a specific serial (a serial held by someone else needs an explicit
 *                       reassignment). No purchase expense - nothing is bought.
 *   To Be Purchased   : register the new machine (vendor, actual cost, unique serial) as a
 *                       company asset, then allocate it.
 *   Rented            : register the rental (vendor, actual daily rate, period) and allocate it.
 */
export default function ToolFulfilDialog({ request, onClose, onSaved }) {
  const type = request?.toolProcurementType || 'purchased_owned';
  const availability = request?.toolAvailability;
  const plan = request?.taskToolPlan;
  const [vendors, setVendors] = useState([]);
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request) return;
    vendorApi.list().then((d) => setVendors(d.vendors ?? [])).catch(() => setVendors([]));
    setErrors({});
    setError(null);
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    const planDayRate = plan && String(plan.rentalType).toLowerCase() !== 'purchase' ? Number(plan.plannedRate || 0) : 0;
    const rentStart = request.rentalStartDate ? String(request.rentalStartDate).slice(0, 10) : today();
    setV({
      unit_id: request.toolUnit?.id ? String(request.toolUnit.id) : (availability?.availableUnits?.[0] ? String(availability.availableUnits[0].id) : ''),
      reassign: false,
      return_date: today(),
      start_date: today(),
      vendor_id: request.vendorId ? String(request.vendorId) : '',
      serial_number: '',
      purchase_cost: request.estimatedRate ? String(request.estimatedRate) : (plan?.plannedRate ? String(plan.plannedRate) : ''),
      purchase_date: today(),
      expiry_date: '',
      health: 'excellent',
      rate_per_day: request.rentalCost != null ? String(request.rentalCost) : (plan?.plannedRate ? String(plan.plannedRate) : ''),
      rental_start_date: rentStart,
      expected_return_date: request.rentalEndDate
        ? String(request.rentalEndDate).slice(0, 10)
        : (plan?.plannedDays ? addDays(rentStart, Number(plan.plannedDays) - 1) : ''),
      // An owned machine is charged to the task at the planned per-day estimate unless Admin changes it.
      charge_policy: request.usageChargePolicy || (request.usageChargeRate || planDayRate ? 'per_day_rate' : 'none'),
      usage_charge_rate: request.usageChargeRate != null ? String(request.usageChargeRate) : (planDayRate ? String(planDayRate) : ''),
      usage_charge_total: request.usageChargeTotal != null ? String(request.usageChargeTotal) : '',
      usage_charge_days: request.usageChargeDays != null ? String(request.usageChargeDays) : '',
      unused_policy: 'actual_days',
    });
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return null;

  const set = (k) => (e) => { setV((c) => ({ ...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); setErrors((c) => ({ ...c, [k]: undefined })); };
  const free = availability?.availableUnits ?? [];
  const held = availability?.holders ?? [];
  const selectedHeld = held.find((h) => String(h.unitId) === String(v.unit_id));

  async function save() {
    setSaving(true);
    setError(null);
    const body = {};
    if (type === 'purchased_owned') {
      body.unit_id = Number(v.unit_id) || undefined;
      body.reassign = Boolean(selectedHeld && v.reassign);
      if (selectedHeld) { body.return_date = v.return_date; }
      body.start_date = selectedHeld ? undefined : v.start_date;
      if (selectedHeld && v.start_date > v.return_date) body.start_date = v.start_date;
      body.charge_policy = v.charge_policy;
      body.usage_charge_rate = v.usage_charge_rate ? Number(v.usage_charge_rate) : undefined;
      body.usage_charge_total = v.usage_charge_total ? Number(v.usage_charge_total) : undefined;
      body.usage_charge_days = v.usage_charge_days ? Number(v.usage_charge_days) : undefined;
      body.unused_policy = v.unused_policy;
    } else if (type === 'to_be_purchased') {
      Object.assign(body, {
        vendor_id: v.vendor_id ? Number(v.vendor_id) : undefined, serial_number: v.serial_number.trim(),
        purchase_cost: v.purchase_cost ? Number(v.purchase_cost) : undefined, purchase_date: v.purchase_date || undefined,
        expiry_date: v.expiry_date || undefined, health: v.health, start_date: v.start_date,
      });
    } else {
      Object.assign(body, {
        vendor_id: v.vendor_id ? Number(v.vendor_id) : undefined, serial_number: v.serial_number.trim(),
        rate_per_day: v.rate_per_day ? Number(v.rate_per_day) : undefined, rental_start_date: v.rental_start_date,
        expected_return_date: v.expected_return_date || undefined, health: v.health,
      });
    }
    try {
      await procurementApi.toolFulfil(request.id, body);
      onSaved(type === 'purchased_owned' ? 'Machine allocated.' : type === 'to_be_purchased' ? 'Machine registered as a company asset and allocated.' : 'Rental registered and machine allocated.');
    } catch (caught) {
      const e = toApiError(caught);
      if (e.details) setErrors(e.details);
      const first = Object.values(e.details || {})[0];
      setError(e.message === 'Check the highlighted fields.' && first ? first : e.message);
    } finally { setSaving(false); }
  }

  const unitOptions = [
    ...free.map((u) => ({ value: String(u.id), label: `${u.serialNumber} — available (${u.health})` })),
    ...held.map((h) => ({ value: String(h.unitId), label: `${h.serialNumber} — with ${h.contractor?.name ?? 'another holder'}${h.project ? ` @ ${h.project.name}` : ''} (needs reassignment)` })),
  ];
  const title = type === 'purchased_owned' ? 'Allocate machine' : type === 'to_be_purchased' ? 'Register purchased machine' : 'Register rented machine';

  return (
    <Modal isOpen onClose={onClose} title={title} description={`${request.requestNumber} · ${request.tool?.name ?? 'Machine'}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>{title}</Button></>}>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {plan && (
        <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-sm text-ink">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-900">Task plan estimate</span>
          <p className="mt-1">
            {plan.plannedQuantity} × {plan.toolName} · {plan.rentalType || 'Rent'}
            {String(plan.rentalType).toLowerCase() === 'purchase'
              ? ` · ${formatCurrency(plan.plannedRate)} each`
              : ` · ${formatCurrency(plan.plannedRate)}/day × ${plan.plannedDays} day(s)`}
            {' = '}<strong>{formatCurrency(plan.plannedTotal)}</strong>
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {type === 'purchased_owned' && (
          <>
            <SelectField className="sm:col-span-2" label="Serial number to allocate" required value={v.unit_id} onChange={set('unit_id')} error={errors.unit_id}
              placeholder={unitOptions.length ? 'Select serial' : 'No registered units'} options={unitOptions}
              hint="Company-owned machine: allocating it creates no purchase expense." />
            {selectedHeld && (
              <div className="sm:col-span-2 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{selectedHeld.serialNumber} is currently with <strong>{selectedHeld.contractor?.name ?? 'another holder'}</strong>. You can authorise a reassignment: their last day is closed out and they are charged only for the days they actually used.</p>
                <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(v.reassign)} onChange={set('reassign')} /> I authorise this reassignment</label>
                <InputField label="Current holder's last day" type="date" value={v.return_date} onChange={set('return_date')} error={errors.return_date} />
              </div>
            )}
            <InputField label={selectedHeld ? 'New holder starts (after the last day)' : 'Start date'} type="date" value={v.start_date} onChange={set('start_date')} error={errors.start_date} />
            <ChargeFields v={v} set={set} errors={errors} />
          </>
        )}

        {type !== 'purchased_owned' && (
          <>
            <SelectField label="Vendor" required value={v.vendor_id} onChange={set('vendor_id')} error={errors.vendor_id} placeholder="Select vendor"
              options={vendors.map((x) => ({ value: String(x.id), label: x.name }))} />
            <InputField label="Serial number" required value={v.serial_number} onChange={set('serial_number')} error={errors.serial_number} placeholder="Unique serial" />
          </>
        )}

        {type === 'to_be_purchased' && (
          <>
            <InputField label="Actual purchase cost (₹)" required type="number" min="0" step="0.01" value={v.purchase_cost} onChange={set('purchase_cost')} error={errors.purchase_cost} />
            <InputField label="Purchase date" type="date" value={v.purchase_date} onChange={set('purchase_date')} error={errors.purchase_date} />
            <InputField label="Expiry date (if applicable)" type="date" value={v.expiry_date} onChange={set('expiry_date')} error={errors.expiry_date} />
            <SelectField label="Condition on receipt" value={v.health} onChange={set('health')} options={HEALTH_OPTIONS} />
            <InputField label="Allocation start" type="date" value={v.start_date} onChange={set('start_date')} />
          </>
        )}

        {type === 'rented' && (
          <>
            <InputField label="Actual rental rate per day (₹)" required type="number" min="0" step="0.01" value={v.rate_per_day} onChange={set('rate_per_day')} error={errors.rental_cost || errors.rate_per_day} />
            <SelectField label="Condition on receipt" value={v.health} onChange={set('health')} options={HEALTH_OPTIONS} />
            <InputField label="Rental start" type="date" value={v.rental_start_date} onChange={set('rental_start_date')} error={errors.rental_start_date} />
            <InputField label="Expected return" type="date" value={v.expected_return_date} onChange={set('expected_return_date')} error={errors.expected_return_date}
              hint={v.rate_per_day && v.rental_start_date && v.expected_return_date
                ? `Planned: ${formatCurrency(Number(v.rate_per_day) * (Math.round((Date.parse(v.expected_return_date) - Date.parse(v.rental_start_date)) / 86400000) + 1))}`
                : 'Actual rent is calculated from the days it is really used.'} />
          </>
        )}
      </div>
    </Modal>
  );
}
