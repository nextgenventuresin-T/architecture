import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { warehouseApi } from '../../api/warehouseApi';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber } from '../../utils/format';
import { ADJUSTMENT_TYPE_OPTIONS } from '../../utils/warehouseOptions';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * One dialog for all four movements. The shape of a movement barely changes
 * between them — material, warehouse, quantity, date, notes — so a single
 * component with a per-type config keeps the four flows consistent and avoids
 * four near-identical files drifting apart.
 */
const CONFIG = {
  receipt: {
    title: 'Receive stock',
    description: 'Add material into a warehouse.',
    submit: 'Record receipt',
    saving: 'Recording…',
    call: warehouseApi.receive,
    success: 'Stock received.',
  },
  issue: {
    title: 'Issue stock',
    description: 'Issue material out to a project or site.',
    submit: 'Record issue',
    saving: 'Issuing…',
    call: warehouseApi.issue,
    success: 'Stock issued.',
  },
  transfer: {
    title: 'Transfer stock',
    description: 'Move material from one warehouse to another.',
    submit: 'Record transfer',
    saving: 'Transferring…',
    call: warehouseApi.transfer,
    success: 'Stock transferred.',
  },
  adjustment: {
    title: 'Adjust stock',
    description: 'Correct a balance after a recount, damage or wastage.',
    submit: 'Record adjustment',
    saving: 'Adjusting…',
    call: warehouseApi.adjust,
    success: 'Stock adjusted.',
  },
};

const EMPTY = {
  material_id: '',
  warehouse_id: '',
  destination_warehouse_id: '',
  project_id: '',
  site_id: '',
  quantity: '',
  adjustment_type: 'increase',
  reason: '',
  reference: '',
  transaction_date: today(),
  notes: '',
  procurement_receipt_id: '',
};

export default function StockMovementDialog({ type, lookups, defaults = {}, onClose, onSaved }) {
  const [values, setValues] = useState({ ...EMPTY, ...defaults });
  const [sites, setSites] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const config = CONFIG[type];

  useEffect(() => {
    setValues({ ...EMPTY, ...defaults });
    setFieldErrors({});
    setError(null);
    // defaults is rebuilt by the parent each render; keying off the type and
    // the specific defaults that matter avoids an update loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, defaults.warehouse_id, defaults.material_id, defaults.procurement_receipt_id]);

  // Sites depend on the chosen project — the same dependent pattern the
  // procurement and material filters use.
  useEffect(() => {
    if (!values.project_id) {
      setSites([]);
      return undefined;
    }
    let active = true;
    projectsApi
      .detail(values.project_id)
      .then((data) => active && setSites(data.sites ?? []))
      .catch(() => active && setSites([]));
    return () => {
      active = false;
    };
  }, [values.project_id]);

  if (!config) return null;

  const set = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => ({
      ...current,
      [key]: value,
      // Changing project clears a site chosen under the previous project.
      ...(key === 'project_id' ? { site_id: '' } : {}),
    }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const selectedMaterial = lookups.materials?.find((m) => String(m.id) === String(values.material_id));
  const selectedWarehouse = lookups.warehouses?.find((w) => String(w.id) === String(values.warehouse_id));
  const unit = selectedMaterial?.unit ?? '';

  const availableStock = useMemo(() => {
    if (!values.warehouse_id || !values.material_id || !lookups.stockBalances) return null;
    const balances = lookups.stockBalances.filter(
      (b) => String(b.warehouseId) === String(values.warehouse_id) && String(b.materialId) === String(values.material_id)
    );
    if (values.site_id) {
      const match = balances.find((b) => String(b.siteId) === String(values.site_id));
      return match ? match.quantity : 0;
    }
    if (values.project_id) {
      const match = balances.find((b) => String(b.projectId) === String(values.project_id));
      return match ? match.quantity : 0;
    }
    const unslotted = balances.find((b) => !b.projectId && !b.siteId);
    if (unslotted) return unslotted.quantity;
    return balances.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  }, [values.warehouse_id, values.material_id, values.project_id, values.site_id, lookups.stockBalances]);

  function validate() {
    const errors = {};
    if (!values.material_id) errors.material_id = 'Select a material.';
    if (!values.warehouse_id) errors.warehouse_id = 'Select a warehouse.';
    if (!values.quantity || Number(values.quantity) <= 0) {
      errors.quantity = 'Enter a quantity greater than zero.';
    } else if (['issue', 'transfer'].includes(type) && availableStock !== null && Number(values.quantity) > availableStock) {
      errors.quantity = `Only ${formatNumber(availableStock)} ${unit} available in ${selectedWarehouse?.name || 'this warehouse'}.`;
    }
    if (type === 'transfer') {
      if (!values.destination_warehouse_id) errors.destination_warehouse_id = 'Select a destination warehouse.';
      else if (String(values.destination_warehouse_id) === String(values.warehouse_id)) {
        errors.destination_warehouse_id = 'Choose a different warehouse to transfer into.';
      }
    }
    if (type === 'adjustment' && !values.reason.trim()) {
      errors.reason = 'Give a reason for this adjustment.';
    }
    if (!values.transaction_date) errors.transaction_date = 'Enter the date.';
    if (values.site_id && !values.project_id) errors.project_id = 'Select the project this site belongs to.';
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
      const payload = {
        material_id: Number(values.material_id),
        warehouse_id: Number(values.warehouse_id),
        project_id: values.project_id ? Number(values.project_id) : null,
        site_id: values.site_id ? Number(values.site_id) : null,
        quantity: Number(values.quantity),
        transaction_date: values.transaction_date,
        reference: values.reference.trim() || null,
        notes: values.notes.trim() || null,
        ...(type === 'transfer' && { destination_warehouse_id: Number(values.destination_warehouse_id) }),
        ...(type === 'adjustment' && { adjustment_type: values.adjustment_type, reason: values.reason.trim() }),
        ...(type === 'receipt' && values.procurement_receipt_id
          ? { procurement_receipt_id: Number(values.procurement_receipt_id) }
          : {}),
      };

      await config.call(payload);
      onSaved(config.success);
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  const warehouseOptions = (lookups.warehouses ?? []).map((w) => ({
    value: String(w.id),
    label: `${w.code} — ${w.name}`,
  }));

  const materialOptions = (lookups.materials ?? []).map((m) => ({
    value: String(m.id),
    label: `${m.code} — ${m.name} (${m.unit})`,
  }));

  const projectOptions = (lookups.projects ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.code} — ${p.name}`,
  }));

  // Receiving can pull straight from an Interface 7 delivery that has not been
  // brought into stock yet. Choosing one prefills the whole form and carries
  // the receipt id, which is what stops the delivery being counted twice.
  const pending = lookups.pendingReceipts ?? [];

  function applyPendingReceipt(event) {
    const receiptId = event.target.value;
    setFieldErrors({});
    if (!receiptId) {
      setValues((current) => ({ ...current, procurement_receipt_id: '' }));
      return;
    }
    const receipt = pending.find((p) => String(p.receiptId) === String(receiptId));
    if (!receipt) return;
    setValues((current) => ({
      ...current,
      procurement_receipt_id: String(receipt.receiptId),
      material_id: String(receipt.material.id),
      project_id: receipt.project ? String(receipt.project.id) : '',
      site_id: receipt.site ? String(receipt.site.id) : '',
      quantity: String(receipt.quantity),
      transaction_date: receipt.receivingDate ? String(receipt.receivingDate).slice(0, 10) : current.transaction_date,
      reference: receipt.poNumber || receipt.requestNumber || current.reference,
    }));
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={config.title}
      description={config.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} loadingText={config.saving}>
            {config.submit}
          </Button>
        </>
      }
    >
      {error && !error.details && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      {type === 'receipt' && pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-3">
          <SelectField
            label="Receive against a procurement delivery"
            value={values.procurement_receipt_id}
            onChange={applyPendingReceipt}
            placeholder="Not linked to procurement"
            hint="Deliveries already recorded in Procurement but not yet in warehouse stock."
            options={pending.map((p) => ({
              value: String(p.receiptId),
              label: `${p.poNumber || p.requestNumber} · ${p.material.name} · ${formatNumber(p.quantity)} ${p.unit}`,
            }))}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Material"
          required
          value={values.material_id}
          onChange={set('material_id')}
          placeholder="Select a material"
          options={materialOptions}
          error={fieldErrors.material_id}
          className={type === 'transfer' ? 'sm:col-span-2' : ''}
        />

        <SelectField
          label={type === 'transfer' ? 'Source warehouse' : 'Warehouse'}
          required
          value={values.warehouse_id}
          onChange={set('warehouse_id')}
          placeholder="Select a warehouse"
          options={warehouseOptions}
          error={fieldErrors.warehouse_id}
        />

        {type === 'transfer' && (
          <SelectField
            label="Destination warehouse"
            required
            value={values.destination_warehouse_id}
            onChange={set('destination_warehouse_id')}
            placeholder="Select a warehouse"
            options={warehouseOptions}
            error={fieldErrors.destination_warehouse_id}
          />
        )}

        <SelectField
          label="Project"
          value={values.project_id}
          onChange={set('project_id')}
          placeholder="Not assigned to a project"
          options={projectOptions}
          error={fieldErrors.project_id}
        />

        <SelectField
          label="Site"
          value={values.site_id}
          onChange={set('site_id')}
          placeholder={values.project_id ? 'Not assigned to a site' : 'Select a project first'}
          options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          error={fieldErrors.site_id}
        />

        {type === 'adjustment' && (
          <SelectField
            label="Adjustment type"
            required
            value={values.adjustment_type}
            onChange={set('adjustment_type')}
            options={ADJUSTMENT_TYPE_OPTIONS}
            error={fieldErrors.adjustment_type}
          />
        )}

        {['issue', 'transfer', 'adjustment'].includes(type) && values.warehouse_id && values.material_id && availableStock !== null && (
          <div className="sm:col-span-2 rounded-lg border border-line bg-canvas/70 px-3 py-2 text-xs">
            <span className="text-ink-subtle">Stock in {selectedWarehouse?.name || 'source warehouse'}: </span>
            <span className={`font-semibold tabular-nums ${availableStock <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {formatNumber(availableStock)} {unit}
            </span>
            {availableStock <= 0 ? (
              <span className="ml-2 font-medium text-red-600">⚠️ Out of stock</span>
            ) : (
              <span className="ml-2 text-emerald-600 font-medium">✓ Available</span>
            )}
          </div>
        )}

        <InputField
          label={unit ? `Quantity (${unit})` : 'Quantity'}
          required
          type="number"
          min="0"
          step="0.01"
          value={values.quantity}
          onChange={set('quantity')}
          error={fieldErrors.quantity}
        />

        <InputField
          label={type === 'receipt' ? 'Receipt date' : type === 'issue' ? 'Issue date' : type === 'transfer' ? 'Transfer date' : 'Adjustment date'}
          required
          type="date"
          value={values.transaction_date}
          onChange={set('transaction_date')}
          error={fieldErrors.transaction_date}
        />

        {type === 'adjustment' && (
          <InputField
            label="Reason"
            required
            value={values.reason}
            onChange={set('reason')}
            placeholder="Recount surplus, damaged in storage…"
            error={fieldErrors.reason}
            className="sm:col-span-2"
          />
        )}

        <InputField
          label="Reference"
          value={values.reference}
          onChange={set('reference')}
          placeholder="Challan, PO or issue-note number"
          error={fieldErrors.reference}
          className="sm:col-span-2"
        />

        <TextAreaField
          label="Notes"
          value={values.notes}
          onChange={set('notes')}
          rows={2}
          className="sm:col-span-2"
          placeholder="Vehicle, condition on arrival, who collected it…"
        />
      </div>
    </Modal>
  );
}
