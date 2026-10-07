import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, TextAreaField, SelectField } from '../ui/Field';
import { projectsApi } from '../../api/projectsApi';
import { contractorPoApi } from '../../api/contractorPoApi';
import { formatCurrency, formatNumber } from '../../utils/format';

const DEFAULT_TERMS = [
  '1. All materials supplied must conform to approved brand specifications, test certifications, and site delivery schedules.',
  '2. Workmanship must strictly comply with approved engineering drawings, structural quality benchmarks, and national building codes.',
  '3. Milestone payments will be released upon verified site engineer inspection and certified measurement book (MB) billing.',
  '4. Delays attributable to the contractor without prior written extension may attract a liquidated penalty of 0.5% per week up to 5% of PO value.',
  '5. Worker safety, mandatory PPE compliance, statutory minimum wages, PF, and ESIC are the sole legal responsibility of the contractor.',
  '6. Contractor shall ensure custody, safety, and proper weatherproof storage of all tools, machinery, and materials deployed at site.',
  '7. A defect liability period of 12 months shall apply from the official date of project/site handover inspection.',
];

export default function CreatePOModal({
  contractor,
  poToEdit = null,
  initialProjectId,
  initialSiteId,
  isOpen,
  onClose,
  onSaved,
}) {
  if (!isOpen) return null;

  const isEdit = Boolean(poToEdit);
  const contractorId = contractor?.id || poToEdit?.contractorId || poToEdit?.contractor_id;

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const initialDateStr = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const parseTerms = (raw) => {
    if (!raw) return DEFAULT_TERMS;
    if (Array.isArray(raw)) return raw;
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    } catch {}
    return DEFAULT_TERMS;
  };

  const [values, setValues] = useState({
    project_id: poToEdit
      ? String(poToEdit.project_id || poToEdit.projectId || '')
      : initialProjectId
        ? String(initialProjectId)
        : '',
    site_id: poToEdit
      ? String(poToEdit.site_id || poToEdit.siteId || '')
      : initialSiteId
        ? String(initialSiteId)
        : '',
    po_date: poToEdit
      ? initialDateStr(poToEdit.po_date || poToEdit.poDate) || new Date().toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    validity_date: poToEdit ? initialDateStr(poToEdit.validity_date || poToEdit.validityDate) : '',
    work_description: poToEdit ? (poToEdit.work_description || poToEdit.workDescription || '') : '',
    total_amount: poToEdit ? String(poToEdit.total_amount ?? poToEdit.totalAmount ?? '') : '',
    advance_amount: poToEdit ? String(poToEdit.advance_amount ?? poToEdit.advanceAmount ?? '0') : '0',
    material_amount: poToEdit ? String(poToEdit.material_amount ?? poToEdit.materialAmount ?? '') : '',
    labour_amount: poToEdit ? String(poToEdit.labour_amount ?? poToEdit.labourAmount ?? '') : '',
    payment_terms: poToEdit
      ? (poToEdit.payment_terms || poToEdit.paymentTerms || '')
      : 'Milestone linked against verified measurement book (MB) bills',
  });

  const [milestones, setMilestones] = useState(() => {
    if (poToEdit && Array.isArray(poToEdit.milestones) && poToEdit.milestones.length > 0) {
      return poToEdit.milestones.map((m) => ({
        milestone_name: m.milestone_name || m.milestoneName || '',
        percentage: Number(m.percentage || 0),
        amount: Number(m.amount || 0),
        condition_trigger: m.condition_trigger || m.conditionTrigger || '',
      }));
    }
    return [
      { milestone_name: '10% Material Delivery & Mobilization', percentage: 10, amount: 0, condition_trigger: 'On delivery of approved materials to site' },
      { milestone_name: 'Foundation & Substructure Casting', percentage: 25, amount: 0, condition_trigger: 'Completion of plinth beam and curing' },
      { milestone_name: 'Superstructure Framework', percentage: 35, amount: 0, condition_trigger: 'Casting of roof slab and external masonry' },
      { milestone_name: 'Finishing & Handover', percentage: 30, amount: 0, condition_trigger: 'Final inspection clearance & site cleanup' },
    ];
  });

  const [terms, setTerms] = useState(() => parseTerms(poToEdit?.terms_conditions || poToEdit?.termsConditions));
  const [newTermInput, setNewTermInput] = useState('');

  // Load projects list
  useEffect(() => {
    setIsLoadingProjects(true);
    projectsApi.list({ pageSize: 100 })
      .then((data) => setProjects(data.projects ?? []))
      .catch((err) => console.error('Failed to load projects:', err))
      .finally(() => setIsLoadingProjects(false));
  }, []);

  // Load sites when project selected
  useEffect(() => {
    if (!values.project_id) {
      setSites([]);
      return;
    }
    setIsLoadingSites(true);
    projectsApi.detail(values.project_id)
      .then((data) => setSites(data.sites ?? []))
      .catch((err) => console.error('Failed to load sites:', err))
      .finally(() => setIsLoadingSites(false));
  }, [values.project_id]);

  // Recalculate milestone amounts when total_amount changes
  useEffect(() => {
    const total = parseFloat(values.total_amount) || 0;
    if (total > 0) {
      setMilestones((prev) =>
        prev.map((m) => ({
          ...m,
          amount: Math.round(((parseFloat(m.percentage) || 0) / 100) * total * 100) / 100,
        }))
      );
    }
  }, [values.total_amount]);

  const setVal = (field) => (e) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
  };

  function handleMilestonePercentageChange(index, pctVal) {
    const pct = parseFloat(pctVal) || 0;
    const total = parseFloat(values.total_amount) || 0;
    const amt = Math.round((pct / 100) * total * 100) / 100;

    setMilestones((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], percentage: pct, amount: amt };
      return copy;
    });
  }

  function handleMilestoneFieldChange(index, field, val) {
    setMilestones((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  }

  function addMilestone() {
    setMilestones((prev) => [
      ...prev,
      { milestone_name: `Milestone ${prev.length + 1}`, percentage: 0, amount: 0, condition_trigger: 'On milestone sign-off' },
    ]);
  }

  function removeMilestone(index) {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }

  function addTerm() {
    if (!newTermInput.trim()) return;
    setTerms((prev) => [...prev, `${prev.length + 1}. ${newTermInput.trim()}`]);
    setNewTermInput('');
  }

  function removeTerm(index) {
    setTerms((prev) => prev.filter((_, i) => i !== index));
  }

  const totalPercentage = milestones.reduce((sum, m) => sum + (parseFloat(m.percentage) || 0), 0);
  const totalMilestoneAmount = milestones.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    if (!values.project_id) {
      setFormError('Please select a project.');
      return;
    }

    const total = parseFloat(values.total_amount);
    if (!total || total <= 0) {
      setFormError('Please enter a valid total PO amount greater than 0.');
      return;
    }

    if (milestones.length === 0) {
      setFormError('Please add at least one milestone.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        contractor_id: contractorId,
        project_id: Number(values.project_id),
        site_id: values.site_id ? Number(values.site_id) : null,
        po_date: values.po_date,
        validity_date: values.validity_date || null,
        work_description: values.work_description.trim() || null,
        total_amount: total,
        advance_amount: parseFloat(values.advance_amount) || 0,
        material_amount: parseFloat(values.material_amount) || 0,
        labour_amount: parseFloat(values.labour_amount) || 0,
        payment_terms: values.payment_terms.trim() || null,
        terms_conditions: terms,
        milestones: milestones.map((m, idx) => ({
          milestone_name: m.milestone_name.trim(),
          percentage: parseFloat(m.percentage) || 0,
          amount: parseFloat(m.amount) || 0,
          condition_trigger: m.condition_trigger?.trim() || null,
          sort_order: idx + 1,
        })),
      };

      let resultPo;
      if (isEdit) {
        resultPo = await contractorPoApi.update(poToEdit.id, payload);
      } else {
        resultPo = await contractorPoApi.create(contractorId, payload);
      }
      if (typeof onSaved === 'function') onSaved(resultPo);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to save Purchase Order.';
      setFormError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  const projectOptions = projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }));
  const siteOptions = sites.map((s) => ({ value: String(s.id), label: s.name }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-4xl flex-col max-h-[92vh] rounded-2xl bg-white shadow-2xl border border-line overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-canvas px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand-700" />
              {isEdit ? `Edit Purchase Order (${poToEdit.po_number || poToEdit.poNumber})` : 'Create Contractor Purchase / Work Order'}
            </h2>
            <p className="text-xs text-ink-subtle mt-0.5">
              {isEdit
                ? `Update order specifications, rates, and milestone budget for ${contractor?.name || 'contractor'}.`
                : `Generate work order for ${contractor?.name || 'contractor'} linked to project assignment, milestone budget, and terms.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-white hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {formError && <Alert tone="error">{formError}</Alert>}

            {/* SECTION 1: Contractor & Project Binding */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-line/60 pb-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">1</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Project / Site Binding & Timeline</h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">Contractor</label>
                  <div className="rounded-xl border border-line bg-canvas/50 px-3.5 py-2.5 text-sm font-semibold text-ink">
                    {contractor.name}
                    {contractor.phone && <span className="ml-2 font-normal text-xs text-ink-subtle">({contractor.phone})</span>}
                  </div>
                </div>

                <SelectField
                  label="Assigned Project *"
                  required
                  value={values.project_id}
                  onChange={setVal('project_id')}
                  placeholder={isLoadingProjects ? 'Loading projects…' : 'Select Project'}
                  options={projectOptions}
                />

                <SelectField
                  label="Specific Site (Optional)"
                  value={values.site_id}
                  onChange={setVal('site_id')}
                  placeholder={!values.project_id ? 'Select project first' : isLoadingSites ? 'Loading sites…' : 'All Sites / Whole Project'}
                  options={siteOptions}
                  disabled={!values.project_id || isLoadingSites}
                />

                <div className="grid grid-cols-2 gap-2">
                  <InputField
                    label="PO Date *"
                    type="date"
                    required
                    value={values.po_date}
                    onChange={setVal('po_date')}
                  />
                  <InputField
                    label="Validity / Target Date"
                    type="date"
                    value={values.validity_date}
                    onChange={setVal('validity_date')}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: Work Scope & Financial Amounts */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-line/60 pb-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">2</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Work Description & Financial Values</h3>
              </div>

              <div className="space-y-4">
                <TextAreaField
                  label="Work Description / Scope of Work *"
                  rows={2}
                  required
                  placeholder="Describe civil, structural, finishing, or labour work packages covered under this order..."
                  value={values.work_description}
                  onChange={setVal('work_description')}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <InputField
                    label="Total PO Amount (₹) *"
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 1000000"
                    value={values.total_amount}
                    onChange={setVal('total_amount')}
                  />
                  <InputField
                    label="Advance Amount (₹)"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={values.advance_amount}
                    onChange={setVal('advance_amount')}
                  />
                  <InputField
                    label="Material Component (₹)"
                    type="number"
                    step="0.01"
                    placeholder="Optional"
                    value={values.material_amount}
                    onChange={setVal('material_amount')}
                  />
                  <InputField
                    label="Labour Component (₹)"
                    type="number"
                    step="0.01"
                    placeholder="Optional"
                    value={values.labour_amount}
                    onChange={setVal('labour_amount')}
                  />
                </div>

                <InputField
                  label="Payment Terms / Instructions"
                  placeholder="e.g. 10% advance upon mobilization; balance against certified RA milestone bills"
                  value={values.payment_terms}
                  onChange={setVal('payment_terms')}
                />
              </div>
            </div>

            {/* SECTION 3: Dynamic Milestones */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-line/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">3</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Payment & Work Milestones</h3>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={`font-semibold ${totalPercentage === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    Total: {totalPercentage.toFixed(1)}% / 100%
                  </span>
                  <span className="text-ink-subtle">
                    Amount: {formatCurrency(totalMilestoneAmount)}
                  </span>
                  <Button type="button" variant="secondary" size="sm" onClick={addMilestone} className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Add Milestone
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {milestones.map((m, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-line bg-canvas/30 p-3">
                    <div className="flex-1 w-full">
                      <input
                        type="text"
                        placeholder="Milestone Name"
                        value={m.milestone_name}
                        onChange={(e) => handleMilestoneFieldChange(idx, 'milestone_name', e.target.value)}
                        className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <input
                        type="text"
                        placeholder="Trigger Condition (e.g. 10% material delivered)"
                        value={m.condition_trigger || ''}
                        onChange={(e) => handleMilestoneFieldChange(idx, 'condition_trigger', e.target.value)}
                        className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="w-24">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="%"
                          value={m.percentage}
                          onChange={(e) => handleMilestonePercentageChange(idx, e.target.value)}
                          className="w-full rounded-lg border border-line bg-white pl-2 pr-6 py-1.5 text-xs font-mono text-ink focus:border-brand-500 focus:outline-none"
                        />
                        <span className="absolute right-2 top-1.5 text-xs text-ink-subtle">%</span>
                      </div>
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={m.amount}
                        onChange={(e) => handleMilestoneFieldChange(idx, 'amount', e.target.value)}
                        className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs font-mono text-ink focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    {milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMilestone(idx)}
                        className="rounded-lg p-1.5 text-ink-subtle hover:bg-red-50 hover:text-red-600"
                        title="Remove milestone"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 4: Terms & Conditions */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-line/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">4</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Terms & Conditions</h3>
                </div>
                <span className="text-xs text-ink-subtle">{terms.length} clauses configured</span>
              </div>

              <div className="space-y-2">
                {terms.map((term, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 rounded-lg border border-line/60 bg-canvas/20 px-3 py-2 text-xs text-ink-muted">
                    <span className="flex-1">{term}</span>
                    <button
                      type="button"
                      onClick={() => removeTerm(idx)}
                      className="text-ink-subtle hover:text-red-600"
                      title="Remove clause"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Add custom agreement term or penalty clause..."
                  value={newTermInput}
                  onChange={(e) => setNewTermInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }}
                  className="flex-1 rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addTerm}>
                  Add Clause
                </Button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-line bg-canvas px-6 py-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving
                ? (isEdit ? 'Saving Changes…' : 'Creating Purchase Order…')
                : (isEdit ? 'Save Changes' : 'Generate Purchase Order')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
