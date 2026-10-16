import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Copy, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import { procurementApi } from '../../../api/procurementApi';
import { projectsApi } from '../../../api/projectsApi';
import { tasksApi } from '../../../api/tasksApi';
import { materialsApi } from '../../../api/materialsApi';
import { toolApi } from '../../../api/toolApi';
import { vendorApi } from '../../../api/vendorApi';
import { toApiError } from '../../../api/axiosClient';
import useAuth from '../../../hooks/useAuth';
import { ROLES } from '../../../config/roles';
import { formatCurrency } from '../../../utils/format';
import { PRIORITIES } from '../../../utils/procurementOptions';

const today = () => new Date().toISOString().slice(0, 10);
let rowSeq = 0;

/** Flows a multi-item request can use, by who is raising it. */
const ADMIN_FLOWS = [
  { value: 'vendor_central', label: 'Vendor → Central Warehouse', hint: 'Buy from vendors into the company Central Warehouse.' },
  { value: 'vendor_site', label: 'Vendor → Site (direct)', hint: 'Vendors deliver straight to the project site / its contractor (or a PM-run Site Store).' },
];
const REQUESTER_FLOWS = [
  { value: 'central_contractor', label: 'From Central Warehouse', hint: 'Request several items from the company Central Warehouse.' },
  { value: 'contractor_contractor', label: 'From other contractors', hint: 'Each item can come from a different contractor.' },
  { value: 'supplier_contractor', label: 'From an outside supplier', hint: 'Buy from vendors; each item can have its own vendor.' },
];

const isVendorFlow = (flow) => ['vendor_central', 'vendor_site', 'supplier_contractor'].includes(flow);
const hasLinks = (flow) => flow !== 'vendor_central';

function newRow(defaults) {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    item_type: 'material',
    material_id: '',
    tool_id: '',
    quantity: '',
    unit: '',
    rate: '',
    transport_cost: '',
    vendor_id: defaults.vendor_id || '',
    source_contractor_id: defaults.source_contractor_id || '',
    project_id: defaults.project_id || '',
    site_id: defaults.site_id || '',
    task_id: defaults.task_id || '',
    subtask_id: defaults.subtask_id || '',
    excess_reason: '',
    tool_mode: 'to_be_purchased',
    rental_days: '',
    rental_start_date: today(),
    showLinks: false,
  };
}

function lastDay(from, days) {
  const n = Math.floor(Number(days));
  if (!from || !(n >= 1)) return '';
  const d = new Date(from);
  d.setDate(d.getDate() + n - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * One procurement request with MANY materials / machines. Each line keeps its own
 * quantity, cost, vendor or source contractor, and Project / Site / Task / Subtask;
 * header values are only defaults for new lines (and can be applied to all lines).
 * On save every line becomes an ordinary request in one batch, so approval, orders,
 * dispatch, vehicle-verified receiving and Finance all work exactly as for one item.
 */
export default function ProcurementBatchFormPage({ basePath = '/admin' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const isRequester = role === ROLES.CONTRACTOR || role === ROLES.PROJECT_MANAGER;
  const modulePath = basePath === '/admin' ? '/admin/procurement' : basePath;
  const flows = isRequester ? REQUESTER_FLOWS : ADMIN_FLOWS;

  const [flow, setFlow] = useState(flows[0].value);
  const [defaults, setDefaults] = useState({
    project_id: '', site_id: '', task_id: '', subtask_id: '', vendor_id: '', source_contractor_id: '',
  });
  const [header, setHeader] = useState({
    required_date: '', priority: 'medium', notes: '',
    vehicle_number: '', driver_name: '', driver_phone: '', challan_number: '',
  });
  const [rows, setRows] = useState(() => [newRow({})]);
  const [rowErrors, setRowErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(null);

  // Master lists
  const [projects, setProjects] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tools, setTools] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [contractors, setContractors] = useState([]);

  useEffect(() => {
    const projectsLoad = role === ROLES.PROJECT_MANAGER
      ? procurementApi.lookups().then((d) => d.projects ?? [])
      : projectsApi.list({ pageSize: 50 }).then((d) => d.projects ?? []);
    projectsLoad.then(setProjects).catch(() => setProjects([]));
    materialsApi.list({ pageSize: 100 }).then((d) => setMaterials(d.materials ?? [])).catch(() => setMaterials([]));
    toolApi.list({ pageSize: 100 }).then((d) => setTools(d.tools ?? [])).catch(() => setTools([]));
    vendorApi.list({ status: 'active', pageSize: 200 }).then((d) => setVendors(d.vendors ?? [])).catch(() => setVendors([]));
    procurementApi.lookups().then((d) => setContractors(d.contractors ?? [])).catch(() => setContractors([]));
  }, [role]);

  // Per-project / per-task lookups, loaded on demand and shared by all lines.
  const [cache, setCache] = useState({ sites: {}, tasks: {}, planMat: {}, planTool: {} });
  const inflight = useRef(new Set());
  const ensure = useCallback((bucket, key, loader) => {
    const id = `${bucket}:${key}`;
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    loader()
      .then((data) => setCache((c) => ({ ...c, [bucket]: { ...c[bucket], [key]: data } })))
      .catch(() => setCache((c) => ({ ...c, [bucket]: { ...c[bucket], [key]: [] } })));
  }, []);

  const linkSets = useMemo(() => [defaults, ...rows], [defaults, rows]);
  useEffect(() => {
    for (const r of linkSets) {
      if (r.project_id) {
        ensure('sites', r.project_id, () => projectsApi.detail(r.project_id).then((d) => d.sites ?? []));
        const tk = `${r.project_id}:${r.site_id || ''}`;
        ensure('tasks', tk, () => tasksApi.list({ projectId: r.project_id, siteId: r.site_id || undefined }).then((d) => d ?? []));
      }
      if (r.task_id && isRequester) {
        const pk = `${r.task_id}:${r.subtask_id || 'direct'}`;
        ensure('planMat', pk, () => tasksApi.getPlannedMaterials(r.task_id, r.subtask_id || 'direct').then((d) => d ?? []));
        ensure('planTool', pk, () => tasksApi.getPlannedTools(r.task_id, r.subtask_id || 'direct').then((d) => d ?? []));
      }
    }
  }, [linkSets, ensure, isRequester]);

  const sitesOf = (r) => cache.sites[r.project_id] ?? [];
  const tasksOf = (r) => cache.tasks[`${r.project_id}:${r.site_id || ''}`] ?? [];
  const subtasksOf = (r) => tasksOf(r).find((t) => String(t.id) === String(r.task_id))?.subtasks ?? [];
  const planKey = (r) => `${r.task_id}:${r.subtask_id || 'direct'}`;
  const plannedMatsOf = (r) => (r.task_id ? cache.planMat[planKey(r)] ?? [] : []);
  const plannedToolsOf = (r) => (r.task_id ? cache.planTool[planKey(r)] ?? [] : []);

  // ------------------------------------------------------------- row editing
  const updateRow = (key, patch) => {
    setRows((list) => list.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      if ('project_id' in patch) { next.site_id = ''; next.task_id = ''; next.subtask_id = ''; }
      if ('site_id' in patch) { next.task_id = ''; next.subtask_id = ''; }
      if ('task_id' in patch) next.subtask_id = '';
      if ('item_type' in patch) { next.material_id = ''; next.tool_id = ''; next.unit = ''; next.quantity = patch.item_type === 'tool' ? '1' : ''; }
      return next;
    }));
    setRowErrors((e) => {
      const copy = { ...e };
      delete copy[key];
      return copy;
    });
  };

  const setMaterial = (row, materialId) => {
    const mat = materials.find((m) => String(m.id) === String(materialId));
    const plan = plannedMatsOf(row).find((p) => String(p.materialId) === String(materialId));
    updateRow(row.key, {
      material_id: materialId,
      unit: plan?.unit || mat?.unit || '',
      rate: row.rate || String(plan?.costPerUnit || mat?.procurement_rate || mat?.default_rate || ''),
    });
  };

  const setTool = (row, toolId) => {
    const plan = plannedToolsOf(row).find((p) => String(p.toolId) === String(toolId));
    updateRow(row.key, {
      tool_id: toolId, unit: 'unit', quantity: '1',
      rental_days: String(plan?.plannedDays || row.rental_days || 1),
      rate: row.rate || (plan?.plannedRate ? String(plan.plannedRate) : ''),
    });
  };

  const addRow = () => setRows((list) => [...list, newRow(defaults)]);
  const duplicateRow = (row) => setRows((list) => {
    const i = list.findIndex((r) => r.key === row.key);
    rowSeq += 1;
    const copy = { ...row, key: `row-${rowSeq}`, material_id: '', tool_id: '' };
    return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
  });
  const removeRow = (key) => setRows((list) => (list.length > 1 ? list.filter((r) => r.key !== key) : list));

  const setDefault = (field) => (e) => {
    const value = e.target.value;
    setDefaults((d) => {
      const next = { ...d, [field]: value };
      if (field === 'project_id') { next.site_id = ''; next.task_id = ''; next.subtask_id = ''; }
      if (field === 'site_id') { next.task_id = ''; next.subtask_id = ''; }
      if (field === 'task_id') next.subtask_id = '';
      return next;
    });
  };
  // Header defaults only fill NEW lines; this pushes them onto every existing line too.
  const applyDefaultsToAll = (fields) => setRows((list) => list.map((r) => {
    const patch = {};
    for (const f of fields) patch[f] = defaults[f];
    return { ...r, ...patch };
  }));

  // ----------------------------------------------------------- row analysis
  const analyse = (r) => {
    const isTool = r.item_type === 'tool';
    const qty = Number(r.quantity || 0);
    let unplanned = false;
    let overPlan = false;
    let plannedDays = null;
    if (isRequester && r.task_id) {
      if (isTool) {
        const plan = plannedToolsOf(r).find((p) => String(p.toolId) === String(r.tool_id));
        plannedDays = plan?.plannedDays || null;
        overPlan = Boolean(plan && ((plan.remainingQuantity != null && qty > plan.remainingQuantity)
          || (plan.plannedDays && Number(r.rental_days) > plan.plannedDays)));
      } else if (r.material_id) {
        const plan = plannedMatsOf(r).find((p) => String(p.materialId) === String(r.material_id));
        unplanned = !plan;
        overPlan = Boolean(plan && qty > Number(plan.remainingPlannedQuantity ?? Infinity));
      }
    }
    const transport = Number(r.transport_cost || 0);
    const lineTotal = qty * Number(r.rate || 0) * (isTool && r.tool_mode === 'rented' ? Number(r.rental_days || 1) : 1) + transport;
    return { isTool, unplanned, overPlan, plannedDays, transport, lineTotal, needsReason: unplanned || overPlan };
  };

  const batchTotal = rows.reduce((s, r) => s + analyse(r).lineTotal, 0);
  const transportTotal = rows.reduce((s, r) => s + analyse(r).transport, 0);

  // ---------------------------------------------------------------- submit
  function validateRows() {
    const errs = {};
    rows.forEach((r) => {
      const e = {};
      const a = analyse(r);
      if (a.isTool ? !r.tool_id : !r.material_id) e.item = a.isTool ? 'Select a machine / tool.' : 'Select a material.';
      if (!(Number(r.quantity) > 0)) e.quantity = 'Enter a quantity.';
      if (r.transport_cost !== '' && !(Number(r.transport_cost) >= 0)) e.transport_cost = 'Enter a valid amount.';
      if (a.isTool && Number(r.quantity) !== 1) e.quantity = 'One machine per line (quantity 1).';
      if (hasLinks(flow) && !r.project_id) e.project_id = 'Select a project.';
      if (isRequester && !r.task_id) e.task_id = 'Select the task.';
      if (flow === 'contractor_contractor' && !r.source_contractor_id) e.source_contractor_id = 'Select the source contractor.';
      if (a.isTool && isRequester) {
        if (!(Number(r.rental_days) >= 1)) e.rental_days = 'Days needed.';
        if (!r.rental_start_date) e.rental_start_date = 'Needed from.';
      }
      if (a.isTool && !isRequester && r.tool_mode === 'rented' && !(Number(r.rental_days) >= 1)) e.rental_days = 'Rental days.';
      if (a.needsReason && !r.excess_reason.trim()) e.excess_reason = a.unplanned ? 'Not planned for this task - give a reason.' : 'More than planned - give a reason.';
      if (Object.keys(e).length) errs[r.key] = e;
    });
    return errs;
  }

  function buildItem(r) {
    const a = analyse(r);
    const isTool = a.isTool;
    const vendor = vendors.find((v) => String(v.id) === String(r.vendor_id));
    const rate = r.rate !== '' ? Number(r.rate) : null;
    const base = {
      item_type: isTool ? 'tool' : 'material',
      material_id: !isTool ? Number(r.material_id) : null,
      tool_id: isTool ? Number(r.tool_id) : null,
      quantity: Number(r.quantity),
      unit: r.unit || (isTool ? 'unit' : undefined),
      required_date: header.required_date || null,
      priority: header.priority,
      notes: header.notes.trim() || null,
      excess_reason: r.excess_reason.trim() || null,
      // Freight quoted for this item; booked once, with its receipt (or the shared vehicle).
      transport_cost: r.transport_cost !== '' && Number(r.transport_cost) > 0 ? Number(r.transport_cost) : null,
    };
    if (hasLinks(flow)) {
      Object.assign(base, {
        project_id: r.project_id ? Number(r.project_id) : null,
        site_id: r.site_id ? Number(r.site_id) : null,
        task_id: r.task_id ? Number(r.task_id) : null,
        subtask_id: r.task_id && r.subtask_id ? Number(r.subtask_id) : null,
      });
    }
    if (isTool) {
      if (isRequester) {
        Object.assign(base, {
          rental_days: Number(r.rental_days),
          rental_start_date: r.rental_start_date,
          rental_end_date: lastDay(r.rental_start_date, r.rental_days) || null,
        });
      } else {
        Object.assign(base, {
          tool_procurement_type: r.tool_mode,
          ...(r.tool_mode === 'rented'
            ? { rental_cost: rate, rental_days: Number(r.rental_days) || 1, rental_start_date: r.rental_start_date || null }
            : { estimated_rate: rate ?? 0, purchase_rate: rate }),
        });
      }
    } else if (rate != null) {
      Object.assign(base, {
        estimated_rate: rate,
        purchase_rate: rate,
        total_amount: Number((rate * Number(r.quantity)).toFixed(2)),
      });
    }
    const vendorFields = isVendorFlow(flow)
      ? { vendor_id: r.vendor_id ? Number(r.vendor_id) : null, supplier: vendor?.name || null, supplier_contact: vendor?.phone || null }
      : {};

    switch (flow) {
      case 'vendor_central':
        return {
          ...base, ...vendorFields, procurement_kind: 'central_purchase', source_type: 'supplier',
          vehicle_number: header.vehicle_number.trim() || null,
          driver_name: header.driver_name.trim() || null,
          driver_phone: header.driver_phone.trim() || null,
          challan_number: header.challan_number.trim() || null,
        };
      case 'vendor_site':
        return { ...base, ...vendorFields, procurement_kind: 'project_site' };
      case 'central_contractor':
        return { ...base, procurement_kind: 'contractor_supply', source_type: 'central_warehouse' };
      case 'contractor_contractor':
        return { ...base, procurement_kind: 'internal_transfer', source_contractor_id: Number(r.source_contractor_id) };
      default: // supplier_contractor
        return { ...base, ...vendorFields, procurement_kind: 'contractor_supply', source_type: 'supplier' };
    }
  }

  async function save(status) {
    setFormError(null);
    const errs = validateRows();
    if (flow === 'vendor_central' && status !== 'draft' && !header.vehicle_number.trim()) {
      setFormError({ message: 'Vehicle number is mandatory for a vendor delivery into the Central Warehouse.' });
      setRowErrors(errs);
      return;
    }
    setRowErrors(errs);
    if (Object.keys(errs).length) {
      setFormError({ message: 'Some items need attention - check the highlighted lines.' });
      return;
    }
    setSaving(status);
    try {
      const result = await procurementApi.createBatch({
        flow, status, notes: header.notes.trim() || null, items: rows.map(buildItem),
      });
      navigate(`${modulePath}/batch/${result.batch.id}`, { state: { flash: `${result.batch.number} created with ${result.items.length} item(s).` } });
    } catch (caught) {
      const apiError = toApiError(caught);
      // Server item errors come back as `items.<index>.<field>`.
      const mapped = {};
      Object.entries(apiError.details || {}).forEach(([k, msg]) => {
        const m = /^items\.(\d+)(?:\.(.+))?$/.exec(k);
        if (!m) return;
        const row = rows[Number(m[1])];
        if (!row) return;
        const field = m[2] || '_';
        const target = ['material_id', 'tool_id'].includes(field) ? 'item' : field;
        mapped[row.key] = { ...(mapped[row.key] || {}), [target]: msg };
      });
      setRowErrors(mapped);
      setFormError(apiError);
    } finally {
      setSaving(null);
    }
  }

  // ----------------------------------------------------------------- render
  const flowInfo = flows.find((f) => f.value === flow);
  const projectOptions = projects.map((p) => ({ value: String(p.id), label: p.code ? `${p.code} — ${p.name}` : p.name }));
  const vendorOptions = vendors.map((v) => ({ value: String(v.id), label: [v.name, v.city].filter(Boolean).join(' · ') }));
  const contractorOptions = contractors.map((c) => ({ value: String(c.id), label: c.name }));

  const itemOptions = (r) => {
    if (r.item_type === 'tool') {
      if (isRequester) {
        return plannedToolsOf(r).filter((t) => t.toolId).map((t) => ({
          value: String(t.toolId),
          label: `${t.toolName} — planned ${t.plannedQuantity}${t.plannedDays ? ` for ${t.plannedDays} day(s)` : ''}, ${t.remainingQuantity} left`,
        }));
      }
      return tools.map((t) => ({ value: String(t.id), label: `${t.name}${t.type ? ` (${t.type})` : ''}` }));
    }
    if (isRequester && r.task_id) {
      const planned = plannedMatsOf(r);
      return [
        ...planned.map((m) => ({ value: String(m.materialId), label: `⭐ ${m.materialName} — ${m.remainingPlannedQuantity} ${m.unit} left of plan` })),
        ...materials.filter((m) => !planned.some((p) => String(p.materialId) === String(m.id)))
          .map((m) => ({ value: String(m.id), label: `${m.name} (${m.unit}) — unplanned, needs Admin approval` })),
      ];
    }
    return materials.map((m) => ({ value: String(m.id), label: `${m.name} (${m.unit})` }));
  };

  const linkSummary = (r) => {
    const p = projects.find((x) => String(x.id) === String(r.project_id));
    const s = sitesOf(r).find((x) => String(x.id) === String(r.site_id));
    const t = tasksOf(r).find((x) => String(x.id) === String(r.task_id));
    const st = subtasksOf(r).find((x) => String(x.id) === String(r.subtask_id));
    return [p?.name, s?.name, t?.name, st?.name].filter(Boolean).join(' › ') || 'No project / task chosen';
  };

  return (
    <>
      <PageHeader
        title="New multi-item request"
        description="Request several materials and machines at once. Each item keeps its own quantity, cost, source and task."
        breadcrumbs={[{ label: 'Procurement', to: modulePath }, { label: 'New multi-item request' }]}
      />

      {formError && (
        <Alert tone="error" className="mb-4" title="Could not save the request">{formError.message}</Alert>
      )}

      <Card className="mb-4">
        <CardHeader title="1. What kind of request" description={flowInfo?.hint} />
        <CardBody>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Request flow">
            {flows.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={flow === f.value}
                onClick={() => setFlow(f.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${flow === f.value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink-muted hover:bg-canvas'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="2. Defaults for new items"
          description="Every new line starts with these. Each line can still be changed on its own."
        />
        <CardBody className="space-y-4">
          {hasLinks(flow) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField label="Project" value={defaults.project_id} onChange={setDefault('project_id')} placeholder="Select project" options={projectOptions} />
              <SelectField label="Site" value={defaults.site_id} onChange={setDefault('site_id')} disabled={!defaults.project_id}
                placeholder={defaults.project_id ? 'Any / select site' : 'Select project first'}
                options={sitesOf(defaults).map((s) => ({ value: String(s.id), label: s.name }))} />
              <SelectField label="Task" value={defaults.task_id} onChange={setDefault('task_id')} disabled={!defaults.project_id}
                placeholder="Select task" options={tasksOf(defaults).map((t) => ({ value: String(t.id), label: t.name }))} />
              <SelectField label="Subtask" value={defaults.subtask_id} onChange={setDefault('subtask_id')} disabled={!defaults.task_id}
                placeholder="Main task" options={subtasksOf(defaults).map((s) => ({ value: String(s.id), label: s.name }))} />
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {isVendorFlow(flow) && (
              <SelectField label="Default vendor" value={defaults.vendor_id} onChange={setDefault('vendor_id')} placeholder="Select vendor" options={vendorOptions} />
            )}
            {flow === 'contractor_contractor' && (
              <SelectField label="Default source contractor" value={defaults.source_contractor_id} onChange={setDefault('source_contractor_id')}
                placeholder="Select contractor" options={contractorOptions} />
            )}
            <InputField label="Required by" type="date" value={header.required_date} onChange={(e) => setHeader((h) => ({ ...h, required_date: e.target.value }))} />
            <SelectField label="Priority" value={header.priority} onChange={(e) => setHeader((h) => ({ ...h, priority: e.target.value }))} options={PRIORITIES} />
          </div>
          <div className="flex flex-wrap gap-2">
            {hasLinks(flow) && (
              <Button type="button" size="sm" variant="secondary" onClick={() => applyDefaultsToAll(['project_id', 'site_id', 'task_id', 'subtask_id'])}>
                Apply project / site / task to all items
              </Button>
            )}
            {isVendorFlow(flow) && (
              <Button type="button" size="sm" variant="secondary" onClick={() => applyDefaultsToAll(['vendor_id'])}>Apply vendor to all items</Button>
            )}
            {flow === 'contractor_contractor' && (
              <Button type="button" size="sm" variant="secondary" onClick={() => applyDefaultsToAll(['source_contractor_id'])}>Apply source contractor to all items</Button>
            )}
          </div>

          {flow === 'vendor_central' && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
              <p className="mb-2 text-xs font-semibold text-brand-900">Vendor vehicle (the warehouse verifies it on arrival)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <InputField label="Vehicle number" required value={header.vehicle_number} onChange={(e) => setHeader((h) => ({ ...h, vehicle_number: e.target.value }))} placeholder="MH-12-AB-1234" />
                <InputField label="Driver name" value={header.driver_name} onChange={(e) => setHeader((h) => ({ ...h, driver_name: e.target.value }))} />
                <InputField label="Driver phone" value={header.driver_phone} onChange={(e) => setHeader((h) => ({ ...h, driver_phone: e.target.value }))} />
                <InputField label="Challan no." value={header.challan_number} onChange={(e) => setHeader((h) => ({ ...h, challan_number: e.target.value }))} />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title={`3. Items (${rows.length})`}
          description={batchTotal > 0 ? `Estimated value ${formatCurrency(batchTotal)}${transportTotal > 0 ? ` (incl. ${formatCurrency(transportTotal)} transport)` : ''}` : 'Add every material and machine you need.'}
          action={<Button type="button" size="sm" onClick={addRow}><Plus className="h-4 w-4" aria-hidden="true" /> Add item</Button>}
        />
        <CardBody className="space-y-3">
          {rows.map((r, idx) => {
            const a = analyse(r);
            const err = rowErrors[r.key] || {};
            return (
              <div key={r.key} className={`rounded-xl border p-3 ${Object.keys(err).length ? 'border-danger/40 bg-danger-soft/30' : 'border-line bg-white'}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{idx + 1}</span>
                    <div className="inline-flex overflow-hidden rounded-lg border border-line text-xs">
                      {['material', 'tool'].map((t) => (
                        <button key={t} type="button" onClick={() => updateRow(r.key, { item_type: t })}
                          className={`px-2.5 py-1 font-medium ${r.item_type === t ? 'bg-brand-600 text-white' : 'bg-white text-ink-muted hover:bg-canvas'}`}>
                          {t === 'material' ? 'Material' : 'Machine / Tool'}
                        </button>
                      ))}
                    </div>
                    {a.unplanned && <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">Unplanned</span>}
                    {a.overPlan && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Over plan</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {a.lineTotal > 0 && <span className="mr-2 text-sm font-semibold tabular-nums text-ink">{formatCurrency(a.lineTotal)}</span>}
                    <button type="button" onClick={() => duplicateRow(r)} className="rounded p-1.5 text-ink-subtle hover:bg-canvas hover:text-ink" title="Duplicate line" aria-label={`Duplicate item ${idx + 1}`}>
                      <Copy className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeRow(r.key)} disabled={rows.length === 1} className="rounded p-1.5 text-ink-subtle hover:bg-canvas hover:text-red-600 disabled:opacity-40" title="Remove line" aria-label={`Remove item ${idx + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
                  <SelectField
                    className="lg:col-span-4"
                    label={a.isTool ? 'Machine / tool' : 'Material'}
                    required
                    value={a.isTool ? r.tool_id : r.material_id}
                    onChange={(e) => (a.isTool ? setTool(r, e.target.value) : setMaterial(r, e.target.value))}
                    error={err.item}
                    disabled={isRequester && !r.task_id}
                    placeholder={isRequester && !r.task_id ? 'Select the task first' : 'Select'}
                    options={itemOptions(r)}
                  />
                  <InputField className="lg:col-span-2" label={`Qty${r.unit ? ` (${r.unit})` : ''}`} required type="number" min="0" step="any"
                    value={r.quantity} onChange={(e) => updateRow(r.key, { quantity: e.target.value })} error={err.quantity} disabled={a.isTool} />
                  {(isVendorFlow(flow) || !isRequester) && (
                    <InputField className="lg:col-span-2" label={a.isTool && r.tool_mode === 'rented' ? 'Rate / day (₹)' : 'Cost / unit (₹)'} type="number" min="0" step="any"
                      value={r.rate} onChange={(e) => updateRow(r.key, { rate: e.target.value })} error={err.estimated_rate || err.purchase_rate} />
                  )}
                  <InputField className="lg:col-span-2" label="Transport (₹)" type="number" min="0" step="any"
                    value={r.transport_cost} onChange={(e) => updateRow(r.key, { transport_cost: e.target.value })} error={err.transport_cost}
                    hint="Freight for this item" />
                  {isVendorFlow(flow) && (
                    <SelectField className="lg:col-span-2" label="Vendor" value={r.vendor_id} onChange={(e) => updateRow(r.key, { vendor_id: e.target.value })}
                      placeholder="Select vendor" options={vendorOptions} error={err.vendor_id} />
                  )}
                  {flow === 'contractor_contractor' && (
                    <SelectField className="lg:col-span-2" label="Source contractor" required value={r.source_contractor_id}
                      onChange={(e) => updateRow(r.key, { source_contractor_id: e.target.value })}
                      placeholder="Select contractor" options={contractorOptions} error={err.source_contractor_id} />
                  )}
                </div>

                {a.isTool && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                    {!isRequester && (
                      <SelectField label="Obtained by" value={r.tool_mode} onChange={(e) => updateRow(r.key, { tool_mode: e.target.value })}
                        options={[{ value: 'to_be_purchased', label: 'Purchase' }, { value: 'rented', label: 'Rent' }]} />
                    )}
                    {(isRequester || r.tool_mode === 'rented') && (
                      <>
                        <InputField label={isRequester ? 'Needed for (days)' : 'Rental days'} required type="number" min="1" step="1"
                          value={r.rental_days} onChange={(e) => updateRow(r.key, { rental_days: e.target.value })} error={err.rental_days}
                          hint={a.plannedDays ? `Planned: ${a.plannedDays} day(s)` : undefined} />
                        <InputField label={isRequester ? 'Needed from' : 'Rental start'} type="date" required={isRequester}
                          value={r.rental_start_date} onChange={(e) => updateRow(r.key, { rental_start_date: e.target.value })} error={err.rental_start_date} />
                        <InputField label="Until" type="date" value={lastDay(r.rental_start_date, r.rental_days)} disabled />
                      </>
                    )}
                  </div>
                )}

                {hasLinks(flow) && (
                  <div className="mt-3 rounded-lg bg-canvas/60 p-2">
                    <button type="button" onClick={() => updateRow(r.key, { showLinks: !r.showLinks })}
                      className="flex w-full items-center justify-between gap-2 text-left text-xs text-ink-muted" aria-expanded={r.showLinks}>
                      <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden="true" /> {linkSummary(r)}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                        Change {r.showLinks ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    {(r.showLinks || err.project_id || err.task_id) && (
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <SelectField label="Project" required value={r.project_id} onChange={(e) => updateRow(r.key, { project_id: e.target.value })}
                          placeholder="Select project" options={projectOptions} error={err.project_id} />
                        <SelectField label="Site" value={r.site_id} onChange={(e) => updateRow(r.key, { site_id: e.target.value })} disabled={!r.project_id}
                          placeholder="Select site" options={sitesOf(r).map((s) => ({ value: String(s.id), label: s.name }))} error={err.site_id} />
                        <SelectField label="Task" required={isRequester} value={r.task_id} onChange={(e) => updateRow(r.key, { task_id: e.target.value })} disabled={!r.project_id}
                          placeholder="Select task" options={tasksOf(r).map((t) => ({ value: String(t.id), label: t.name }))} error={err.task_id} />
                        <SelectField label="Subtask" value={r.subtask_id} onChange={(e) => updateRow(r.key, { subtask_id: e.target.value })} disabled={!r.task_id}
                          placeholder="Main task" options={subtasksOf(r).map((s) => ({ value: String(s.id), label: s.name }))} error={err.subtask_id} />
                      </div>
                    )}
                  </div>
                )}

                {(a.needsReason || err.excess_reason) && (
                  <TextAreaField className="mt-3" label={a.unplanned ? 'Reason for unplanned item (Admin approves)' : 'Reason for more than planned (Admin approves)'}
                    required rows={2} value={r.excess_reason} onChange={(e) => updateRow(r.key, { excess_reason: e.target.value })} error={err.excess_reason} />
                )}
                {(err._ || err.destination_contractor_id || err.status) && (
                  <p className="mt-2 text-xs font-medium text-danger">{err._ || err.destination_contractor_id || err.status}</p>
                )}
              </div>
            );
          })}
          <Button type="button" variant="secondary" onClick={addRow}><Plus className="h-4 w-4" aria-hidden="true" /> Add another item</Button>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody>
          <TextAreaField label="Notes for the whole request" rows={2} value={header.notes} onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
            placeholder="Delivery instructions, context…" />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" onClick={() => save('requested')} isLoading={saving === 'requested'} loadingText="Saving…" disabled={Boolean(saving)}>
          Submit {rows.length} item{rows.length === 1 ? '' : 's'}
        </Button>
        <Button type="button" size="lg" variant="secondary" onClick={() => save('draft')} isLoading={saving === 'draft'} loadingText="Saving…" disabled={Boolean(saving)}>
          Save as draft
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={() => navigate(modulePath)} disabled={Boolean(saving)}>Cancel</Button>
      </div>
    </>
  );
}
