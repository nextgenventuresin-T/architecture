import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, History, HeartPulse, ArrowRightLeft, Undo2, Pencil, Wrench } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Alert from '../ui/Alert';
import Skeleton from '../ui/Skeleton';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { toolApi } from '../../api/toolApi';
import { projectsApi } from '../../api/projectsApi';
import { contractorsApi } from '../../api/contractorsApi';
import { tasksApi } from '../../api/tasksApi';
import { vendorApi } from '../../api/vendorApi';
import { toApiError } from '../../api/axiosClient';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';

export const HEALTH_OPTIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'poor', label: 'Poor' },
];
const HEALTH_TONE = { excellent: 'positive', good: 'brand', average: 'warning', poor: 'danger' };
const STATUS_TONE = { available: 'positive', allocated: 'brand', maintenance: 'warning', retired: 'neutral' };
const STATUS_LABEL = { available: 'Available', allocated: 'Allocated', maintenance: 'In maintenance', retired: 'Retired / returned' };
const EVENT_LABEL = {
  registered: 'Registered', health_update: 'Health updated', allocated: 'Allocated', returned: 'Returned',
  transferred: 'Reassigned', rental_started: 'Rental started', rental_returned: 'Rental ended', maintenance: 'Maintenance',
  status_change: 'Status change', serial_updated: 'Serial changed', charge_updated: 'Charge updated',
};
const today = () => new Date().toISOString().slice(0, 10);

const errMessage = (caught) => {
  const e = toApiError(caught);
  const first = Object.values(e.details || {})[0];
  return e.message === 'Check the highlighted fields.' && first ? first : e.message;
};

/**
 * Physical machines, one row per SERIAL NUMBER. Replaces the generated machine code as the
 * identity of a machine. `mode` decides what the viewer may do:
 *   admin      : register / edit / allocate / reassign / return / health / maintenance
 *   pm         : health update + return for machines on their assigned projects
 *   contractor : view availability, return a machine they hold
 */
export default function ToolUnitsPanel({ tools = [], mode = 'admin', onChanged, registerSignal = 0 }) {
  const [filters, setFilters] = useState({ toolId: '', status: 'all', health: 'all', search: '' });
  const [data, setData] = useState({ units: [], pagination: { total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [modal, setModal] = useState(null); // { kind, unit }

  const load = useCallback(() => {
    setLoading(true);
    toolApi
      .units({
        toolId: filters.toolId || undefined,
        status: filters.status,
        health: filters.health,
        search: filters.search || undefined,
        pageSize: 100,
      })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(toApiError(e)))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  // The page header button opens the same register dialog.
  useEffect(() => { if (registerSignal > 0) setModal({ kind: 'register' }); }, [registerSignal]);

  const done = (message) => {
    setModal(null);
    setFlash(message);
    load();
    if (onChanged) onChanged();
  };

  const isAdmin = mode === 'admin';
  const canHealth = isAdmin || mode === 'pm';
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="mt-6">
      <CardHeader
        title="Physical machines — by serial number"
        description="Every machine is tracked individually: its own unique serial, cost, health, location and allocation history."
        action={isAdmin ? (
          <Button size="sm" onClick={() => setModal({ kind: 'register' })}>
            <Plus className="mr-1 h-4 w-4" /> Register machine
          </Button>
        ) : null}
      />
      <div className="space-y-3 px-5 pb-5">
        {flash && <Alert tone="success">{flash}</Alert>}
        {error && <Alert tone="error">{error.message}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-subtle" />
            <input
              type="search"
              value={filters.search}
              onChange={set('search')}
              placeholder="Search serial or machine…"
              className="h-9 w-56 rounded-lg border border-line bg-white pl-8 pr-2 text-sm"
            />
          </div>
          <select value={filters.toolId} onChange={set('toolId')} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" aria-label="Machine type">
            <option value="">All machine types</option>
            {tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={filters.status} onChange={set('status')} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" aria-label="Availability">
            <option value="all">Any availability</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filters.health} onChange={set('health')} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" aria-label="Health">
            <option value="all">Any health</option>
            {HEALTH_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.units.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-ink-subtle">
            No physical machines registered yet{isAdmin ? ' — use “Register machine” to add each unit with its unique serial number.' : '.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas-subtle text-xs font-semibold uppercase text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5">Serial no.</th>
                  <th className="px-4 py-2.5">Machine</th>
                  <th className="px-4 py-2.5">Health</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">With / location</th>
                  <th className="px-4 py-2.5">Purchased</th>
                  <th className="px-4 py-2.5 text-right">Cost</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.units.map((u) => (
                  <tr key={u.id} className="hover:bg-canvas">
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-ink">
                      {u.serialNumber}
                      {u.ownershipType === 'rented' && <Badge tone="warning" className="ml-2">Rented</Badge>}
                      {u.isExpired && <Badge tone="danger" className="ml-2">Expired</Badge>}
                    </td>
                    <td className="px-4 py-3 text-ink">{u.toolName}<p className="text-xs text-ink-subtle">{u.toolType}</p></td>
                    <td className="px-4 py-3">
                      <Badge tone={HEALTH_TONE[u.health] ?? 'neutral'}>{u.health}</Badge>
                      {u.healthUpdatedAt && <p className="mt-0.5 text-[11px] text-ink-subtle">{formatDate(u.healthUpdatedAt)}{u.healthUpdatedBy ? ` · ${u.healthUpdatedBy.name}` : ''}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[u.availabilityStatus] ?? 'neutral'}>{STATUS_LABEL[u.availabilityStatus] ?? u.availabilityStatus}</Badge></td>
                    <td className="px-4 py-3 text-ink-muted">
                      {u.availabilityStatus === 'allocated' ? (
                        u.currentContractor || u.currentProject ? (
                          <>
                            <p className="text-ink">{u.currentContractor?.name ?? '—'}</p>
                            <p className="text-xs text-ink-subtle">{[u.currentProject?.name, u.currentSite?.name, u.currentTask?.name].filter(Boolean).join(' · ')}</p>
                          </>
                        ) : <span className="text-xs text-ink-subtle">Held by another contractor</span>
                      ) : (u.warehouse?.name ?? '—')}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{u.purchaseDate ? formatDate(u.purchaseDate) : '—'}{u.expiryDate && <p className="text-xs text-ink-subtle">Expires {formatDate(u.expiryDate)}</p>}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{u.purchaseCost ? formatCurrency(u.purchaseCost) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" title="History" onClick={() => setModal({ kind: 'history', unit: u })}><History className="h-4 w-4" /></Button>
                        {canHealth && u.availabilityStatus !== 'retired' && (
                          <Button variant="ghost" size="sm" title="Update health" onClick={() => setModal({ kind: 'health', unit: u })}><HeartPulse className="h-4 w-4" /></Button>
                        )}
                        {isAdmin && u.availabilityStatus === 'available' && (
                          <Button variant="ghost" size="sm" title="Allocate" onClick={() => setModal({ kind: 'allocate', unit: u })}><Wrench className="h-4 w-4" /></Button>
                        )}
                        {isAdmin && u.availabilityStatus === 'allocated' && (
                          <Button variant="ghost" size="sm" title="Reassign to another contractor" onClick={() => setModal({ kind: 'transfer', unit: u })}><ArrowRightLeft className="h-4 w-4" /></Button>
                        )}
                        {u.availabilityStatus === 'allocated' && u.activeAllocationId && u.currentProject && (
                          <Button variant="ghost" size="sm" title="Return" onClick={() => setModal({ kind: 'return', unit: u })}><Undo2 className="h-4 w-4" /></Button>
                        )}
                        {isAdmin && (
                          <Button variant="ghost" size="sm" title="Edit" onClick={() => setModal({ kind: 'edit', unit: u })}><Pencil className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.kind === 'register' && <UnitFormModal tools={tools} onClose={() => setModal(null)} onSaved={() => done('Machine registered.')} />}
      {modal?.kind === 'edit' && <UnitFormModal tools={tools} unit={modal.unit} onClose={() => setModal(null)} onSaved={() => done('Machine updated.')} />}
      {modal?.kind === 'health' && <HealthModal unit={modal.unit} onClose={() => setModal(null)} onSaved={() => done('Health updated and logged.')} />}
      {modal?.kind === 'allocate' && <AllocateModal unit={modal.unit} transfer={false} onClose={() => setModal(null)} onSaved={() => done('Machine allocated.')} />}
      {modal?.kind === 'transfer' && <AllocateModal unit={modal.unit} transfer onClose={() => setModal(null)} onSaved={() => done('Machine reassigned — previous holder closed out for their actual days.')} />}
      {modal?.kind === 'return' && <ReturnModal unit={modal.unit} canJudge={canHealth} onClose={() => setModal(null)} onSaved={() => done('Machine returned. Usage days and charges were calculated.')} />}
      {modal?.kind === 'history' && <HistoryModal unit={modal.unit} onClose={() => setModal(null)} />}
    </Card>
  );
}

/* ----------------------------------------------------------------- register / edit */
function UnitFormModal({ tools, unit, onClose, onSaved }) {
  const isEdit = Boolean(unit);
  const [vendors, setVendors] = useState([]);
  const [v, setV] = useState({
    tool_id: unit ? String(unit.toolId) : '',
    new_name: '',
    new_type: 'Heavy Machinery',
    serial_number: unit?.serialNumber ?? '',
    purchase_date: unit?.purchaseDate ?? '',
    expiry_date: unit?.expiryDate ?? '',
    purchase_cost: unit?.purchaseCost ? String(unit.purchaseCost) : '',
    vendor_id: unit?.vendor ? String(unit.vendor.id) : '',
    health: unit?.health ?? 'good',
    notes: unit?.notes ?? '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { vendorApi.list().then((d) => setVendors(d.vendors ?? [])).catch(() => setVendors([])); }, []);
  const set = (k) => (e) => { setV((c) => ({ ...c, [k]: e.target.value })); setErrors((c) => ({ ...c, [k]: undefined })); };

  async function save() {
    const errs = {};
    const isNewType = v.tool_id === '__new';
    if (!isEdit && !v.tool_id) errs.tool_id = 'Choose the machine type.';
    if (isNewType && !v.new_name.trim()) errs.new_name = 'Enter the machine / tool name.';
    if (!v.serial_number.trim()) errs.serial_number = 'A unique serial number is required for every physical machine.';
    if (v.purchase_date && v.expiry_date && v.expiry_date < v.purchase_date) errs.expiry_date = 'Expiry cannot be before the purchase date.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setFormError(null);
    const payload = {
      serial_number: v.serial_number.trim(),
      purchase_date: v.purchase_date || null,
      expiry_date: v.expiry_date || null,
      purchase_cost: v.purchase_cost ? Number(v.purchase_cost) : 0,
      vendor_id: v.vendor_id ? Number(v.vendor_id) : null,
      notes: v.notes.trim() || null,
    };
    try {
      if (isEdit) await toolApi.updateUnit(unit.id, payload);
      else {
        let toolId = Number(v.tool_id);
        if (v.tool_id === '__new') {
          // Machine type not in the list yet: create it, then register this physical unit under it.
          const created = await toolApi.create({ name: v.new_name.trim(), type: v.new_type });
          toolId = created.id;
        }
        await toolApi.registerUnit({ ...payload, tool_id: toolId, health: v.health });
      }
      onSaved();
    } catch (caught) {
      const e = toApiError(caught);
      if (e.details) setErrors(e.details);
      setFormError(e.message);
    } finally { setSaving(false); }
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? `Edit ${unit.serialNumber}` : 'Register machine'} description="One record per physical machine. The serial number must be unique."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>{isEdit ? 'Save' : 'Register'}</Button></>}>
      {formError && <Alert tone="error" className="mb-4">{formError}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!isEdit && (
          <SelectField className="sm:col-span-2" label="Machine type" required value={v.tool_id} onChange={set('tool_id')} error={errors.tool_id}
            placeholder="Select type" options={[...tools.map((t) => ({ value: String(t.id), label: `${t.name} (${t.type})` })), { value: '__new', label: '+ Machine not listed — add new type' }]} />
        )}
        {!isEdit && v.tool_id === '__new' && (
          <>
            <InputField label="Machine / tool name" required value={v.new_name} onChange={set('new_name')} error={errors.new_name} placeholder="e.g. Bar Bending Machine" />
            <SelectField label="Classification" value={v.new_type} onChange={set('new_type')}
              options={['Heavy Machinery', 'Power Tool', 'Hand Tool', 'Measuring Equipment', 'Safety & Scaffolding', 'General Equipment'].map((x) => ({ value: x, label: x }))} />
          </>
        )}
        <InputField className="sm:col-span-2" label="Serial number" required value={v.serial_number} onChange={set('serial_number')} error={errors.serial_number} placeholder="e.g. SR001" hint="Unique across all machines." />
        <InputField label="Purchase date" type="date" value={v.purchase_date} onChange={set('purchase_date')} error={errors.purchase_date} />
        <InputField label="Expiry date (if applicable)" type="date" value={v.expiry_date} onChange={set('expiry_date')} error={errors.expiry_date} />
        <InputField label="Actual purchase cost (₹)" type="number" min="0" step="0.01" value={v.purchase_cost} onChange={set('purchase_cost')} error={errors.purchase_cost} />
        <SelectField label="Purchased from (vendor)" value={v.vendor_id} onChange={set('vendor_id')} placeholder="— Not recorded —" options={vendors.map((x) => ({ value: String(x.id), label: x.name }))} />
        {!isEdit && <SelectField label="Current health" value={v.health} onChange={set('health')} options={HEALTH_OPTIONS} />}
        <TextAreaField className="sm:col-span-2" label="Notes" rows={2} value={v.notes} onChange={set('notes')} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------- health */
function HealthModal({ unit, onClose, onSaved }) {
  const [health, setHealth] = useState(unit.health);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await toolApi.updateHealth(unit.id, { health, notes: notes.trim() || null }); onSaved(); } catch (c) { setError(errMessage(c)); } finally { setSaving(false); }
  }
  return (
    <Modal isOpen onClose={onClose} title={`Health — ${unit.serialNumber}`} description="Each update is logged with who made it and when."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>Update health</Button></>}>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <SelectField label="Current health" value={health} onChange={(e) => setHealth(e.target.value)} options={HEALTH_OPTIONS} />
      <TextAreaField className="mt-4" label="Inspection notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was observed?" />
    </Modal>
  );
}

/* ------------------------------------------------------- allocate / reassign */
export function ChargeFields({ v, set, errors = {} }) {
  return (
    <>
      <SelectField className="sm:col-span-2" label="Usage charge (approved by Admin)" value={v.charge_policy} onChange={set('charge_policy')}
        options={[
          { value: 'none', label: 'No usage charge' },
          { value: 'per_day_rate', label: 'Per-day rate' },
          { value: 'fixed_total', label: 'Fixed total over N days' },
        ]} hint="Recorded separately from the machine's original purchase cost." />
      {v.charge_policy === 'per_day_rate' && (
        <InputField label="Approved rate per day (₹)" type="number" min="0" step="0.01" value={v.usage_charge_rate} onChange={set('usage_charge_rate')} error={errors.usage_charge_rate} />
      )}
      {v.charge_policy === 'fixed_total' && (
        <>
          <InputField label="Approved total (₹)" type="number" min="0" step="0.01" value={v.usage_charge_total} onChange={set('usage_charge_total')} error={errors.usage_charge_total} />
          <InputField label="…covering days" type="number" min="1" step="1" value={v.usage_charge_days} onChange={set('usage_charge_days')}
            hint={v.usage_charge_total && v.usage_charge_days ? `Daily charge ₹${(Number(v.usage_charge_total) / Number(v.usage_charge_days)).toFixed(2)}` : undefined} />
          <SelectField className="sm:col-span-2" label="If returned early" value={v.unused_policy} onChange={set('unused_policy')}
            options={[
              { value: 'actual_days', label: 'Charge only the actual days used (remaining amount released)' },
              { value: 'full_amount', label: 'Charge the full approved amount' },
            ]} />
        </>
      )}
    </>
  );
}

function AllocateModal({ unit, transfer, onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [sites, setSites] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [v, setV] = useState({
    contractor_id: '', project_id: '', site_id: '', task_id: '', start_date: today(), return_date: today(), expected_return_date: '',
    charge_policy: 'none', usage_charge_rate: '', usage_charge_total: '', usage_charge_days: '', unused_policy: 'actual_days',
  });
  const [error, setError] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    projectsApi.list({ pageSize: 50 }).then((d) => setProjects(d.projects ?? [])).catch(() => {});
    contractorsApi.list({ pageSize: 50 }).then((d) => setContractors(d.contractors ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!v.project_id) { setSites([]); setTasks([]); return; }
    projectsApi.detail(v.project_id).then((d) => setSites(d.sites ?? [])).catch(() => setSites([]));
    tasksApi.list({ projectId: v.project_id, siteId: v.site_id || undefined }).then((d) => setTasks(d ?? [])).catch(() => setTasks([]));
  }, [v.project_id, v.site_id]);
  const set = (k) => (e) => { setV((c) => ({ ...c, [k]: e.target.value, ...(k === 'project_id' ? { site_id: '', task_id: '' } : {}) })); setErrors((c) => ({ ...c, [k]: undefined })); };

  async function save() {
    if (!v.contractor_id && !v.project_id) { setErrors({ contractor_id: 'Choose the contractor / project it is going to.' }); return; }
    setSaving(true);
    setError(null);
    const body = {
      contractor_id: v.contractor_id ? Number(v.contractor_id) : null,
      project_id: v.project_id ? Number(v.project_id) : null,
      site_id: v.site_id ? Number(v.site_id) : null,
      task_id: v.task_id ? Number(v.task_id) : null,
      expected_return_date: v.expected_return_date || null,
      charge_policy: v.charge_policy,
      usage_charge_rate: v.usage_charge_rate ? Number(v.usage_charge_rate) : undefined,
      usage_charge_total: v.usage_charge_total ? Number(v.usage_charge_total) : undefined,
      usage_charge_days: v.usage_charge_days ? Number(v.usage_charge_days) : undefined,
      unused_policy: v.unused_policy,
    };
    try {
      if (transfer) await toolApi.transferUnit(unit.id, { ...body, return_date: v.return_date, start_date: v.start_date > v.return_date ? v.start_date : undefined });
      else await toolApi.allocateUnit(unit.id, { ...body, start_date: v.start_date });
      onSaved();
    } catch (c) {
      const e = toApiError(c);
      if (e.details) setErrors(e.details);
      setError(errMessage(c));
    } finally { setSaving(false); }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${transfer ? 'Reassign' : 'Allocate'} ${unit.serialNumber}`}
      description={transfer ? `Currently with ${unit.currentContractor?.name ?? 'a contractor'}. Their last day is closed out and the new holder starts the day after.` : unit.toolName}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>{transfer ? 'Reassign machine' : 'Allocate machine'}</Button></>}>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Contractor" value={v.contractor_id} onChange={set('contractor_id')} error={errors.contractor_id} placeholder="Select contractor"
          options={contractors.map((c) => ({ value: String(c.id), label: c.name }))} />
        <SelectField label="Project" value={v.project_id} onChange={set('project_id')} error={errors.project_id} placeholder="Select project"
          options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))} />
        <SelectField label="Site" value={v.site_id} onChange={set('site_id')} error={errors.site_id} placeholder={v.project_id ? 'Select site' : 'Select project first'} disabled={!v.project_id}
          options={sites.map((s) => ({ value: String(s.id), label: s.name }))} />
        <SelectField label="Task" value={v.task_id} onChange={set('task_id')} error={errors.task_id} placeholder={v.project_id ? 'Select task' : 'Select project first'} disabled={!v.project_id}
          options={tasks.map((t) => ({ value: String(t.id), label: t.name }))} />
        {transfer && <InputField label="Current holder's last day" type="date" value={v.return_date} onChange={set('return_date')} error={errors.return_date} />}
        <InputField label={transfer ? 'New holder starts (optional)' : 'Start date'} type="date" value={v.start_date} onChange={set('start_date')} error={errors.start_date} />
        <InputField label="Expected return" type="date" value={v.expected_return_date} onChange={set('expected_return_date')} error={errors.expected_return_date} />
        <ChargeFields v={v} set={set} errors={errors} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ return */
function ReturnModal({ unit, canJudge, onClose, onSaved }) {
  const [returned, setReturned] = useState(today());
  const [health, setHealth] = useState('');
  const [notes, setNotes] = useState('');
  const [maint, setMaint] = useState(false);
  const [endRental, setEndRental] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await toolApi.returnUnit(unit.activeAllocationId, {
        returned_date: returned, notes: notes.trim() || undefined, health: health || undefined,
        send_to_maintenance: maint, end_rental: endRental,
      });
      onSaved();
    } catch (c) { setError(errMessage(c)); } finally { setSaving(false); }
  }
  return (
    <Modal isOpen onClose={onClose} title={`Return ${unit.serialNumber}`} description="Actual days used are counted (first and last day inclusive) and the charge / rental is booked to the Task once."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>Confirm return</Button></>}>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField label="Last day of use" type="date" value={returned} onChange={(e) => setReturned(e.target.value)} />
        {canJudge && <SelectField label="Condition on return" value={health} onChange={(e) => setHealth(e.target.value)} placeholder="Unchanged" options={HEALTH_OPTIONS} />}
        <TextAreaField className="sm:col-span-2" label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {canJudge && (
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} /> Send to maintenance instead of making it available
          </label>
        )}
        {canJudge && unit.ownershipType === 'rented' && (
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={endRental} onChange={(e) => setEndRental(e.target.checked)} /> Also end the rental and send it back to the vendor
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- history */
function HistoryModal({ unit, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { toolApi.unit(unit.id).then(setDetail).catch((e) => setError(toApiError(e))); }, [unit.id]);
  const rows = useMemo(() => detail?.history ?? [], [detail]);
  return (
    <Modal isOpen onClose={onClose} size="xl" title={`${unit.serialNumber} — history`} description={`${unit.toolName} · allocation, rental, return, maintenance and health trail`}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!detail && !error && <Skeleton className="h-32 w-full" />}
      {detail && (
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Allocations</p>
            {detail.allocations.length === 0 ? <p className="text-sm text-ink-subtle">Never allocated.</p> : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas-subtle uppercase text-ink-subtle"><tr>
                    <th className="px-3 py-2">Contractor</th><th className="px-3 py-2">Project / Site / Task</th><th className="px-3 py-2">From → To</th>
                    <th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2 text-right">Usage charge</th><th className="px-3 py-2 text-right">Rental</th><th className="px-3 py-2">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {detail.allocations.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2">{a.contractor?.name ?? '—'}</td>
                        <td className="px-3 py-2">{[a.project?.name, a.site?.name, a.task?.name, a.subtask?.name].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{a.startDate} → {a.returnedDate ?? 'in use'}</td>
                        <td className="px-3 py-2 text-right">{a.usageDays ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{a.status === 'returned' ? formatCurrency(a.usageCharge) : a.accruedUsageCharge != null ? `${formatCurrency(a.accruedUsageCharge)} (accruing)` : '—'}</td>
                        <td className="px-3 py-2 text-right">{a.rentalCostAllocated ? formatCurrency(a.rentalCostAllocated) : '—'}</td>
                        <td className="px-3 py-2"><Badge tone={a.status === 'active' ? 'brand' : 'neutral'}>{a.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {detail.rentals.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Rental</p>
              {detail.rentals.map((r) => (
                <p key={r.id} className="text-sm text-ink-muted">
                  {r.vendor?.name ?? 'Vendor'} · {formatCurrency(r.ratePerDay)}/day · {r.startDate} → {r.actualReturnDate ?? r.expectedReturnDate ?? 'open'}
                  {r.totalCost != null && ` · total ${formatCurrency(r.totalCost)} (allocated ${formatCurrency(r.allocatedCost)}, idle ${formatCurrency(r.unallocatedCost)})`}
                </p>
              ))}
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Audit trail</p>
            <ul className="space-y-1.5">
              {rows.map((h) => (
                <li key={h.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{EVENT_LABEL[h.type] ?? h.type}{h.oldValue || h.newValue ? `: ${h.oldValue ? `${h.oldValue} → ` : ''}${h.newValue ?? ''}` : ''}</span>
                    <span className="text-xs text-ink-subtle">{formatDateTime(h.at)}{h.actor ? ` · ${h.actor.name}` : ''}</span>
                  </div>
                  {(h.fromContractor || h.toContractor) && <p className="text-xs text-ink-muted">{h.fromContractor?.name ?? '—'} → {h.toContractor?.name ?? '—'}</p>}
                  {h.details && <p className="text-xs text-ink-muted">{h.details}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
