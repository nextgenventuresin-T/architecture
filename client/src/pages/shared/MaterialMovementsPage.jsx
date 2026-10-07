import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, PackageCheck, Send } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { InputField, SelectField } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import ExcelTable from '../../components/warehouse/ExcelTable';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../config/roles';
import { materialMovementApi } from '../../api/materialMovementApi';
import { procurementApi } from '../../api/procurementApi';
import { materialsApi } from '../../api/materialsApi';
import { warehouseApi } from '../../api/warehouseApi';
import { toApiError } from '../../api/axiosClient';
import { formatNumber, formatCurrency, formatDate } from '../../utils/format';

const STATUS_TONE = { in_transit: 'warning', received: 'positive', completed: 'positive', cancelled: 'danger' };
const STATUS_LABEL = { in_transit: 'In transit', received: 'Received', completed: 'Completed', cancelled: 'Cancelled' };

const EMPTY = {
  source: '', source_contractor_id: '', destination_contractor_id: '', material_id: '',
  requested_quantity: '', sent_quantity: '', vehicle_number: '', driver_name: '',
  driver_phone: '', transport_cost: '', other_expenses: '', reference: '', remarks: '',
};

export default function MaterialMovementsPage() {
  const { user } = useAuth();
  const isContractor = user?.role === ROLES.CONTRACTOR;

  const [movements, setMovements] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [warehouseLookups, setWarehouseLookups] = useState({ warehouses: [], stockBalances: [] });
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [sending, setSending] = useState(false);
  const [receivingId, setReceivingId] = useState(null);

  const reload = useCallback(() => {
    materialMovementApi.list({}).then(setMovements).catch(() => setMovements([]));
    materialMovementApi.incoming().then(setIncoming).catch(() => setIncoming([]));
  }, []);

  useEffect(() => {
    reload();
    procurementApi.lookups().then((d) => setContractors(d.contractors ?? [])).catch(() => setContractors([]));
    materialsApi.list({ pageSize: 200 }).then((d) => setMaterials(d.materials ?? [])).catch(() => setMaterials([]));
    warehouseApi.lookups().then((d) => setWarehouseLookups(d || { warehouses: [], stockBalances: [] })).catch(() => {});
  }, [reload]);

  const centralWarehouses = useMemo(() => {
    return (warehouseLookups.warehouses || []).filter((w) => w.type === 'central' && w.status === 'active');
  }, [warehouseLookups.warehouses]);

  const sourceOptions = useMemo(() => {
    const opts = [];
    if (centralWarehouses.length > 0) {
      opts.push(...centralWarehouses.map((w) => ({ value: `warehouse:${w.id}`, label: `${w.name} (${w.code}) — Central Store` })));
    }
    opts.push(...contractors.map((c) => ({ value: `contractor:${c.id}`, label: `${c.name} — Contractor` })));
    return opts;
  }, [centralWarehouses, contractors]);

  const selectedMaterial = materials.find((m) => String(m.id) === String(values.material_id));

  const availableStock = useMemo(() => {
    if (!values.material_id || !warehouseLookups.stockBalances) return null;
    let targetWarehouseId = null;
    if (isContractor) {
      const myWh = warehouseLookups.warehouses?.find((w) => Number(w.contractor_id) === Number(user?.contractorId) || w.type === 'contractor');
      if (myWh) targetWarehouseId = myWh.id;
    } else if (values.source) {
      if (values.source.startsWith('warehouse:')) {
        targetWarehouseId = Number(values.source.split(':')[1]);
      } else if (values.source.startsWith('contractor:')) {
        const cId = Number(values.source.split(':')[1]);
        const match = warehouseLookups.warehouses?.find((w) => Number(w.contractor_id) === cId);
        if (match) targetWarehouseId = match.id;
      }
    }
    if (!targetWarehouseId) return null;
    const balances = warehouseLookups.stockBalances.filter(
      (b) => Number(b.warehouseId) === Number(targetWarehouseId) && Number(b.materialId) === Number(values.material_id)
    );
    return balances.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  }, [values.material_id, values.source, isContractor, warehouseLookups, user?.contractorId]);

  const set = (key) => (e) => {
    setValues((c) => ({ ...c, [key]: e.target.value }));
    setFieldErrors((c) => ({ ...c, [key]: undefined }));
  };

  async function handleSend() {
    setError(null);
    setFlash(null);
    const errs = {};
    if (!isContractor && !values.source) errs.source = 'Select the source warehouse or contractor.';
    if (!values.destination_contractor_id) errs.destination_contractor_id = 'Select the destination contractor.';
    if (!values.material_id) errs.material_id = 'Select a material.';
    if (!values.sent_quantity || Number(values.sent_quantity) <= 0) errs.sent_quantity = 'Enter a quantity greater than zero.';
    else if (availableStock !== null && Number(values.sent_quantity) > availableStock) {
      errs.sent_quantity = `Only ${formatNumber(availableStock)} ${selectedMaterial?.unit || 'units'} available in selected source.`;
    }
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setSending(true);
    try {
      const payload = {
        destination_contractor_id: Number(values.destination_contractor_id),
        material_id: Number(values.material_id),
        sent_quantity: Number(values.sent_quantity),
        requested_quantity: values.requested_quantity ? Number(values.requested_quantity) : null,
        vehicle_number: values.vehicle_number.trim() || null,
        driver_name: values.driver_name.trim() || null,
        driver_phone: values.driver_phone.trim() || null,
        transport_cost: values.transport_cost ? Number(values.transport_cost) : 0,
        other_expenses: values.other_expenses ? Number(values.other_expenses) : 0,
        reference: values.reference.trim() || null,
        remarks: values.remarks.trim() || null,
      };
      if (!isContractor && values.source) {
        if (values.source.startsWith('warehouse:')) {
          payload.source_warehouse_id = Number(values.source.split(':')[1]);
        } else if (values.source.startsWith('contractor:')) {
          payload.source_contractor_id = Number(values.source.split(':')[1]);
        }
      }
      const mv = await materialMovementApi.send(payload);
      setFlash(`Sent ${formatNumber(mv.sentQuantity)} ${mv.unit} — ${mv.movementNumber} is now in transit.`);
      setValues(EMPTY);
      reload();
      warehouseApi.lookups().then((d) => setWarehouseLookups(d || { warehouses: [], stockBalances: [] })).catch(() => {});
    } catch (caught) {
      const apiErr = toApiError(caught);
      if (apiErr.details) setFieldErrors(apiErr.details);
      setError(apiErr);
    } finally {
      setSending(false);
    }
  }

  async function handleReceive(id) {
    setError(null);
    setReceivingId(id);
    try {
      const mv = await materialMovementApi.receive(id, {});
      setFlash(`Received ${formatNumber(mv.receivedQuantity)} ${mv.unit} into ${mv.destination.warehouseName}.`);
      reload();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setReceivingId(null);
    }
  }

  const columns = [
    { key: 'movement', header: 'Movement', value: (r) => r.movementNumber, render: (r) => (
      <div><p className="font-medium text-ink">{r.movementNumber}</p><p className="text-xs text-ink-subtle">{formatDate(r.sentAt)}</p></div>
    ) },
    { key: 'material', header: 'Material', value: (r) => r.material.name, render: (r) => <span className="text-ink">{r.material.name}</span> },
    { key: 'source', header: 'From', value: (r) => r.source.contractorName || r.source.warehouseName, render: (r) => <span className="text-xs text-ink-muted">{r.source.contractorName || r.source.warehouseName}</span> },
    { key: 'destination', header: 'To', value: (r) => r.destination.contractorName || r.destination.warehouseName, render: (r) => <span className="text-xs text-ink-muted">{r.destination.contractorName || r.destination.warehouseName}</span> },
    { key: 'requested', header: 'Requested', align: 'right', value: (r) => r.requestedQuantity ?? 0, render: (r) => <span className="tabular-nums text-ink-subtle">{r.requestedQuantity != null ? formatNumber(r.requestedQuantity) : '—'}</span> },
    { key: 'sent', header: 'Sent', align: 'right', value: (r) => r.sentQuantity, render: (r) => <span className="tabular-nums text-ink">{formatNumber(r.sentQuantity)}</span> },
    { key: 'received', header: 'Received', align: 'right', value: (r) => r.receivedQuantity ?? 0, render: (r) => <span className="tabular-nums text-ink-muted">{r.receivedQuantity != null ? formatNumber(r.receivedQuantity) : '—'}</span> },
    { key: 'vehicle', header: 'Vehicle', value: (r) => r.vehicleNumber || '', render: (r) => <span className="text-xs text-ink-subtle">{r.vehicleNumber || '—'}</span> },
    { key: 'driver', header: 'Driver', value: (r) => r.driverName || '', render: (r) => <span className="text-xs text-ink-subtle">{r.driverName || '—'}{r.driverPhone ? ` · ${r.driverPhone}` : ''}</span> },
    { key: 'transport', header: 'Transport', align: 'right', value: (r) => r.transportCost, render: (r) => <span className="tabular-nums text-ink-subtle">{formatCurrency(r.transportCost)}</span> },
    { key: 'other', header: 'Other exp.', align: 'right', value: (r) => r.otherExpenses, render: (r) => <span className="tabular-nums text-ink-subtle">{formatCurrency(r.otherExpenses)}</span> },
    { key: 'po', header: 'PO / ref', value: (r) => r.reference || r.procurement?.requestNumber || '', render: (r) => <span className="text-xs text-ink-subtle">{r.reference || r.procurement?.requestNumber || '—'}</span> },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Material movements"
        description="Send material to another contractor, receive incoming shipments, and track every transfer end to end."
        breadcrumbs={[{ label: 'Dashboard' }, { label: 'Material movements' }]}
      />

      {flash && <Alert tone="positive" className="mb-4" onClose={() => setFlash(null)}>{flash}</Alert>}
      {error && <Alert tone="error" title="Could not complete that" className="mb-4">{error.message}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Send material" description="Source stock is issued immediately; the destination only increases once received." />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!isContractor && (
              <SelectField
                label="From (Source)"
                required
                value={values.source}
                onChange={set('source')}
                error={fieldErrors.source}
                placeholder="Select source warehouse or contractor"
                options={sourceOptions}
              />
            )}
            <SelectField
              label="To contractor"
              required
              value={values.destination_contractor_id}
              onChange={set('destination_contractor_id')}
              error={fieldErrors.destination_contractor_id}
              placeholder="Select destination"
              options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <SelectField
              label="Material"
              required
              value={values.material_id}
              onChange={set('material_id')}
              error={fieldErrors.material_id}
              placeholder="Select material"
              options={materials.map((m) => ({ value: String(m.id), label: `${m.name} (${m.category})` }))}
              className="sm:col-span-2"
            />
            {values.material_id && (isContractor || values.source) && availableStock !== null && (
              <div className="sm:col-span-2 -mt-2 mb-1 rounded-lg border border-line bg-canvas/70 px-3 py-2 text-xs">
                <span className="text-ink-subtle">Stock available in source: </span>
                <span className={`font-semibold tabular-nums ${availableStock <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatNumber(availableStock)} {selectedMaterial?.unit || 'units'}
                </span>
                {availableStock <= 0 ? (
                  <span className="ml-2 font-medium text-red-600">⚠️ Out of stock</span>
                ) : (
                  <span className="ml-2 text-emerald-600 font-medium">✓ Available</span>
                )}
              </div>
            )}
            <InputField label="Requested qty (PO)" type="number" min="0" step="0.01" value={values.requested_quantity} onChange={set('requested_quantity')} error={fieldErrors.requested_quantity} hint="What was requested." />
            <InputField label="Sent qty" required type="number" min="0" step="0.01" value={values.sent_quantity} onChange={set('sent_quantity')} error={fieldErrors.sent_quantity} hint="What you actually send." />
            <InputField label="Vehicle number" value={values.vehicle_number} onChange={set('vehicle_number')} placeholder="PB11 AB 1234" />
            <InputField label="Driver name" value={values.driver_name} onChange={set('driver_name')} />
            <InputField label="Driver phone" value={values.driver_phone} onChange={set('driver_phone')} />
            <InputField label="Transport cost" type="number" min="0" step="0.01" value={values.transport_cost} onChange={set('transport_cost')} />
            <InputField label="Other expenses" type="number" min="0" step="0.01" value={values.other_expenses} onChange={set('other_expenses')} />
            <InputField label="PO / reference" value={values.reference} onChange={set('reference')} />
            <InputField label="Remarks" value={values.remarks} onChange={set('remarks')} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <Button type="button" isLoading={sending} loadingText="Sending…" onClick={handleSend}>
                <Send className="h-4 w-4" aria-hidden="true" /> Send material
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Incoming material" description="Shipments in transit to you — receive to add them to your warehouse." />
          <CardBody className="space-y-3">
            {incoming.length === 0 ? (
              <p className="text-sm text-ink-subtle">No incoming shipments right now.</p>
            ) : (
              incoming.map((mv) => (
                <div key={mv.id} className="flex items-start justify-between gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{mv.material.name} · {formatNumber(mv.sentQuantity)} {mv.unit}</p>
                    <p className="text-xs text-ink-subtle">From {mv.source.contractorName || mv.source.warehouseName} · {mv.movementNumber}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">{mv.vehicleNumber ? `Vehicle ${mv.vehicleNumber}` : ''}{mv.driverName ? ` · ${mv.driverName}` : ''}{mv.driverPhone ? ` · ${mv.driverPhone}` : ''}</p>
                  </div>
                  <Button type="button" variant="primary" isLoading={receivingId === mv.id} loadingText="Receiving…" onClick={() => handleReceive(mv.id)}>
                    <PackageCheck className="h-4 w-4" aria-hidden="true" /> Receive
                  </Button>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Movement history" description="Every send and receive, fully traceable." icon={Truck} />
        <ExcelTable columns={columns} rows={movements} initialSort={{ key: 'movement', dir: 'desc' }} searchPlaceholder="Search movements…" />
      </Card>
    </>
  );
}
