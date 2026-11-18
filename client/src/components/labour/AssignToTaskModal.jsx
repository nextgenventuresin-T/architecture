import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, TextAreaField } from '../ui/Field';
import ScopePicker, { useScopeOptions } from './ScopePicker';
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

/** Everything that can be ticked: a task without subtasks, or each subtask of a task. */
function targetsOf(tasks) {
  return tasks.flatMap((t) => ((t.subtasks || []).length
    ? t.subtasks.map((st) => ({ key: `s:${t.id}:${st.id}`, taskId: t.id, subtaskId: st.id, label: `${t.name} › ${st.name}` }))
    : [{ key: `t:${t.id}`, taskId: t.id, subtaskId: null, label: t.name }]));
}

/**
 * Admin assigns one labour (from the Labour Directory) to several tasks / subtasks at once:
 * pick Project (and Site), then tick tasks and subtasks - or Select all. Each tick is the
 * same assignment as "Assign worker" inside a task, so the worker appears in "Workers on
 * Site Today" when daily work is logged on any of them.
 */
export default function AssignToTaskModal({ worker, onClose, onAssigned }) {
  const isCompany = worker && (worker.isCompanyLabour || ['company_labour', 'company_employee'].includes(worker.workerType));
  const [scope, setScope] = useState({ projectId: '', siteId: '', taskId: '', subtaskId: '', areaId: '' });
  const { tasks } = useScopeOptions(scope);
  const [picked, setPicked] = useState(() => new Set());
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [dailyWage, setDailyWage] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [failures, setFailures] = useState([]); // [{ label, message }]
  const [needsReason, setNeedsReason] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!worker) return;
    setScope({ projectId: '', siteId: '', taskId: '', subtaskId: '', areaId: '' });
    setPicked(new Set());
    setStartDate(todayIso());
    setEndDate('');
    setDailyWage(isCompany ? '0' : String(worker.dailyRate || ''));
    setRemarks('');
    setReason('');
    setErrors({});
    setFailures([]);
    setNeedsReason(false);
  }, [worker, isCompany]);

  // A different project / site shows different tasks: start the ticks again.
  useEffect(() => { setPicked(new Set()); }, [scope.projectId, scope.siteId]);

  const targets = useMemo(() => targetsOf(tasks), [tasks]);
  const allPicked = targets.length > 0 && targets.every((t) => picked.has(t.key));

  if (!worker) return null;

  const days = workingDays(startDate, endDate);
  const wage = isCompany ? 0 : Number(dailyWage || 0);

  const toggle = (keys, on) => setPicked((prev) => {
    const next = new Set(prev);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    return next;
  });

  async function save() {
    const errs = {};
    if (!scope.projectId) errs.project_id = 'Select the project.';
    if (!picked.size) errs.tasks = 'Tick at least one task or subtask.';
    if (!startDate) errs.start_date = 'Enter the start date.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setFailures([]);
    const chosen = targets.filter((t) => picked.has(t.key));
    const failed = [];
    let ok = 0;
    // One assignment per ticked task / subtask; the others still go through if one fails.
    for (const t of chosen) {
      try {
        await tasksApi.assignWorker(t.taskId, {
          subtask_id: t.subtaskId,
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
        ok += 1;
      } catch (caught) {
        failed.push({ key: t.key, label: t.label, message: caught.response?.data?.error?.message || caught.message || 'Could not assign.' });
      }
    }
    setSaving(false);
    if (!failed.length) {
      onAssigned(`${worker.fullName || worker.name} assigned to ${ok} task${ok === 1 ? '' : 's'} / subtask${ok === 1 ? '' : 's'}. They will be listed when daily work is logged there.`);
      return;
    }
    // Keep only the failed ones ticked so a retry (e.g. with a reason) does just those.
    setPicked(new Set(failed.map((f) => f.key)));
    setFailures(failed);
    if (failed.some((f) => /reason/i.test(f.message))) setNeedsReason(true);
    if (ok) onAssigned(null, ok);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Assign ${worker.fullName || worker.name}`}
      description="Choose the project and site, then tick the tasks and subtasks this labour works on."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} isLoading={saving} loadingText="Assigning…">
            Assign to {picked.size || ''} task{picked.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {failures.length > 0 && (
        <Alert tone="error" className="mb-4" title="Some could not be assigned (still ticked below)">
          <ul className="list-disc pl-4">
            {failures.map((f) => <li key={f.key}><strong>{f.label}</strong>: {f.message}</li>)}
          </ul>
        </Alert>
      )}
      <div className="space-y-4">
        <ScopePicker
          value={scope}
          onChange={(next) => { setScope(next); setErrors({}); }}
          required={{ project: true }}
          show={{ task: false, subtask: false, area: false }}
          errors={errors}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Tasks &amp; subtasks <span className="text-red-600">*</span></span>
            {picked.size > 0 && <span className="text-xs text-ink-subtle">{picked.size} selected</span>}
          </div>
          <div className={`max-h-64 overflow-y-auto rounded-xl border ${errors.tasks ? 'border-red-400' : 'border-line'} bg-white`}>
            {!scope.projectId ? (
              <p className="p-3 text-sm text-ink-subtle">Select the project first.</p>
            ) : !tasks.length ? (
              <p className="p-3 text-sm text-ink-subtle">No tasks on this {scope.siteId ? 'site' : 'project'}.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                <li className="bg-canvas">
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 font-semibold">
                    <input type="checkbox" checked={allPicked} onChange={(e) => toggle(targets.map((t) => t.key), e.target.checked)} />
                    Select all ({targets.length})
                  </label>
                </li>
                {tasks.map((t) => {
                  const subs = t.subtasks || [];
                  const keys = subs.length ? subs.map((st) => `s:${t.id}:${st.id}`) : [`t:${t.id}`];
                  const all = keys.every((k) => picked.has(k));
                  const some = !all && keys.some((k) => picked.has(k));
                  return (
                    <li key={t.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-canvas">
                        <input
                          type="checkbox"
                          checked={all}
                          ref={(el) => { if (el) el.indeterminate = some; }}
                          onChange={(e) => toggle(keys, e.target.checked)}
                        />
                        <span className="font-medium text-ink">{t.name}</span>
                        {subs.length > 0 && <span className="text-xs text-ink-subtle">({subs.length} subtasks)</span>}
                      </label>
                      {subs.length > 0 && (
                        <ul className="pb-1">
                          {subs.map((st) => {
                            const k = `s:${t.id}:${st.id}`;
                            return (
                              <li key={st.id}>
                                <label className="flex cursor-pointer items-center gap-2 py-1.5 pl-9 pr-3 hover:bg-canvas">
                                  <input type="checkbox" checked={picked.has(k)} onChange={(e) => toggle([k], e.target.checked)} />
                                  <span className="text-ink-muted">{st.name}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {errors.tasks && <p className="mt-1 text-xs text-red-600">{errors.tasks}</p>}
        </div>

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
            hint={isCompany ? 'Company labour: no wage cost' : (days ? `Planned ${formatCurrency(days * wage)} per task` : undefined)}
          />
        </div>
        {needsReason && (
          <TextAreaField label="Reason for an extra worker" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            hint="Some tasks already have all their planned workers. Enter a reason and assign again." />
        )}
        <TextAreaField label="Remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
    </Modal>
  );
}
