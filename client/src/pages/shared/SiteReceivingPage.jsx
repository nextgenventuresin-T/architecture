import { useMemo, useState } from 'react';
import { PackageCheck, Truck, ShieldCheck, Inbox } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { InputField, SelectField, TextAreaField } from '../../components/ui/Field';
import useAsync from '../../hooks/useAsync';
import { siteReceivingApi } from '../../api/siteReceivingApi';
import { toApiError } from '../../api/axiosClient';
import { formatDate, formatNumber, todayIso } from '../../utils/format';

const KIND_LABEL = { movement: 'From Central Warehouse', vendor_order: 'Vendor delivery' };

/**
 * RECEIVE MATERIALS - for Site Engineers and Project Managers.
 *
 * Lists what Admin has sent to the sites this user is assigned to (Central Warehouse ->
 * Site dispatches and vendor orders). The receiver checks the dispatch details, types
 * the vehicle number read off the arriving truck, enters the quantity received and
 * confirms. The server verifies the vehicle, the site assignment and the quantity, and
 * posts the stock exactly once.
 */
export default function SiteReceivingPage({ basePath = '/employee' }) {
  const { data, isLoading, error, reload } = useAsync(() => siteReceivingApi.incoming(), []);
  const [siteFilter, setSiteFilter] = useState('all');
  const [active, setActive] = useState(null);
  const [banner, setBanner] = useState(null);

  const sites = data?.sites ?? [];
  const deliveries = useMemo(() => {
    const all = data?.deliveries ?? [];
    return siteFilter === 'all' ? all : all.filter((d) => String(d.site?.id) === siteFilter);
  }, [data, siteFilter]);

  return (
    <>
      <PageHeader
        title="Receive Materials"
        description="Deliveries Admin has sent to your sites. Check the details, verify the vehicle number and confirm what arrived."
        breadcrumbs={[{ label: 'Dashboard', to: basePath }, { label: 'Receive Materials' }]}
      />

      {banner && <Alert tone={banner.tone} className="mb-4">{banner.message}</Alert>}
      {error && <Alert tone="error" title="Could not load deliveries" className="mb-4">{error.message}</Alert>}

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !error && sites.length === 0 ? (
        <Card>
          <CardBody className="py-8">
            <EmptyState
              icon={Inbox}
              title="No sites assigned to you"
              description="You can receive material only at sites where you are the Site Engineer or Project Manager. Ask Admin to assign you to the site."
            />
          </CardBody>
        </Card>
      ) : !error && (
        <Card>
          <CardHeader
            title="Waiting to be received"
            description={`${deliveries.length} deliver${deliveries.length === 1 ? 'y' : 'ies'} across ${sites.length} site${sites.length === 1 ? '' : 's'}`}
            action={sites.length > 1 && (
              <div className="w-56">
                <SelectField
                  aria-label="Filter by site"
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  options={[{ value: 'all', label: 'All my sites' }, ...sites.map((s) => ({ value: String(s.id), label: `${s.name} · ${s.project.name}` }))]}
                />
              </div>
            )}
          />
          {deliveries.length === 0 ? (
            <CardBody className="py-8">
              <EmptyState icon={PackageCheck} title="Nothing waiting" description="There are no deliveries in transit to your sites right now." />
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {deliveries.map((d) => (
                <li key={`${d.kind}-${d.id}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{d.material}</span>
                      <Badge tone={d.kind === 'movement' ? 'brand' : 'neutral'}>{KIND_LABEL[d.kind]}</Badge>
                      {d.status === 'partially_received' && <Badge tone="warning">Partly received</Badge>}
                    </div>
                    <p className="text-sm text-ink-muted">
                      {formatNumber(d.remainingQuantity)} {d.unit} to receive
                      {d.receivedQuantity > 0 && ` (of ${formatNumber(d.sentQuantity)}; ${formatNumber(d.receivedQuantity)} already received)`}
                      {' · '}{d.site?.name || '—'}{d.project ? ` · ${d.project.name}` : ''}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {d.reference}{d.requestNumber && d.requestNumber !== d.reference ? ` · ${d.requestNumber}` : ''} · From {d.source} · Sent {formatDate(d.dispatchDate)}
                      {d.driverName ? ` · Driver ${d.driverName}${d.driverPhone ? ` (${d.driverPhone})` : ''}` : ''}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => { setBanner(null); setActive(d); }} disabled={!d.vehicleRecorded}
                    title={d.vehicleRecorded ? undefined : 'Admin has not recorded the vehicle for this delivery yet'}>
                    <PackageCheck className="h-4 w-4" aria-hidden="true" /> Receive
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ReceiveDialog
        delivery={active}
        onClose={() => setActive(null)}
        onDone={(msg) => { setActive(null); setBanner({ tone: 'success', message: msg }); reload(); }}
      />
    </>
  );
}

function ReceiveDialog({ delivery, onClose, onDone }) {
  const [values, setValues] = useState({ vehicle_number: '', received_quantity: '', receiving_date: todayIso(), notes: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState(null);

  // Reset whenever a different delivery is opened.
  const key = delivery ? `${delivery.kind}-${delivery.id}` : null;
  if (key !== lastId) {
    setLastId(key);
    setValues({ vehicle_number: '', received_quantity: delivery ? String(delivery.remainingQuantity) : '', receiving_date: todayIso(), notes: '' });
    setFieldErrors({});
    setFormError(null);
  }
  if (!delivery) return null;

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [k]: undefined }));
  };

  async function submit(e) {
    e?.preventDefault?.();
    const errs = {};
    const qty = Number(values.received_quantity);
    if (!values.vehicle_number.trim()) errs.vehicle_number = 'Enter the vehicle number of the arriving truck.';
    if (!(qty > 0)) errs.received_quantity = 'Enter the quantity received.';
    else if (qty > Number(delivery.remainingQuantity)) errs.received_quantity = `Only ${formatNumber(delivery.remainingQuantity)} ${delivery.unit} remain to be received.`;
    if (!values.receiving_date) errs.receiving_date = 'Enter the receiving date.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setFormError(null);
    const payload = {
      vehicle_number: values.vehicle_number.trim(),
      received_quantity: qty,
      receiving_date: values.receiving_date,
      notes: values.notes.trim() || null,
    };
    try {
      const result = delivery.kind === 'movement'
        ? await siteReceivingApi.receiveShipment(delivery.id, payload)
        : await siteReceivingApi.receiveOrder(delivery.id, payload);
      onDone(`${formatNumber(qty)} ${delivery.unit} ${delivery.material} received at ${delivery.site?.name || 'the site'} (${result.reference || delivery.reference}).`);
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
    } finally {
      setSaving(false);
    }
  }

  const rows = [
    ['Material', `${delivery.material} (${delivery.unit})`],
    ['Sent', `${formatNumber(delivery.sentQuantity)} ${delivery.unit}`],
    ...(delivery.receivedQuantity > 0 ? [['Already received', `${formatNumber(delivery.receivedQuantity)} ${delivery.unit}`]] : []),
    ['From', delivery.source],
    ['To', `${delivery.site?.name || '—'}${delivery.project ? ` · ${delivery.project.name}` : ''}`],
    ['Reference', delivery.reference],
    ['Dispatched', formatDate(delivery.dispatchDate)],
    ['Driver', delivery.driverName ? `${delivery.driverName}${delivery.driverPhone ? ` · ${delivery.driverPhone}` : ''}` : '—'],
    ...(delivery.task ? [['Task', delivery.task]] : []),
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Receive delivery"
      description="Check these dispatch details against what arrived, then confirm."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {saving ? 'Confirming…' : 'Verify & confirm receipt'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError.message}</Alert>}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-line bg-canvas/60 p-4 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 sm:block">
              <dt className="text-xs uppercase tracking-wide text-ink-subtle">{k}</dt>
              <dd className="font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField label="Arriving vehicle no." required value={values.vehicle_number} onChange={set('vehicle_number')}
            error={fieldErrors.vehicle_number} placeholder="As written on the truck" hint="Read it off the truck - it must match the dispatch." />
          <InputField label={`Received qty (${delivery.unit})`} required type="number" min="0" step="any" max={delivery.remainingQuantity}
            value={values.received_quantity} onChange={set('received_quantity')} error={fieldErrors.received_quantity}
            hint={`Up to ${formatNumber(delivery.remainingQuantity)}`} />
          <InputField label="Receiving date" required type="date" value={values.receiving_date} max={todayIso()}
            onChange={set('receiving_date')} error={fieldErrors.receiving_date} />
        </div>
        {delivery.kind === 'movement' && Number(values.received_quantity) > 0 && Number(values.received_quantity) < Number(delivery.sentQuantity) && (
          <Alert tone="warning">
            You are receiving less than was sent. This closes the shipment as short-received - the difference will not arrive later on this dispatch.
          </Alert>
        )}
        {delivery.kind === 'vendor_order' && (
          <TextAreaField label="Notes" rows={2} value={values.notes} onChange={set('notes')} placeholder="Optional - condition, shortages, challan no." />
        )}
        <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
          <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Stock is added to the site only when you confirm, and each delivery can be received only once.
        </p>
      </form>
    </Modal>
  );
}
