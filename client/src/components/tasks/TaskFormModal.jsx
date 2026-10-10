import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Package,
  Wrench,
  Users,
  DollarSign,
  Calendar,
  AlertCircle,
  Layers,
  Sparkles,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { tasksApi } from '../../api/tasksApi';
import { materialsApi } from '../../api/materialsApi';
import { toolApi } from '../../api/toolApi';
import { hrApi } from '../../api/hrApi';
import { formatCurrency } from '../../utils/format';

function calcWorkingDays(start, end) {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e) || e < s) return 1;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (cur.getDay() !== 0) count++; // exclude Sundays
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

// Machines are charged for every calendar day they are on site (start and end inclusive).
function calcMachineDays(start, end) {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e) || e < s) return 1;
  return Math.round((e - s) / 86400000) + 1;
}

function toolRowTotal(row) {
  const qty = Number(row.quantity || 0);
  const cost = Number(row.cost || 0);
  const days = row.rental_type === 'Purchase' ? 1 : Number(row.working_days || 0);
  return Number((qty * cost * days).toFixed(2));
}

const LABOUR_TYPE_OPTIONS = ['Labour', 'Company Labour'];

export default function TaskFormModal({
  isOpen,
  onClose,
  onSaved,
  projectId,
  siteId: initialSiteId,
  sites = [],
  initialData = null,
}) {
  const isEdit = Boolean(initialData?.id);

  // Form State
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('on-track');
  const [progress, setProgress] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationDays, setDurationDays] = useState(14);

  // Budget Breakdown State
  const [activeBudgetTab, setActiveBudgetTab] = useState('materials');
  const [materials, setMaterials] = useState([]);
  const [tools, setTools] = useState([]);
  const [labour, setLabour] = useState([]);
  const [misc, setMisc] = useState([]);

  // Catalogues
  const [materialsMaster, setMaterialsMaster] = useState([]);
  const [toolsMaster, setToolsMaster] = useState([]);
  const [workforceMaster, setWorkforceMaster] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load catalogues
  useEffect(() => {
    materialsApi
      .list({ pageSize: 100 })
      .then((data) => setMaterialsMaster(data.materials || []))
      .catch((err) => console.error('Failed to load materials catalogue:', err));

    toolApi
      .list({ pageSize: 100 })
      .then((data) => setToolsMaster(data.tools || []))
      .catch((err) => console.error('Failed to load tools catalogue:', err));

    hrApi.labourDirectory
      .workforceLookup()
      .then((list) => setWorkforceMaster(Array.isArray(list) ? list : (list?.workforce || list?.workers || [])))
      .catch((err) => {
        console.error('Failed to load workforce:', err);
        setWorkforceMaster([]);
      });
  }, []);

  // Initialize or reset form
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setSiteId(initialData.siteId ? String(initialData.siteId) : '');
      setDescription(initialData.description || '');
      setStatus(initialData.status || 'on-track');
      setProgress(Number(initialData.progress || 0));
      const tStart = initialData.startDate ? initialData.startDate.slice(0, 10) : '';
      const tEnd = initialData.endDate ? initialData.endDate.slice(0, 10) : '';
      setStartDate(tStart);
      setEndDate(tEnd);
      setDurationDays(Number(initialData.durationDays || 14));

      setMaterials(
        (initialData.materials || []).map((m) => ({
          material_id: m.materialId || m.material_id,
          material_name: m.materialName || m.material_name,
          unit: m.unit,
          quantity: Number(m.quantity || 0),
          cost_per_unit: Number(m.costPerUnit || m.cost_per_unit || 0),
          total_cost: Number(m.totalCost || m.total_cost || 0),
        }))
      );

      setTools(
        (initialData.tools || []).map((t) => ({
          tool_id: t.toolId || t.tool_id || null,
          tool_name: t.toolName || t.tool_name || '',
          rental_type: t.rentalType || t.rental_type || 'Rent',
          quantity: Number(t.quantity || 1),
          cost: Number(t.cost || 0),
          start_date: (t.startDate || t.start_date || '').slice(0, 10) || tStart,
          end_date: (t.endDate || t.end_date || '').slice(0, 10) || tEnd,
          working_days: Number(t.workingDays || t.working_days || 1),
          total_cost: Number(t.totalCost || t.total_cost || 0),
        }))
      );

      setLabour(
        (initialData.labour || []).map((l) => {
          const lStart = l.start_date || l.startDate ? (l.start_date || l.startDate).slice(0, 10) : tStart;
          const lEnd = l.end_date || l.endDate ? (l.end_date || l.endDate).slice(0, 10) : tEnd;
          const days = Number(l.workingDays || l.working_days || calcWorkingDays(lStart, lEnd));
          const isCompany = (l.labourType || l.labour_type || l.worker_type || '').toLowerCase().includes('company');
          const wage = isCompany ? 0 : Number(l.dailyWage ?? l.daily_wage ?? 0);
          return {
            worker_id: l.worker_id || l.workerId || null,
            worker_type: l.worker_type || l.workerType || (isCompany ? 'company_labour' : 'labour'),
            labour_name: l.person_name || l.labourName || l.labour_name || '',
            labour_type: isCompany ? 'Company Labour' : 'Labour',
            skill_trade: l.person_trade || l.skill_trade || l.skillTrade || '',
            start_date: lStart,
            end_date: lEnd,
            worker_count: 1,
            daily_wage: wage,
            working_days: days,
            total_cost: isCompany ? 0 : Number(l.totalCost || l.total_cost || wage * days),
            remarks: l.remarks || '',
          };
        })
      );

      setMisc(
        (initialData.misc || []).map((mc) => ({
          description: mc.description || '',
          amount: Number(mc.amount || 0),
        }))
      );
    } else {
      // New Task defaults
      setName('');
      setSiteId(initialSiteId ? String(initialSiteId) : sites[0]?.id ? String(sites[0].id) : '');
      setDescription('');
      setStatus('on-track');
      setProgress(0);
      const today = new Date().toISOString().slice(0, 10);
      setStartDate(today);
      const future = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      setEndDate(future);
      setDurationDays(14);
      setMaterials([]);
      setTools([]);
      setLabour([]);
      setMisc([]);
    }
    setError(null);
  }, [initialData, initialSiteId, sites, isOpen]);

  // Recalculate duration when dates change
  const handleStartDateChange = (val) => {
    setStartDate(val);
    if (val && endDate) {
      const diff = Math.round((new Date(endDate) - new Date(val)) / (1000 * 60 * 60 * 24));
      if (diff > 0) setDurationDays(diff);
    }
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    if (startDate && val) {
      const diff = Math.round((new Date(val) - new Date(startDate)) / (1000 * 60 * 60 * 24));
      if (diff > 0) setDurationDays(diff);
    }
  };

  // Materials Helpers
  const addMaterialRow = () => {
    const first = materialsMaster[0];
    setMaterials((prev) => [
      ...prev,
      {
        material_id: first ? first.id : '',
        material_name: first ? first.name : '',
        unit: first ? first.unit : 'unit',
        quantity: '',
        cost_per_unit: '',
        total_cost: 0,
      },
    ]);
  };

  const updateMaterialRow = (idx, field, value) => {
    setMaterials((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };

      if (field === 'material_id') {
        const found = materialsMaster.find((m) => String(m.id) === String(value));
        if (found) {
          row.material_name = found.name;
          row.unit = found.unit;
          row.cost_per_unit = Number(found.procurement_rate) > 0 ? Number(found.procurement_rate) : '';
        }
      }

      const qty = Number(row.quantity || 0);
      const rate = Number(row.cost_per_unit || 0);
      row.total_cost = Number((qty * rate).toFixed(2));
      updated[idx] = row;
      return updated;
    });
  };

  const removeMaterialRow = (idx) => {
    setMaterials((prev) => prev.filter((_, i) => i !== idx));
  };

  // Tools Helpers
  const addToolRow = () => {
    const sDate = startDate || new Date().toISOString().slice(0, 10);
    const eDate = endDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    setTools((prev) => [
      ...prev,
      {
        tool_id: null,
        tool_name: '',
        rental_type: 'Rent',
        quantity: 1,
        cost: 0,
        start_date: sDate,
        end_date: eDate,
        working_days: calcMachineDays(sDate, eDate),
        total_cost: 0,
      },
    ]);
  };

  const updateToolRow = (idx, field, value) => {
    setTools((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };
      if (field === 'start_date' || field === 'end_date') {
        row.working_days = calcMachineDays(row.start_date, row.end_date);
      }
      row.total_cost = toolRowTotal(row);
      updated[idx] = row;
      return updated;
    });
  };

  const removeToolRow = (idx) => {
    setTools((prev) => prev.filter((_, i) => i !== idx));
  };

  // Labour Helpers
  const addLabourRow = () => {
    const sDate = startDate || new Date().toISOString().slice(0, 10);
    const eDate = endDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const days = calcWorkingDays(sDate, eDate);
    setLabour((prev) => [
      ...prev,
      {
        worker_id: null,
        worker_type: 'labour',
        labour_name: '',
        labour_type: 'Labour',
        skill_trade: '',
        start_date: sDate,
        end_date: eDate,
        working_days: days,
        daily_wage: 750,
        worker_count: 1,
        total_cost: 750 * days,
        remarks: '',
      },
    ]);
  };

  const updateLabourRow = (idx, field, value) => {
    setLabour((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };

      if (field === 'worker_selection') {
        const found = (workforceMaster || []).find((w) => String(w.id) === String(value));
        if (found) {
          row.worker_id = found.id;
          row.worker_type = found.workerType;
          row.labour_name = found.name;
          row.skill_trade = found.trade || '';
          const isComp = found.workerType === 'company_labour' || found.workerType === 'company_employee' || found.isCompanyLabour;
          row.labour_type = isComp ? 'Company Labour' : 'Labour';
          row.daily_wage = isComp ? 0 : Number(found.wage || 750);
        } else {
          row.worker_id = null;
          row.labour_name = '';
        }
      }

      if (field === 'labour_type') {
        if (value === 'Company Labour' || value === 'Company Employee') {
          row.daily_wage = 0;
          row.worker_type = 'company_labour';
        }
      }

      const wc = Number(row.worker_count || 1);
      const days = Number(row.working_days || 0);
      const isComp = row.labour_type === 'Company Labour' || row.worker_type === 'company_labour';
      const wage = isComp ? 0 : Number(row.daily_wage || 0);
      row.total_cost = Number((wc * days * wage).toFixed(2));

      updated[idx] = row;
      return updated;
    });
  };

  const removeLabourRow = (idx) => {
    setLabour((prev) => prev.filter((_, i) => i !== idx));
  };

  // Misc Helpers
  const addMiscRow = () => {
    setMisc((prev) => [
      ...prev,
      {
        description: '',
        amount: 0,
      },
    ]);
  };

  const updateMiscRow = (idx, field, value) => {
    setMisc((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const removeMiscRow = (idx) => {
    setMisc((prev) => prev.filter((_, i) => i !== idx));
  };

  // Auto-calculated Category Totals
  const totalMaterialCost = useMemo(() => materials.reduce((s, m) => s + Number(m.total_cost || 0), 0), [materials]);
  const totalToolCost = useMemo(() => tools.reduce((s, t) => s + Number(t.total_cost || 0), 0), [tools]);
  const totalLabourCost = useMemo(() => labour.reduce((s, l) => s + Number(l.total_cost || 0), 0), [labour]);
  const totalMiscCost = useMemo(() => misc.reduce((s, mc) => s + Number(mc.amount || 0), 0), [misc]);
  const grandTotalBudget = totalMaterialCost + totalToolCost + totalLabourCost + totalMiscCost;

  // Handle Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(new Error('Task name is required.'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      project_id: Number(projectId),
      site_id: siteId ? Number(siteId) : null,
      name: name.trim(),
      description: description.trim() || null,
      status,
      progress: Number(progress || 0),
      start_date: startDate || null,
      end_date: endDate || null,
      duration_days: Number(durationDays || 0),
      materials: materials.map((m) => ({
        material_id: m.material_id,
        quantity: Number(m.quantity || 0),
        cost_per_unit: Number(m.cost_per_unit || 0),
        total_cost: Number(m.total_cost || 0),
      })),
      tools: tools.map((t) => ({
        tool_id: t.tool_id || null,
        tool_name: t.tool_name.trim(),
        rental_type: t.rental_type,
        quantity: Number(t.quantity || 1),
        cost: Number(t.cost || 0),
        start_date: t.rental_type === 'Purchase' ? null : t.start_date || null,
        end_date: t.rental_type === 'Purchase' ? null : t.end_date || null,
        working_days: t.rental_type === 'Purchase' ? 1 : Number(t.working_days || 1),
        total_cost: toolRowTotal(t),
      })),
      labour: labour.map((l) => ({
        labour_name: (l.labour_name || '').trim() || null,
        worker_id: l.worker_id || null,
        worker_type: l.worker_type || 'labour',
        labour_type: (l.labour_type || 'Labour').trim(),
        skill_trade: (l.skill_trade || '').trim() || null,
        start_date: l.start_date || null,
        end_date: l.end_date || null,
        worker_count: Number(l.worker_count || 1),
        daily_wage: Number(l.daily_wage || 0),
        working_days: Number(l.working_days || 0),
        total_cost: Number(l.total_cost || 0),
        remarks: (l.remarks || '').trim() || null,
      })),
      misc: misc.map((mc) => ({
        description: mc.description.trim(),
        amount: Number(mc.amount || 0),
      })),
    };

    try {
      if (isEdit) {
        await tasksApi.update(initialData.id, payload);
      } else {
        await tasksApi.create(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Task: ${initialData?.name}` : 'Add Manual Task & Budget Planning'}
      description="Create a task with detailed budget breakdown across Materials, Tools, Labour, and Misc."
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <Alert tone="error" title="Could not save task">
            {error.response?.data?.error?.message || error.message}
          </Alert>
        )}

        {/* 1. Basic Task Metadata */}
        <div className="rounded-xl border border-line bg-canvas/40 p-4 space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Task Information
          </h4>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Task Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Foundation Work, Brick Work, Electrical"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Assigned Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-hidden"
              >
                <option value="">Project-Wide / General Site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-hidden"
              >
                <option value="on-track">On Track</option>
                <option value="attention">Needs Attention</option>
                <option value="delayed">Delayed</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Expected Completion</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Duration (Days)</label>
              <input
                type="number"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Task Scope &amp; Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of works, specifications, or quality standards…"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* 2. Budget Breakdown Tabs */}
        <div>
          <div className="flex items-center justify-between border-b border-line mb-3">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveBudgetTab('materials')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeBudgetTab === 'materials'
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                Materials ({materials.length}) · {formatCurrency(totalMaterialCost)}
              </button>

              <button
                type="button"
                onClick={() => setActiveBudgetTab('tools')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeBudgetTab === 'tools'
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Wrench className="h-3.5 w-3.5" />
                Machines &amp; Tools ({tools.length}) · {formatCurrency(totalToolCost)}
              </button>

              <button
                type="button"
                onClick={() => setActiveBudgetTab('labour')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeBudgetTab === 'labour'
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Labour ({labour.length}) · {formatCurrency(totalLabourCost)}
              </button>

              <button
                type="button"
                onClick={() => setActiveBudgetTab('misc')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeBudgetTab === 'misc'
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Miscellaneous ({misc.length}) · {formatCurrency(totalMiscCost)}
              </button>
            </div>
          </div>

          {/* TAB A: Materials */}
          {activeBudgetTab === 'materials' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">Specify material requirements for this task</span>
                <Button type="button" size="sm" variant="secondary" onClick={addMaterialRow}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Material
                </Button>
              </div>

              {materials.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-subtle">
                  No materials budgeted for this task yet. Click &ldquo;Add Material&rdquo; above.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {materials.map((m, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2 text-xs">
                      <div className="flex-1 min-w-[140px]">
                        <select
                          value={m.material_id}
                          onChange={(e) => updateMaterialRow(idx, 'material_id', e.target.value)}
                          className="w-full rounded border border-line bg-white px-2 py-1 text-xs"
                        >
                          <option value="">Select Material</option>
                          {materialsMaster.map((mat) => (
                            <option key={mat.id} value={mat.id}>
                              {mat.name} ({mat.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={m.quantity}
                          onChange={(e) => updateMaterialRow(idx, 'quantity', e.target.value)}
                          placeholder="Qty"
                          className="w-full rounded border border-line px-2 py-1 text-xs text-right"
                        />
                      </div>
                      <span className="w-12 text-ink-subtle truncate">{m.unit || 'unit'}</span>

                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={m.cost_per_unit}
                          onChange={(e) => updateMaterialRow(idx, 'cost_per_unit', e.target.value)}
                          placeholder="Cost/Unit"
                          className="w-full rounded border border-line px-2 py-1 text-xs text-right"
                        />
                      </div>

                      <div className="w-24 font-semibold text-ink text-right tabular-nums">
                        {formatCurrency(m.total_cost)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeMaterialRow(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Remove material"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB B: Tools */}
          {activeBudgetTab === 'tools' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">Rent: Qty × Rate/Day × Days. Purchase: Qty × Cost.</span>
                <Button type="button" size="sm" variant="secondary" onClick={addToolRow}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Tool / Machine
                </Button>
              </div>

              {tools.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-subtle">
                  No machinery or tools budgeted yet. Click &ldquo;Add Tool / Machine&rdquo; above.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {tools.map((t, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2 text-xs">
                      <div className="flex-1 min-w-[140px]">
                        <input
                          type="text"
                          value={t.tool_name}
                          onChange={(e) => updateToolRow(idx, 'tool_name', e.target.value)}
                          placeholder="Tool/Machine Name (e.g. Concrete Mixer)"
                          className="w-full rounded border border-line px-2 py-1 text-xs"
                        />
                      </div>

                      <div className="w-24">
                        <select
                          value={t.rental_type}
                          onChange={(e) => updateToolRow(idx, 'rental_type', e.target.value)}
                          className="w-full rounded border border-line bg-white px-2 py-1 text-xs"
                        >
                          <option value="Rent">Rent</option>
                          <option value="Purchase">Purchase</option>
                        </select>
                      </div>

                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          value={t.quantity}
                          onChange={(e) => updateToolRow(idx, 'quantity', e.target.value)}
                          placeholder="Qty"
                          className="w-full rounded border border-line px-2 py-1 text-xs text-right"
                        />
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={t.cost}
                          onChange={(e) => updateToolRow(idx, 'cost', e.target.value)}
                          placeholder={t.rental_type === 'Purchase' ? 'Cost' : 'Rate/Day'}
                          title={t.rental_type === 'Purchase' ? 'Purchase cost per unit' : 'Rent per day per unit'}
                          className="w-full rounded border border-line px-2 py-1 text-xs text-right"
                        />
                      </div>

                      {t.rental_type !== 'Purchase' && (
                        <>
                          <input
                            type="date"
                            value={t.start_date || ''}
                            onChange={(e) => updateToolRow(idx, 'start_date', e.target.value)}
                            title="On site from"
                            className="w-32 rounded border border-line px-2 py-1 text-xs"
                          />
                          <input
                            type="date"
                            value={t.end_date || ''}
                            min={t.start_date || undefined}
                            onChange={(e) => updateToolRow(idx, 'end_date', e.target.value)}
                            title="On site until"
                            className="w-32 rounded border border-line px-2 py-1 text-xs"
                          />
                          <div className="w-16">
                            <input
                              type="number"
                              min="1"
                              value={t.working_days}
                              onChange={(e) => updateToolRow(idx, 'working_days', e.target.value)}
                              title="Days"
                              placeholder="Days"
                              className="w-full rounded border border-line px-2 py-1 text-xs text-right"
                            />
                          </div>
                        </>
                      )}

                      <div className="w-24 font-semibold text-ink text-right tabular-nums">
                        {formatCurrency(t.total_cost)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeToolRow(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Remove tool"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB C: Labour */}
          {activeBudgetTab === 'labour' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-ink">Assigned Labour & Workforce Planning</span>
                  <p className="text-[11px] text-ink-muted">
                    Select labour/employees from directory, set dates to auto-calculate working days and budget
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addLabourRow}>
                  <Plus className="h-3.5 w-3.5" />
                  + Add Labour
                </Button>
              </div>

              {labour.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-subtle">
                  No labour assigned to this task yet. Click &ldquo;+ Add Labour&rdquo; above to assign workers from the directory.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-line bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-canvas-subtle text-ink-subtle font-semibold uppercase text-[11px]">
                      <tr>
                        <th className="p-2 min-w-[200px]">Select Labour / Person</th>
                        <th className="p-2 w-36">Labour Type</th>
                        <th className="p-2 w-32">Expected Start</th>
                        <th className="p-2 w-32">Expected End</th>
                        <th className="p-2 w-20 text-center">Days</th>
                        <th className="p-2 w-24 text-right">Rate / Day (₹)</th>
                        <th className="p-2 w-28 text-right">Total (₹)</th>
                        <th className="p-2 min-w-[140px]">Remarks</th>
                        <th className="p-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {labour.map((l, idx) => {
                        const compoundValue = l.worker_id ? String(l.worker_id) : '';
                        const isCompany = l.labour_type === 'Company Labour' || l.labour_type === 'Company Employee' || l.worker_type === 'company_labour';
                        return (
                          <tr key={idx} className="hover:bg-canvas-subtle/40 transition-colors">
                            <td className="p-2">
                              <select
                                value={compoundValue}
                                onChange={(e) => updateLabourRow(idx, 'worker_selection', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                              >
                                <option value="">-- Choose Labour --</option>
                                {(Array.isArray(workforceMaster) ? workforceMaster : []).map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.trade}) — {w.workerType === 'company_labour' || w.workerType === 'company_employee' || w.isCompanyLabour ? 'Company Labour (In-House)' : (w.contractorName || 'Daily Wage')}
                                  </option>
                                ))}
                              </select>
                              {l.skill_trade && (
                                <span className="text-[10px] text-ink-subtle mt-0.5 block">
                                  Trade: <strong className="text-ink-muted">{l.skill_trade}</strong>
                                </span>
                              )}
                            </td>

                            <td className="p-2">
                              <select
                                value={l.labour_type}
                                onChange={(e) => updateLabourRow(idx, 'labour_type', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                              >
                                {LABOUR_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2">
                              <input
                                type="date"
                                value={l.start_date || ''}
                                onChange={(e) => updateLabourRow(idx, 'start_date', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="date"
                                value={l.end_date || ''}
                                onChange={(e) => updateLabourRow(idx, 'end_date', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2 text-center">
                              <span className="inline-flex items-center justify-center rounded bg-brand-50 border border-brand-200 px-2 py-0.5 text-xs font-bold text-brand-700">
                                {l.working_days || 0} d
                              </span>
                            </td>

                            <td className="p-2">
                              {isCompany ? (
                                <span className="block text-center text-xs text-blue-700 font-semibold font-mono">₹0</span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={l.daily_wage}
                                  onChange={(e) => updateLabourRow(idx, 'daily_wage', e.target.value)}
                                  placeholder="800"
                                  className="w-full rounded border border-line px-2 py-1 text-xs text-right text-ink focus:border-brand-500"
                                />
                              )}
                            </td>

                            <td className="p-2 text-right font-semibold text-ink tabular-nums">
                              {isCompany ? <span className="text-blue-700 font-semibold font-mono">₹0</span> : formatCurrency(l.total_cost)}
                            </td>

                            <td className="p-2">
                              <input
                                type="text"
                                value={l.remarks || ''}
                                onChange={(e) => updateLabourRow(idx, 'remarks', e.target.value)}
                                placeholder="Assignment notes..."
                                className="w-full rounded border border-line px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeLabourRow(idx)}
                                className="text-red-500 hover:text-red-700 p-1"
                                title="Remove labour"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB D: Misc */}
          {activeBudgetTab === 'misc' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">Miscellaneous and overhead expenses</span>
                <Button type="button" size="sm" variant="secondary" onClick={addMiscRow}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Misc Expense
                </Button>
              </div>

              {misc.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-subtle">
                  No miscellaneous items budgeted yet. Click &ldquo;Add Misc Expense&rdquo; above.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {misc.map((mc, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2 text-xs">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={mc.description}
                          onChange={(e) => updateMiscRow(idx, 'description', e.target.value)}
                          placeholder="Description (e.g. Safety barricades, permits, cleaning)"
                          className="w-full rounded border border-line px-2 py-1 text-xs"
                        />
                      </div>

                      <div className="w-32">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={mc.amount}
                          onChange={(e) => updateMiscRow(idx, 'amount', e.target.value)}
                          placeholder="Amount"
                          className="w-full rounded border border-line px-2 py-1 text-xs text-right"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeMiscRow(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Remove misc"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Automatic Budget Rollup Summary */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-brand-900 uppercase tracking-wide">
                Task Total Calculated Budget
              </p>
              <p className="text-[11px] text-brand-700 mt-0.5">
                Materials ({formatCurrency(totalMaterialCost)}) + Tools ({formatCurrency(totalToolCost)}) + Labour (
                {formatCurrency(totalLabourCost)}) + Misc ({formatCurrency(totalMiscCost)})
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-brand-900 tabular-nums">
                {formatCurrency(grandTotalBudget)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} loadingText="Saving Task…">
            {isEdit ? 'Save Task Changes' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
