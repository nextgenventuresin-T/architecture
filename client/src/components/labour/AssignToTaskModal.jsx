import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, TextAreaField } from '../ui/Field';
import ScopePicker from './ScopePicker';
import { tasksApi } from '../../api/tasksApi';
import { formatCurrency } from '../../utils/format';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Working days between two dates, Sundays off (same rule as the task's Assign worker). */
function workingDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return 0;
  let n = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n += 1;
  return n;
}

/**
 * Admin assigns one labour (from the Labour Directory) to a Project -> Site -> Task -> Subtask.
 * It is the same assignment as "Assign worker" inside a task, so the worker then appears in
 * "Workers on Site Today" when the contractor / Project Manager logs daily work on that task.
 */
export default function AssignToTaskModal({ worker, onClose, onAssigned }) {
  const isCompany = worker && (worker.isCompanyLabour || ['company_labour', 'company_employee'].includes(worker.workerType));
  const [scope, setScope] = useState({ projectId: '', siteId: '', taskId: '', subtaskId: '', areaId: '' });
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [dailyWage, setDailyWage] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [needsReason, setNeedsReason] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!worker) return;
    setScope({ projectId: '', siteId: '', taskId: '', subtaskId: '', areaId: '' });
    setStartDate(todayIso());
    setEndDate('');
    setDailyWage(isCompany ? '0' : String(worker.dailyRate || ''));
    setRemarks('');
    setReason('');
    setErrors({});
    setError(null);
    setNeedsReason(false);
  }, [worker, isCompany]);

  if (!worker) return null;

  const days = workingDays(startDate, endDate);
  const wage = isCompany ? 0 : Number(dailyWage || 0);

  async function save() {
    const errs = {};
    if (!scope.projectId) errs.project_id = 'Select the project.';
    if (!scope.taskId) errs.task_id = 'Select the task.';
    if (!startDate) errs.start_date = 'Enter the start date.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setError(null);
    try {
      await tasksApi.assignWorker(scope.taskId, {
        subtask_id: scope.subtaskId ? Number(scope.subtaskId) : null,
        worker_id: worker.id,
        worker_type: isCompany ? 'company_labour' : 'daily_wage',
        worker_name: worker.fullName || worker.name,
        worker_code: worker.workerCode || null,
        phone: worker.phone || null,
        aadhaar_number: worker.aadhaarNumber || null,
        trade: worker.skillCategory || worker.trade || null,
        start_date: startDate,
        end_date: endDate || null,
        expected_days: days,
        daily_wage: wage,
        planned_cost: days * wage,
        remarks: remarks.trim(),
        reason: reason.trim(),
      });
      onAssigned(`${worker.fullName || worker.name} assigned. They will be listed when daily work is logged on that task.`);
    } catch (caught) {
      const message = caught.response?.data?.error?.message || caught.message || 'Could not assign this worker.';
      // More workers than the task plan: the server asks for a reason.
      if (/reason/i.test(message)) setNeedsReason(true);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Assign ${worker.fullName || worker.name}`}
      description="Choose the project, site, task and subtask this labour works on."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} isLoading={saving} loadingText="Assigning…">Assign to task</Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        <ScopePicker
          value={scope}
          onChange={(next) => { setScope(next); setErrors({}); }}
          required={{ project: true, task: true }}
          show={{ area: false }}
          errors={errors}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField label="Start date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} error={errors.start_date} />
          <InputField label="End date" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} hint={days ? `${days} working days` : 'Optional'} />
          <InputField
            label="Daily wage (₹)"
            type="number"
            min="0"
            value={dailyWage}
            onChange={(e) => setDailyWage(e.target.value)}
            disabled={isCompany}
            hint={isCompany ? 'Company labour: no wage cost' : (days ? `Planned ${formatCurrency(days * wage)}` : undefined)}
          />
        </div>
        {needsReason && (
          <TextAreaField label="Reason for an extra worker" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            hint="The task already has all its planned workers." />
        )}
        <TextAreaField label="Remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
    </Modal>
  );
}
