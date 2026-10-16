import { useCallback, useMemo, useState } from 'react';
import { CalendarCheck, Eye, Pencil, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import ScopePicker from './ScopePicker';
import useAsync from '../../hooks/useAsync';
import { labourApi } from '../../api/labourApi';
import { toApiError } from '../../api/axiosClient';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_WORKER = { name: '', phone: '', skill: '', dailyRate: '', aadhaarNumber: '', joiningDate: '', status: 'active', notes: '' };
const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Present (1 day)' },
  { value: 'HALF_DAY', label: 'Half day (0.5)' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LEAVE', label: 'Leave' },
];
const STATUS_TONE = { PRESENT: 'positive', HALF_DAY: 'warning', ABSENT: 'danger', LEAVE: 'neutral' };

/**
 * Admin / HR: company labour - workers the company engages and pays directly.
 *   Workers     : register and manage (name, phone, skill, daily wage)
 *   Attendance  : mark a day at project / site / task / subtask / area with each wage
 *   Register    : who worked when and where, days and wages
 * Each present day is booked once as labour cost on that task.
 */
export default function CompanyLabourTab() {
  const [view, setView] = useState('workers');
  return (
    <div className="space-y-4">
      <div className="inline-flex overflow-hidden rounded-lg border border-line bg-white">
        {[['workers', 'Workers', Users], ['mark', 'Mark attendance', CalendarCheck], ['register', 'Attendance register', Eye]].map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setView(id)}
            className={`inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium ${view === id ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-canvas'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {view === 'workers' && <WorkersView />}
      {view === 'mark' && <MarkAttendanceView onDone={() => setView('register')} />}
      {view === 'register' && <RegisterView />}
    </div>
  );
}

// ------------------------------------------------------------------ workers
function WorkersView() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null); // null | 'new' | worker
  const [viewing, setViewing] = useState(null);
  const [banner, setBanner] = useState(null);
  const load = useCallback(() => labourApi.workers({ search: search.trim() || undefined, status }), [search, status]);
  const { data: workers = [], isLoading, error, reload } = useAsync(load, [load]);

  return (
    <Card>
      <CardHeader
        title="Company labour"
        description="Workers the company engages and pays directly. Contractors pick them from a separate 'Company labour' list."
        action={<Button size="sm" onClick={() => setEditing('new')}><UserPlus className="h-4 w-4" aria-hidden="true" /> Register worker</Button>}
      />
      <CardBody className="space-y-4">
        {banner && <Alert tone="success">{banner}</Alert>}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, code, skill"
              className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none" />
          </div>
          <SelectField label="" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"
            options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </div>
        {error && <Alert tone="error">{error.message}</Alert>}
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Worker</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Skill</th>
                <th className="px-3 py-2 text-right">Daily wage</th><th className="px-3 py-2 text-right">Days worked</th>
                <th className="px-3 py-2 text-right">Wages earned</th><th className="px-3 py-2">Last worked</th>
                <th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-subtle">Loading…</td></tr>
              ) : workers.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-ink-subtle">No company labour registered yet.</td></tr>
              ) : workers.map((w) => (
                <tr key={w.id}>
                  <td className="px-3 py-2"><p className="font-medium text-ink">{w.name}</p><p className="text-[11px] text-ink-subtle">{w.code}</p></td>
                  <td className="px-3 py-2 text-ink-muted">{w.phone || '—'}</td>
                  <td className="px-3 py-2 text-ink-muted">{w.skill}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(w.dailyRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(w.daysWorked || 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(w.totalWages || 0)}</td>
                  <td className="px-3 py-2 text-ink-muted">{w.lastWorked ? formatDate(w.lastWorked) : '—'}</td>
                  <td className="px-3 py-2"><Badge tone={w.status === 'active' ? 'positive' : 'neutral'}>{w.status}</Badge></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setViewing(w)} className="rounded p-1.5 text-ink-muted hover:bg-canvas" aria-label={`View ${w.name}`}><Eye className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setEditing(w)} className="rounded p-1.5 text-ink-muted hover:bg-canvas" aria-label={`Edit ${w.name}`}><Pencil className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
      {editing && (
        <WorkerModal worker={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(w, isNew) => { setEditing(null); setBanner(isNew ? `${w.name} registered as company labour.` : 'Worker updated.'); reload(); }} />
      )}
      {viewing && <WorkerHistoryModal worker={viewing} onClose={() => setViewing(null)} />}
    </Card>
  );
}

function WorkerModal({ worker, onClose, onSaved }) {
  const [values, setValues] = useState(worker ? {
    name: worker.name, phone: worker.phone || '', skill: worker.skill === 'general' ? '' : worker.skill, dailyRate: String(worker.dailyRate ?? ''),
    aadhaarNumber: worker.aadhaarNumber || '', joiningDate: worker.joiningDate ? String(worker.joiningDate).slice(0, 10) : '', status: worker.status, notes: worker.notes || '',
  } : EMPTY_WORKER);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  async function save(e) {
    e.preventDefault();
    if (!values.name.trim()) { setErrors({ name: 'Enter the worker name.' }); return; }
    setSaving(true);
    setFormError(null);
    const payload = { ...values, dailyRate: values.dailyRate === '' ? 0 : Number(values.dailyRate), joiningDate: values.joiningDate || null };
    try {
      const saved = worker ? await labourApi.updateWorker(worker.id, payload) : await labourApi.createWorker(payload);
      onSaved(saved, !worker);
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setErrors(apiError.details);
      setFormError(apiError);
      setSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={worker ? `Edit ${worker.name}` : 'Register company labour'} size="lg">
      <form onSubmit={save} noValidate className="space-y-4">
        {formError && !Object.keys(errors).length && <Alert tone="error">{formError.message}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField label="Name" required value={values.name} onChange={set('name')} error={errors.name} />
          <InputField label="Phone" value={values.phone} onChange={set('phone')} error={errors.phone} />
          <InputField label="Skill / trade" value={values.skill} onChange={set('skill')} placeholder="Mason, helper, carpenter…" />
          <InputField label="Daily wage (₹)" type="number" min="0" step="0.01" value={values.dailyRate} onChange={set('dailyRate')} error={errors.dailyRate} />
          <InputField label="Aadhaar (optional)" value={values.aadhaarNumber} onChange={set('aadhaarNumber')} />
          <InputField label="Joining date" type="date" value={values.joiningDate} onChange={set('joiningDate')} error={errors.joiningDate} />
          <SelectField label="Status" value={values.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <TextAreaField label="Notes" value={values.notes} onChange={set('notes')} rows={2} className="sm:col-span-2" />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving} loadingText="Saving…">{worker ? 'Save changes' : 'Register worker'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function WorkerHistoryModal({ worker, onClose }) {
  const { data, isLoading, error } = useAsync(() => labourApi.worker(worker.id), [worker.id]);
  const rows = data?.attendance || [];
  const w = data?.worker || worker;
  return (
    <Modal isOpen onClose={onClose} title={w.name} description={[w.code, w.phone, w.skill].filter(Boolean).join(' · ')} size="xl">
      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div><p className="text-xs uppercase text-ink-subtle">Daily wage</p><p className="font-semibold">{formatCurrency(w.dailyRate)}</p></div>
        <div><p className="text-xs uppercase text-ink-subtle">Days worked</p><p className="font-semibold">{formatNumber(w.daysWorked || 0)}</p></div>
        <div><p className="text-xs uppercase text-ink-subtle">Wages earned</p><p className="font-semibold">{formatCurrency(w.totalWages || 0)}</p></div>
      </div>
      {error && <Alert tone="error">{error.message}</Alert>}
      {isLoading ? <p className="text-sm text-ink-subtle">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-ink-subtle">No attendance recorded yet.</p>
      ) : (
        <div className="max-h-[50vh] overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-canvas text-[11px] uppercase text-ink-muted">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Project / Site</th><th className="px-3 py-2">Task / Area</th><th className="px-3 py-2 text-right">Wage</th><th className="px-3 py-2 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{formatDate(r.date)}</td>
                  <td className="px-3 py-2"><Badge tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ')}</Badge></td>
                  <td className="px-3 py-2 text-ink-muted">{r.projectName}{r.siteName ? ` · ${r.siteName}` : ''}</td>
                  <td className="px-3 py-2 text-ink-muted">{r.taskName}{r.subtaskName ? ` › ${r.subtaskName}` : ''}{r.areaName ? ` · ${r.areaName}` : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.dailyWage)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ mark attendance
function MarkAttendanceView({ onDone }) {
  const [date, setDate] = useState(today());
  const [scope, setScope] = useState({ projectId: '', siteId: '', taskId: '', subtaskId: '', areaId: '' });
  const [entries, setEntries] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { data: workers = [] } = useAsync(() => labourApi.workers({ status: 'active' }), []);
  const chosen = new Set(entries.map((e) => String(e.workerId)));
  const available = workers.filter((w) => !chosen.has(String(w.id)));
  const total = useMemo(() => entries.reduce((s, e) => s + ({ PRESENT: 1, HALF_DAY: 0.5 }[e.status] || 0) * Number(e.dailyWage || 0), 0), [entries]);

  const addWorker = (id) => {
    const w = workers.find((x) => String(x.id) === String(id));
    if (w) setEntries((list) => [...list, { workerId: w.id, name: w.name, phone: w.phone, status: 'PRESENT', dailyWage: String(w.dailyRate ?? 0), remarks: '' }]);
  };
  const addAll = () => setEntries((list) => [...list, ...available.map((w) => ({ workerId: w.id, name: w.name, phone: w.phone, status: 'PRESENT', dailyWage: String(w.dailyRate ?? 0), remarks: '' }))]);
  const setEntry = (i, k, v) => setEntries((list) => list.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  async function save() {
    const errs = {};
    if (!scope.projectId) errs.project_id = 'Select the project.';
    if (!scope.taskId) errs.task_id = 'Select the task.';
    if (!entries.length) errs.entries = 'Add at least one worker.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setFormError(null);
    try {
      await labourApi.markAttendance({
        date, project_id: Number(scope.projectId), site_id: scope.siteId ? Number(scope.siteId) : null, task_id: Number(scope.taskId),
        subtask_id: scope.subtaskId ? Number(scope.subtaskId) : null, area_id: scope.areaId ? Number(scope.areaId) : null,
        entries: entries.map((e) => ({ worker_id: e.workerId, status: e.status, daily_wage: e.dailyWage === '' ? undefined : Number(e.dailyWage), remarks: e.remarks || null })),
      });
      setEntries([]);
      onDone();
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setErrors(apiError.details);
      setFormError(apiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Mark company labour attendance" description="One entry per worker per day. Re-marking a worker for the same day updates it. Each present day is booked once as labour cost on the task." />
      <CardBody className="space-y-5">
        {formError && <Alert tone="error">{Object.values(errors)[0] || formError.message}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <InputField label="Date" type="date" required value={date} max={today()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        </div>
        <ScopePicker value={scope} onChange={setScope} required={{ project: true, task: true }} errors={errors} />

        <div className="flex flex-wrap items-end gap-2">
          <SelectField label="Add worker" value="" onChange={(e) => addWorker(e.target.value)} className="min-w-[16rem]"
            placeholder={available.length ? 'Select a worker' : 'All workers added'}
            options={available.map((w) => ({ value: String(w.id), label: `${w.name}${w.phone ? ` (${w.phone})` : ''}` }))} />
          <Button type="button" variant="secondary" onClick={addAll} disabled={!available.length}><Plus className="h-4 w-4" aria-hidden="true" /> Add all active</Button>
        </div>
        {errors.entries && <p className="text-sm text-danger">{errors.entries}</p>}

        {entries.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
                <tr><th className="px-3 py-2">Worker</th><th className="px-3 py-2">Attendance</th><th className="px-3 py-2">Daily wage (₹)</th><th className="px-3 py-2">Remarks</th><th className="px-3 py-2 text-right">Amount</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e, i) => (
                  <tr key={e.workerId}>
                    <td className="px-3 py-2"><p className="font-medium text-ink">{e.name}</p><p className="text-[11px] text-ink-subtle">{e.phone || ''}</p></td>
                    <td className="px-3 py-2">
                      <SelectField label="" value={e.status} onChange={(ev) => setEntry(i, 'status', ev.target.value)} options={STATUS_OPTIONS} className="w-44" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="0.01" value={e.dailyWage} onChange={(ev) => setEntry(i, 'dailyWage', ev.target.value)}
                        className="h-9 w-28 rounded-lg border border-line px-2 text-sm" aria-label={`Daily wage for ${e.name}`} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={e.remarks} onChange={(ev) => setEntry(i, 'remarks', ev.target.value)} className="h-9 w-full min-w-[10rem] rounded-lg border border-line px-2 text-sm" aria-label={`Remarks for ${e.name}`} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(({ PRESENT: 1, HALF_DAY: 0.5 }[e.status] || 0) * Number(e.dailyWage || 0))}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setEntries((list) => list.filter((_, j) => j !== i))} className="rounded p-1.5 text-red-500 hover:bg-red-50" aria-label={`Remove ${e.name}`}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-canvas font-semibold"><td className="px-3 py-2" colSpan={4}>Day's labour cost</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={save} isLoading={saving} loadingText="Saving…" disabled={!entries.length}><CalendarCheck className="h-4 w-4" aria-hidden="true" /> Save attendance</Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ register
function RegisterView() {
  const monthStart = today().slice(0, 8) + '01';
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today());
  const [scope, setScope] = useState({ projectId: '', siteId: '', taskId: '', subtaskId: '', areaId: '' });
  const [message, setMessage] = useState(null);
  const load = useCallback(() => labourApi.attendance({
    from: from || undefined, to: to || undefined, projectId: scope.projectId || undefined, siteId: scope.siteId || undefined,
    taskId: scope.taskId || undefined, pageSize: 500,
  }), [from, to, scope.projectId, scope.siteId, scope.taskId]);
  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const records = data?.records || [];

  async function remove(r) {
    if (!window.confirm(`Delete ${r.worker.name}'s attendance on ${formatDate(r.date)}? Its labour cost is removed too.`)) return;
    try {
      await labourApi.deleteAttendance(r.id);
      setMessage({ tone: 'success', text: 'Attendance deleted.' });
      reload();
    } catch (caught) {
      setMessage({ tone: 'error', text: toApiError(caught).message });
    }
  }

  return (
    <Card>
      <CardHeader title="Attendance register" description="Company labour attendance with days and wages." />
      <CardBody className="space-y-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <InputField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <InputField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <ScopePicker value={scope} onChange={setScope} show={{ subtask: false, area: false }} className="grid grid-cols-1 gap-4 sm:grid-cols-3" />
        {error && <Alert tone="error">{error.message}</Alert>}
        {data?.totals && (
          <p className="text-sm text-ink-muted">{records.length} record{records.length === 1 ? '' : 's'} · <strong className="text-ink">{formatNumber(data.totals.days)} days</strong> · <strong className="text-ink">{formatCurrency(data.totals.amount)}</strong></p>
        )}
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Worker</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Project / Site</th><th className="px-3 py-2">Task / Area</th><th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2 text-right">Wage</th><th className="px-3 py-2 text-right">Amount</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-subtle">Loading…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-ink-subtle">No attendance in this period.</td></tr>
              ) : records.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-3 py-2"><p className="font-medium text-ink">{r.worker.name}</p><p className="text-[11px] text-ink-subtle">{r.worker.phone || ''}</p></td>
                  <td className="px-3 py-2"><Badge tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ')}</Badge></td>
                  <td className="px-3 py-2 text-ink-muted">{r.project?.name}{r.site ? ` · ${r.site.name}` : ''}</td>
                  <td className="px-3 py-2 text-ink-muted">{r.task?.name}{r.subtask ? ` › ${r.subtask.name}` : ''}{r.area && <span className="block text-[11px] font-medium text-brand-800">{r.area.name}</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.dailyWage)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(r.amount)}</td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => remove(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50" aria-label="Delete attendance"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
