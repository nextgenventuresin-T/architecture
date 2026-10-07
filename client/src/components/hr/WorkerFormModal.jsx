import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { hrApi } from '../../api/hrApi';
import { contractorsApi } from '../../api/contractorsApi';
import { toApiError } from '../../api/axiosClient';
import { WORKER_STATUS_OPTIONS } from '../../utils/hrOptions';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../config/roles';

const EMPTY = {
  contractorId: '',
  fullName: '',
  phone: '',
  skillCategory: '',
  dailyRate: '',
  status: 'active',
  joiningDate: '',
  workerCode: '',
  notes: '',
};

/** Create or edit a contractor worker. A signed-in CONTRACTOR never picks a
 * contractor — the backend always uses their own id (contractorWorkerService.create). */
export default function WorkerFormModal({ isOpen, onClose, onSaved, worker }) {
  const { user } = useAuth();
  const isContractorUser = user?.role === ROLES.CONTRACTOR;
  const isEdit = Boolean(worker);
  const [values, setValues] = useState(EMPTY);
  const [contractors, setContractors] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFieldErrors({});
    setValues(
      worker
        ? {
            contractorId: String(worker.contractorId ?? ''),
            fullName: worker.fullName ?? '',
            phone: worker.phone ?? '',
            skillCategory: worker.skillCategory ?? '',
            dailyRate: worker.dailyRate ?? '',
            status: worker.status ?? 'active',
            joiningDate: worker.joiningDate ? worker.joiningDate.slice(0, 10) : '',
            workerCode: worker.workerCode ?? '',
            notes: worker.notes ?? '',
          }
        : EMPTY
    );
    if (!isContractorUser) {
      contractorsApi.list({ pageSize: 50 }).then((d) => setContractors(d.contractors ?? [])).catch(() => setContractors([]));
    }
  }, [isOpen, worker, isContractorUser]);

  function set(key) {
    return (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    const errors = {};
    if (!values.fullName.trim()) errors.fullName = "Enter the worker's name.";
    if (!isContractorUser && !values.contractorId) errors.contractorId = 'Select a contractor.';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setIsSaving(true);
    const payload = {
      contractorId: values.contractorId ? Number(values.contractorId) : undefined,
      fullName: values.fullName.trim(),
      phone: values.phone || null,
      skillCategory: values.skillCategory || 'general',
      dailyRate: values.dailyRate ? Number(values.dailyRate) : 0,
      status: values.status,
      joiningDate: values.joiningDate || null,
      workerCode: values.workerCode || undefined,
      notes: values.notes || null,
    };

    try {
      const saved = isEdit ? await hrApi.workers.update(worker.id, payload) : await hrApi.workers.create(payload);
      onSaved?.(saved);
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
      title={isEdit ? 'Edit worker' : 'Add contractor worker'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isSaving} loadingText="Saving…">{isEdit ? 'Save changes' : 'Add worker'}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && <Alert tone="error" title="Could not save this worker">{error.message}</Alert>}

        {!isContractorUser && (
          <SelectField
            label="Contractor"
            required
            value={values.contractorId}
            onChange={set('contractorId')}
            error={fieldErrors.contractorId}
            placeholder="Select a contractor"
            options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
            disabled={isEdit}
          />
        )}

        <InputField label="Full name" required value={values.fullName} onChange={set('fullName')} error={fieldErrors.fullName} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="Phone" value={values.phone} onChange={set('phone')} />
          <InputField label="Skill / category" value={values.skillCategory} onChange={set('skillCategory')} placeholder="e.g. mason, electrician" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="Daily rate (₹)" type="number" min="0" step="0.01" value={values.dailyRate} onChange={set('dailyRate')} />
          <InputField label="Joining date" type="date" value={values.joiningDate} onChange={set('joiningDate')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="Worker ID" value={values.workerCode} onChange={set('workerCode')} hint="Leave blank to auto-generate" disabled={isEdit} />
          <SelectField label="Status" value={values.status} onChange={set('status')} options={WORKER_STATUS_OPTIONS} />
        </div>

        <TextAreaField label="Notes" value={values.notes} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  );
}
