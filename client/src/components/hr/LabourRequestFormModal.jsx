import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { hrApi } from '../../api/hrApi';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';
import { LABOUR_TYPE_OPTIONS, PRIORITY_OPTIONS } from '../../utils/hrOptions';

const EMPTY = {
  title: '',
  labourType: 'contractor',
  projectId: '',
  siteId: '',
  skillCategory: '',
  quantity: 1,
  priority: 'medium',
  requiredFrom: '',
  requiredTo: '',
  description: '',
};

/**
 * Create a new labour request (DRAFT). Any role that can create will see
 * this form; the backend enforces further constraints by role.
 */
export default function LabourRequestFormModal({ isOpen, onClose, onCreated }) {
  const [values, setValues] = useState(EMPTY);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(EMPTY);
    setError(null);
    setFieldErrors({});
    projectsApi.list({ pageSize: 50 }).then((d) => setProjects(d.projects ?? [])).catch(() => setProjects([]));
  }, [isOpen]);

  useEffect(() => {
    if (!values.projectId) { setSites([]); return undefined; }
    let active = true;
    projectsApi.detail(values.projectId)
      .then((d) => active && setSites(d.sites ?? []))
      .catch(() => active && setSites([]));
    return () => { active = false; };
  }, [values.projectId]);

  function set(key) {
    return (e) => setValues((prev) => ({
      ...prev,
      [key]: e.target.value,
      ...(key === 'projectId' ? { siteId: '' } : null),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = {};
    if (!values.title.trim()) errors.title = 'Enter a title.';
    if (!values.projectId) errors.projectId = 'Select a project.';
    if (!values.quantity || Number(values.quantity) < 1) errors.quantity = 'Quantity must be at least 1.';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setIsSaving(true);
    try {
      const created = await hrApi.requests.create({
        title: values.title.trim(),
        labourType: values.labourType,
        projectId: Number(values.projectId),
        siteId: values.siteId ? Number(values.siteId) : null,
        skillCategory: values.skillCategory || null,
        quantity: Number(values.quantity),
        priority: values.priority,
        requiredFrom: values.requiredFrom || null,
        requiredTo: values.requiredTo || null,
        description: values.description || null,
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New labour request"
      description="Request contractor or company labour for a project. Saved as draft — submit to send for review."
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
        {error && (
          <Alert tone="error" title="Could not create this request">{error.message}</Alert>
        )}

        <InputField
          label="Request title"
          required
          value={values.title}
          onChange={set('title')}
          error={fieldErrors.title}
          placeholder="e.g. Mason workers for Phase 2 foundation"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Labour type"
            required
            value={values.labourType}
            onChange={set('labourType')}
            options={LABOUR_TYPE_OPTIONS}
          />
          <SelectField
            label="Priority"
            value={values.priority}
            onChange={set('priority')}
            options={PRIORITY_OPTIONS}
          />
        </div>

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
            value={values.siteId}
            onChange={set('siteId')}
            placeholder={!values.projectId ? 'Select a project first' : 'No specific site'}
            disabled={!values.projectId}
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Quantity"
            type="number"
            min="1"
            required
            value={values.quantity}
            onChange={set('quantity')}
            error={fieldErrors.quantity}
            hint="Number of workers required"
          />
          <InputField
            label="Skill / category"
            value={values.skillCategory}
            onChange={set('skillCategory')}
            placeholder="e.g. mason, electrician"
            hint="Optional"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Required from"
            type="date"
            value={values.requiredFrom}
            onChange={set('requiredFrom')}
          />
          <InputField
            label="Required to"
            type="date"
            value={values.requiredTo}
            onChange={set('requiredTo')}
            hint="Optional"
          />
        </div>

        <TextAreaField
          label="Description"
          value={values.description}
          onChange={set('description')}
          rows={3}
          placeholder="Additional details about the requirement…"
        />
      </form>
    </Modal>
  );
}
