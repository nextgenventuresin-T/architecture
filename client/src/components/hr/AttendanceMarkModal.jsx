import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { hrApi } from '../../api/hrApi';
import { projectsApi } from '../../api/projectsApi';
import { employeesApi } from '../../api/employeesApi';
import { contractorsApi } from '../../api/contractorsApi';
import { toApiError } from '../../api/axiosClient';
import {
  ATTENDANCE_STATUS_OPTIONS,
  LABOUR_TYPE_OPTIONS,
} from '../../utils/hrOptions';

const today = new Date().toISOString().slice(0, 10);

const EMPTY = {
  labourType: 'contractor',
  employeeId: '',
  contractorId: '',
  contractorWorkerId: '',
  projectId: '',
  siteId: '',
  date: today,
  status: 'PRESENT',
  checkIn: '',
  checkOut: '',
  remarks: '',
};

/**
 * Mark or edit an attendance record. HR/Admin only.
 * When `record` is provided, opens in edit mode (PATCH).
 *
 * Employees cannot mark their own attendance — the backend enforces this,
 * and the parent AttendanceTab only renders this modal for HR/Admin.
 */
export default function AttendanceMarkModal({ isOpen, onClose, onSaved, record }) {
  const isEdit = Boolean(record);
  const [values, setValues] = useState(EMPTY);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Populate on open
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFieldErrors({});
    setValues(
      record
        ? {
            labourType: record.labourType ?? 'contractor',
            employeeId: record.employeeId ? String(record.employeeId) : '',
            contractorId: record.contractorId ? String(record.contractorId) : '',
            contractorWorkerId: record.contractorWorkerId ? String(record.contractorWorkerId) : '',
            projectId: record.projectId ? String(record.projectId) : '',
            siteId: record.siteId ? String(record.siteId) : '',
            date: record.date ? record.date.slice(0, 10) : today,
            status: record.status ?? 'PRESENT',
            checkIn: record.checkIn ?? '',
            checkOut: record.checkOut ?? '',
            remarks: record.remarks ?? '',
          }
        : EMPTY
    );
    projectsApi.list({ pageSize: 50 }).then((d) => setProjects(d.projects ?? [])).catch(() => setProjects([]));
    employeesApi.list({ pageSize: 50 }).then((d) => setEmployees(d.employees ?? [])).catch(() => setEmployees([]));
    contractorsApi.list({ pageSize: 50 }).then((d) => setContractors(d.contractors ?? [])).catch(() => setContractors([]));
  }, [isOpen, record]);

  // Sites cascade
  useEffect(() => {
    if (!values.projectId) { setSites([]); return undefined; }
    let active = true;
    projectsApi.detail(values.projectId)
      .then((d) => active && setSites(d.sites ?? []))
      .catch(() => active && setSites([]));
    return () => { active = false; };
  }, [values.projectId]);

  // Workers cascade
  useEffect(() => {
    if (values.labourType !== 'contractor' || !values.contractorId) { setWorkers([]); return undefined; }
    let active = true;
    hrApi.workers.list({ contractorId: values.contractorId, pageSize: 100, status: 'active' })
      .then((d) => active && setWorkers(d.workers ?? []))
      .catch(() => active && setWorkers([]));
    return () => { active = false; };
  }, [values.labourType, values.contractorId]);

  function set(key) {
    return (e) =>
      setValues((prev) => ({
        ...prev,
        [key]: e.target.value,
        ...(key === 'projectId' ? { siteId: '' } : null),
        ...(key === 'labourType' ? { employeeId: '', contractorId: '', contractorWorkerId: '' } : null),
        ...(key === 'contractorId' ? { contractorWorkerId: '' } : null),
      }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = {};
    if (!values.date) errors.date = 'Enter a date.';
    if (values.labourType === 'company' && !values.employeeId) errors.employeeId = 'Select an employee.';
    if (values.labourType === 'contractor' && !values.contractorWorkerId) errors.contractorWorkerId = 'Select a worker.';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setIsSaving(true);
    const payload = {
      labourType: values.labourType,
      employeeId: values.labourType === 'company' && values.employeeId ? Number(values.employeeId) : null,
      contractorWorkerId: values.labourType === 'contractor' && values.contractorWorkerId ? Number(values.contractorWorkerId) : null,
      projectId: values.projectId ? Number(values.projectId) : null,
      siteId: values.siteId ? Number(values.siteId) : null,
      date: values.date,
      status: values.status,
      checkIn: values.checkIn || null,
      checkOut: values.checkOut || null,
      remarks: values.remarks || null,
    };

    try {
      const saved = isEdit
        ? await hrApi.attendance.update(record.id, payload)
        : await hrApi.attendance.mark(payload);
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
      title={isEdit ? 'Edit attendance record' : 'Mark attendance'}
      description={isEdit ? 'Update this attendance entry.' : 'Record attendance for a worker or employee.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isSaving} loadingText="Saving…">
            {isEdit ? 'Save changes' : 'Mark attendance'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && (
          <Alert tone="error" title="Could not save attendance">{error.message}</Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Labour type"
            required
            value={values.labourType}
            onChange={set('labourType')}
            options={LABOUR_TYPE_OPTIONS}
            disabled={isEdit}
          />
          <InputField
            label="Date"
            type="date"
            required
            value={values.date}
            onChange={set('date')}
            error={fieldErrors.date}
            disabled={isEdit}
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
            options={employees.map((e) => ({
              value: String(e.id),
              label: `${e.fullName}${e.designation ? ` — ${e.designation}` : ''}`,
            }))}
            disabled={isEdit}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Contractor"
              value={values.contractorId}
              onChange={set('contractorId')}
              placeholder="Select a contractor"
              options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
              disabled={isEdit}
            />
            <SelectField
              label="Worker"
              required
              value={values.contractorWorkerId}
              onChange={set('contractorWorkerId')}
              error={fieldErrors.contractorWorkerId}
              placeholder={!values.contractorId ? 'Select contractor first' : 'Select a worker'}
              disabled={!values.contractorId || isEdit}
              options={workers.map((w) => ({
                value: String(w.id),
                label: `${w.fullName} — ${w.skillCategory}`,
              }))}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Project"
            value={values.projectId}
            onChange={set('projectId')}
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

        <SelectField
          label="Status"
          required
          value={values.status}
          onChange={set('status')}
          options={ATTENDANCE_STATUS_OPTIONS}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Check-in time"
            type="time"
            value={values.checkIn}
            onChange={set('checkIn')}
            hint="Optional"
          />
          <InputField
            label="Check-out time"
            type="time"
            value={values.checkOut}
            onChange={set('checkOut')}
            hint="Optional"
          />
        </div>

        <TextAreaField
          label="Remarks"
          value={values.remarks}
          onChange={set('remarks')}
          rows={2}
          placeholder="Any additional notes…"
        />
      </form>
    </Modal>
  );
}
