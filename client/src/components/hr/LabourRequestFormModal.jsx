import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { hrApi } from '../../api/hrApi';
import { projectsApi } from '../../api/projectsApi';
import { contractorsApi } from '../../api/contractorsApi';
import { toApiError } from '../../api/axiosClient';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../config/roles';
import { PRIORITY_OPTIONS } from '../../utils/hrOptions';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  contractorId: '',
  projectId: '',
  siteId: '',
  skillCategory: '',
  quantity: 1,
  priority: 'medium',
  requiredDate: today(),
  durationDays: '',
  reason: '',
};

/** Last day of a period that starts on `from` and lasts `days` days (inclusive). */
function lastDay(from, days) {
  const n = Math.floor(Number(days));
  if (!from || !(n >= 1)) return '';
  const d = new Date(from);
  d.setDate(d.getDate() + n - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Create a new labour request (DRAFT). The contractor states how many workers, of what
 * skill, from which date and for HOW MANY DAYS. Admin / HR also choose the contractor;
 * a contractor's own request is always theirs. The backend enforces the rest by role.
 */
export default function LabourRequestFormModal({ isOpen, onClose, onCreated }) {
  const { user } = useAuth();
  const isContractor = user?.role === ROLES.CONTRACTOR;
  const [values, setValues] = useState(EMPTY);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues({ ...EMPTY, requiredDate: today() });
    setError(null);
    setFieldErrors({});
    projectsApi.list({ pageSize: 50 }).then((d) => setProjects(d.projects ?? [])).catch(() => setProjects([]));
    if (!isContractor) {
      contractorsApi.list({ pageSize: 100 })
        .then((d) => setContractors(d.contractors ?? d.rows ?? []))
        .catch(() => setContractors([]));
    }
  }, [isOpen, isContractor]);

  useEffect(() => {
    if (!values.projectId) { setSites([]); return undefined; }
    let active = true;
    projectsApi.detail(values.projectId)
      .then((d) => active && setSites(d.sites ?? []))
      .catch(() => active && setSites([]));
    return () => { active = false; };
  }, [values.projectId]);

  function set(key) {
    return (e) => {
      const value = e.target.value;
      setValues((prev) => ({
        ...prev,
        [key]: value,
        ...(key === 'projectId' ? { siteId: '' } : null),
      }));
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    };
  }

  // "Needed until" can be typed too: the number of days follows from it.
  function setUntil(e) {
    const until = e.target.value;
    if (!until || !values.requiredDate) return;
    const days = Math.round((new Date(until) - new Date(values.requiredDate)) / 86400000) + 1;
    setValues((prev) => ({ ...prev, durationDays: days >= 1 ? String(days) : prev.durationDays }));
    setFieldErrors((prev) => ({ ...prev, durationDays: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = {};
    if (!isContractor && !values.contractorId) errors.contractorId = 'Select the contractor.';
    if (!values.projectId) errors.projectId = 'Select a project.';
    if (!values.siteId) errors.siteId = 'Select a site.';
    if (!values.skillCategory.trim()) errors.skillCategory = 'Enter the skill / category needed.';
    if (!values.quantity || Number(values.quantity) < 1) errors.quantity = 'Quantity must be at least 1.';
    if (!values.requiredDate) errors.requiredDate = 'Enter from which date the labour is needed.';
    if (!(Math.floor(Number(values.durationDays)) >= 1)) errors.durationDays = 'Enter for how many days the labour is needed.';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setIsSaving(true);
    try {
      const created = await hrApi.requests.create({
        ...(isContractor ? {} : { contractorId: Number(values.contractorId) }),
        projectId: Number(values.projectId),
        siteId: Number(values.siteId),
        skillCategory: values.skillCategory.trim(),
        quantity: Number(values.quantity),
        priority: values.priority,
        requiredDate: values.requiredDate,
        durationDays: Math.floor(Number(values.durationDays)),
        reason: values.reason.trim() || null,
      });
      onCreated?.(created);
      onClose();
    } catch (caught) {
      const apiError = toApiError(caught);
      setError(apiError);
      if (apiError.details) setFieldErrors(apiError.details);
    } finally {
      setIsSaving(false);
    }
  }

  const until = lastDay(values.requiredDate, values.durationDays);
  const workerDays = Number(values.quantity) >= 1 && Number(values.durationDays) >= 1
    ? Number(values.quantity) * Math.floor(Number(values.durationDays))
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New labour request"
      description="Request labour for a site: how many workers, of what skill, from which date and for how many days. Saved as draft - submit to send for review."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isSaving} loadingText="Saving…">
            Save as draft
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && !error.details && (
          <Alert tone="error" title="Could not create this request">{error.message}</Alert>
        )}

        {!isContractor && (
          <SelectField
            label="Contractor"
            required
            value={values.contractorId}
            onChange={set('contractorId')}
            error={fieldErrors.contractorId}
            placeholder="Select the contractor"
            options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Project"
            required
            value={values.projectId}
            onChange={set('projectId')}
            error={fieldErrors.projectId}
            placeholder="Select a project"
            options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
          />
          <SelectField
            label="Site"
            required
            value={values.siteId}
            onChange={set('siteId')}
            error={fieldErrors.siteId}
            placeholder={!values.projectId ? 'Select a project first' : 'Select a site'}
            disabled={!values.projectId}
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            label="Skill / category"
            required
            value={values.skillCategory}
            onChange={set('skillCategory')}
            error={fieldErrors.skillCategory}
            placeholder="e.g. Mason, Helper"
          />
          <InputField
            label="Number of workers"
            type="number"
            min="1"
            required
            value={values.quantity}
            onChange={set('quantity')}
            error={fieldErrors.quantity}
          />
          <SelectField
            label="Priority"
            value={values.priority}
            onChange={set('priority')}
            options={PRIORITY_OPTIONS}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            label="Needed from"
            type="date"
            required
            value={values.requiredDate}
            onChange={set('requiredDate')}
            error={fieldErrors.requiredDate}
          />
          <InputField
            label="Number of days"
            type="number"
            min="1"
            step="1"
            required
            value={values.durationDays}
            onChange={set('durationDays')}
            error={fieldErrors.durationDays}
            placeholder="e.g. 10"
          />
          <InputField
            label="Needed until"
            type="date"
            value={until}
            min={values.requiredDate || undefined}
            onChange={setUntil}
            hint="Follows from the days - or pick a date."
          />
        </div>

        {workerDays && (
          <p className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-xs text-brand-900">
            {values.quantity} worker(s) × {Math.floor(Number(values.durationDays))} day(s) = <strong>{workerDays} worker-days</strong>
            {until && ` · ${values.requiredDate} to ${until}`}
          </p>
        )}

        <TextAreaField
          label="Reason / details"
          value={values.reason}
          onChange={set('reason')}
          rows={3}
          placeholder="Why the labour is needed, work to be done…"
        />
      </form>
    </Modal>
  );
}
