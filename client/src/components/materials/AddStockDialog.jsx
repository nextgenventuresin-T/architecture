import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { materialsApi } from '../../api/materialsApi';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records a delivery of this material. Writes to `material_entries`, the same
 * Interface 3 table the project and site screens read, so stock added here
 * appears on those screens too rather than in a parallel store.
 */
export default function AddStockDialog({ material, onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [values, setValues] = useState({
    project_id: '',
    site_id: '',
    quantity: '',
    rate: '',
    supplier: '',
    received_date: today(),
    notes: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!material) return;
    setError(null);
    setFieldErrors({});
    // Prefill rate and supplier from the material's defaults.
    setValues({
      project_id: '',
      site_id: '',
      quantity: '',
      rate: material.purchaseRate ? String(material.purchaseRate) : '',
      supplier: material.supplier ?? '',
      received_date: today(),
      notes: '',
    });
    setSites([]);
    setIsLoadingProjects(true);
    projectsApi
      .list({ pageSize: 50 })
      .then((data) => setProjects(data.projects ?? []))
      .catch((caught) => setError(toApiError(caught)))
      .finally(() => setIsLoadingProjects(false));
  }, [material]);

  useEffect(() => {
    if (!values.project_id) {
      setSites([]);
      return;
    }
    setIsLoadingSites(true);
    projectsApi
      .detail(values.project_id)
      .then((data) => setSites(data.sites ?? []))
      .catch((caught) => setError(toApiError(caught)))
      .finally(() => setIsLoadingSites(false));
  }, [values.project_id]);

  if (!material) return null;

  const set = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === 'project_id' ? { site_id: '' } : null),
    }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  function validate() {
    const errors = {};
    if (!values.project_id) errors.project_id = 'Select a project.';
    if (!values.quantity || Number(values.quantity) <= 0) {
      errors.quantity = 'Enter a quantity greater than zero.';
    }
    if (values.rate && Number(values.rate) < 0) errors.rate = 'Rate cannot be negative.';
    if (!values.received_date) errors.received_date = 'Enter the received date.';
    else if (new Date(values.received_date) > new Date()) {
      errors.received_date = 'The received date cannot be in the future.';
    }
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
      await materialsApi.addEntry(material.id, {
        project_id: Number(values.project_id),
        site_id: values.site_id ? Number(values.site_id) : null,
        quantity: Number(values.quantity),
        rate: values.rate ? Number(values.rate) : 0,
        supplier: values.supplier.trim() || null,
        received_date: values.received_date,
        notes: values.notes.trim() || null,
      });
      onSaved(`${values.quantity} ${material.unit} of ${material.name} added to stock.`);
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add stock entry"
      description={`${material.code} · ${material.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} loadingText="Saving…">Add stock</Button>
        </>
      }
    >
      {error && !error.details && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Project"
          required
          value={values.project_id}
          onChange={set('project_id')}
          error={fieldErrors.project_id}
          placeholder={isLoadingProjects ? 'Loading projects…' : 'Select a project'}
          options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
          disabled={isLoadingProjects}
          className="sm:col-span-2"
        />
        <SelectField
          label="Site (optional)"
          value={values.site_id}
          onChange={set('site_id')}
          error={fieldErrors.site_id}
          placeholder={
            !values.project_id ? 'Select a project first' : isLoadingSites ? 'Loading sites…' : 'Project store (no specific site)'
          }
          options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          disabled={!values.project_id || isLoadingSites}
          className="sm:col-span-2"
        />
        <InputField
          label={`Quantity (${material.unit})`}
          required
          type="number"
          min="0"
          step="0.01"
          value={values.quantity}
          onChange={set('quantity')}
          error={fieldErrors.quantity}
          placeholder="120"
        />
        <InputField
          label="Rate per unit"
          type="number"
          min="0"
          step="0.01"
          value={values.rate}
          onChange={set('rate')}
          error={fieldErrors.rate}
          hint="Prefilled from the material's purchase rate."
        />
        <InputField
          label="Supplier"
          value={values.supplier}
          onChange={set('supplier')}
          error={fieldErrors.supplier}
          placeholder="Ambuja Depot, Patiala"
        />
        <InputField
          label="Received date"
          required
          type="date"
          value={values.received_date}
          onChange={set('received_date')}
          error={fieldErrors.received_date}
        />
        <TextAreaField
          label="Notes"
          value={values.notes}
          onChange={set('notes')}
          rows={2}
          className="sm:col-span-2"
          placeholder="Challan number, vehicle, condition on arrival…"
        />
      </div>
    </Modal>
  );
}
