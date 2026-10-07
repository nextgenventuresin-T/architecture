import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { SelectField, InputField, TextAreaField } from '../ui/Field';
import { hrApi } from '../../api/hrApi';
import { projectsApi } from '../../api/projectsApi';
import { employeesApi } from '../../api/employeesApi';
import { contractorsApi } from '../../api/contractorsApi';
import { toApiError } from '../../api/axiosClient';
import { LABOUR_TYPE_OPTIONS } from '../../utils/hrOptions';

const EMPTY = {
  labourType: 'contractor',
  projectId: '',
  siteId: '',
  contractorId: '',
  employeeId: '',
  contractorWorkerId: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  notes: '',
};

/**
 * Posts a company employee or contractor worker to a project/site.
 * ADMIN/HR only — matches labourAssignmentService.create being gated to
 * canManageAssignments at the route layer.
 */
export default function AssignmentFormModal({ isOpen, onClose, onCreated, fixedLabourType }) {
  const [values, setValues] = useState({ ...EMPTY, labourType: fixedLabourType || EMPTY.labourType });
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues({ ...EMPTY, labourType: fixedLabourType || EMPTY.labourType });
    setError(null);
    setFieldErrors({});
    projectsApi.list({ pageSize: 50 }).then((d) => setProjects(d.projects ?? [])).catch(() => setProjects([]));
    employeesApi.list({ pageSize: 50 }).then((d) => setEmployees(d.employees ?? [])).catch(() => setEmployees([]));
    contractorsApi.list({ pageSize: 50 }).then((d) => setContractors(d.contractors ?? [])).catch(() => setContractors([]));
  }, [isOpen, fixedLabourType]);

  useEffect(() => {
    if (!values.projectId) { setSites([]); return undefined; }
    let active = true;
    projectsApi.detail(values.projectId).then((d) => active && setSites(d.sites ?? [])).catch(() => active && setSites([]));
    return () => { active = false; };
  }, [values.projectId]);

  useEffect(() => {
    if (values.labourType !== 'contractor' || !values.contractorId) { setWorkers([]); return undefined; }
    let active = true;
    hrApi.workers.list({ contractorId: values.contractorId, pageSize: 100, status: 'active' })
      .then((d) => active && setWorkers(d.workers ?? []))
      .catch(() => active && setWorkers([]));
    return () => { active = false; };
  }, [values.labourType, values.contractorId]);

  function set(key) {
    return (event) => {
      const value = event.target.value;
      setValues((prev) => ({
        ...prev,
        [key]: value,
        ...(key === 'projectId' ? { siteId: '' } : null),
        ...(key === 'labourType' ? { employeeId: '', contractorId: '', contractorWorkerId: '' } : null),
        ...(key === 'contractorId' ? { contractorWorkerId: '' } : null),
      }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    const errors = {};
    if (!values.projectId) errors.projectId = 'Select a project.';
    if (!values.startDate) errors.startDate = 'Enter a start date.';
    if (values.labourType === 'company' && !values.employeeId) errors.employeeId = 'Select an employee.';
    if (values.labourType === 'contractor' && !values.contractorWorkerId) errors.contractorWorkerId = 'Select a worker.';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setIsSaving(true);
    try {
      const created = await hrApi.assignments.create({
        labourType: values.labourType,
        projectId: Number(values.projectId),
        siteId: values.siteId ? Number(values.siteId) : null,
        employeeId: values.labourType === 'company' ? Number(values.employeeId) : null,
        contractorWorkerId: values.labourType === 'contractor' ? Number(values.contractorWorkerId) : null,
        startDate: values.startDate,
        endDate: values.endDate || null,
        notes: values.notes || null,
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
      title="Post labour to a project"
      description="Assign a company employee or contractor worker to a project/site."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isSaving} loadingText="Saving…">Post assignment</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && <Alert tone="error" title="Could not post this assignment">{error.message}</Alert>}

        {!fixedLabourType && (
          <SelectField label="Labour type" required value={values.labourType} onChange={set('labourType')} options={LABOUR_TYPE_OPTIONS} />
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
            value={values.siteId}
            onChange={set('siteId')}
            placeholder={!values.projectId ? 'Select a project first' : 'No specific site'}
            disabled={!values.projectId}
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        </div>

        {values.labourType === 'company' ? (
          <SelectField
            label="Employee"
            required
            value={values.employeeId}
            onChange={set('employeeId')}
            error={fieldErrors.employeeId}
            placeholder="Select an employee"
            options={employees.map((e) => ({ value: String(e.id), label: `${e.fullName} — ${e.designation || ''}` }))}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Contractor"
              required
              value={values.contractorId}
              onChange={set('contractorId')}
              placeholder="Select a contractor"
              options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <SelectField
              label="Worker"
              required
              value={values.contractorWorkerId}
              onChange={set('contractorWorkerId')}
              error={fieldErrors.contractorWorkerId}
              placeholder={!values.contractorId ? 'Select a contractor first' : 'Select a worker'}
              disabled={!values.contractorId}
              options={workers.map((w) => ({ value: String(w.id), label: `${w.fullName} — ${w.skillCategory}` }))}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="Start date" type="date" required value={values.startDate} onChange={set('startDate')} error={fieldErrors.startDate} />
          <InputField label="End date" type="date" value={values.endDate} onChange={set('endDate')} hint="Optional" />
        </div>

        <TextAreaField label="Notes" value={values.notes} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  );
}
