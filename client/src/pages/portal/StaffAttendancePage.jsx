import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, Pencil, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal';
import { InputField, SelectField, TextAreaField } from '../../components/ui/Field';
import { staffAttendanceApi } from '../../api/staffPortalApi';
import { toApiError } from '../../api/axiosClient';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../config/roles';
import { fmtTime, fmtHours, fmtDay, LEAVE_STATUS_TONE } from './MyPortalPage';

const STATE = {
  working: { label: 'Working', tone: 'brand' },
  present: { label: 'Present', tone: 'positive' },
  half_day: { label: 'Half day', tone: 'warning' },
  on_leave: { label: 'On leave', tone: 'neutral' },
  absent: { label: 'Absent', tone: 'danger' },
};
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hhmm = (v) => (v ? new Date(v).toTimeString().slice(0, 5) : '');

/**
 * Admin / HR: everyone's daily attendance (from "My Portal" check-ins), leave requests to
 * approve or reject, corrections to a day's times, and a monthly report.
 */
export default function StaffAttendancePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'board';
  const setTab = (t) => setParams({ tab: t });
  const tabs = [
    { id: 'board', label: 'Daily attendance' },
    { id: 'leaves', label: 'Leave requests' },
    { id: 'report', label: 'Monthly report' },
  ];

  return (
    <>
      <PageHeader title="Staff Attendance & Leave" description="Everyone's check-in / check-out from My Portal, leave requests and monthly totals." />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'board' && <BoardTab />}
      {tab === 'leaves' && <LeavesTab />}
      {tab === 'report' && <ReportTab />}
    </>
  );
}

function BoardTab() {
  const [date, setDate] = useState(todayLocal());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setError(null);
    staffAttendanceApi.board(date).then(setData).catch((e) => setError(toApiError(e)));
  }, [date]);
  useEffect(load, [load]);

  const people = (data?.people || []).filter((p) => filter === 'all' || p.state === filter || (filter === 'late' && p.attendance?.isLate));
  const s = data?.summary;

  return (
    <Card>
      <CardHeader
        title={data ? `${fmtDay(data.date)}${data.isToday ? ' (today)' : ''}` : 'Attendance'}
        description={s ? `${s.total} people · ${s.working} working now · ${s.present} present · ${s.halfDay} half day · ${s.onLeave} on leave · ${s.absent} not marked · ${s.late} late` : undefined}
        action={(
          <div className="flex items-end gap-2">
            <InputField label="Date" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
            <Button variant="secondary" onClick={load} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        )}
      />
      <CardBody>
        {error && <Alert tone="error" className="mb-3">{error.message}</Alert>}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {['all', 'working', 'present', 'half_day', 'late', 'on_leave', 'absent'].map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line text-ink-muted hover:bg-canvas'}`}>
              {f === 'all' ? 'Everyone' : f === 'late' ? 'Late' : STATE[f].label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
              <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">In</th><th className="px-3 py-2">Out</th><th className="px-3 py-2 text-right">Worked</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-muted">Nobody matches this filter.</td></tr>}
              {people.map((p) => (
                <tr key={p.userId} className="align-top">
                  <td className="px-3 py-2"><p className="font-medium text-ink">{p.name}</p><p className="text-xs text-ink-subtle">{ROLE_LABELS[p.role] || p.role}</p></td>
                  <td className="px-3 py-2">
                    <Badge tone={STATE[p.state].tone}>{STATE[p.state].label}</Badge>
                    {p.attendance?.isLate && <Badge tone="warning" className="ml-1">Late</Badge>}
                    {p.leave && <p className="mt-1 text-xs text-ink-subtle">{p.leave.leaveTypeLabel}{p.leave.halfDay ? ' (half)' : ''}</p>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtTime(p.attendance?.checkInAt)}</td>
                  <td className="px-3 py-2 tabular-nums">{p.attendance?.isOpen ? <span className="text-emerald-700">—</span> : fmtTime(p.attendance?.checkOutAt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtHours(p.attendance?.workMinutes)}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {[p.attendance?.checkInNote, p.attendance?.checkOutNote].filter(Boolean).join(' · ')}
                    {p.attendance?.corrected && <p className="text-ink-subtle">Corrected: {p.attendance.correctionNote}</p>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="xs" variant="secondary" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Correct</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
      {editing && (
        <CorrectModal person={editing} date={data.date} onClose={() => setEditing(null)} onSaved={(d) => { setData(d); setEditing(null); }} />
      )}
    </Card>
  );
}

function CorrectModal({ person, date, onClose, onSaved }) {
  const a = person.attendance;
  const [v, setV] = useState({ status: a?.status === 'absent' ? 'absent' : 'present', check_in: hhmm(a?.checkInAt), check_out: hhmm(a?.checkOutAt), note: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setV((c) => ({ ...c, [k]: e.target.value })); setErrors((c) => ({ ...c, [k]: undefined })); };

  async function save() {
    if (!v.note.trim()) { setErrors({ note: 'Say why the times are being corrected.' }); return; }
    setSaving(true);
    setError(null);
    try {
      onSaved(await staffAttendanceApi.correct(person.userId, date, {
        status: v.status, check_in: v.status === 'absent' ? null : v.check_in || null, check_out: v.status === 'absent' ? null : v.check_out || null, note: v.note.trim(),
      }));
    } catch (e) {
      const apiError = toApiError(e);
      if (apiError.details) setErrors(apiError.details);
      setError(apiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Correct ${person.name}`} description={`${fmtDay(date)} - the change and its reason are recorded.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>Save correction</Button></>}>
      {error && !error.details && <Alert tone="error" className="mb-3">{error.message}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField label="Mark as" value={v.status} onChange={set('status')} options={[{ value: 'present', label: 'Present' }, { value: 'absent', label: 'Absent' }]} />
        <InputField label="Check in" type="time" value={v.check_in} onChange={set('check_in')} error={errors.check_in} disabled={v.status === 'absent'} />
        <InputField label="Check out" type="time" value={v.check_out} onChange={set('check_out')} error={errors.check_out} disabled={v.status === 'absent'} />
        <TextAreaField className="sm:col-span-3" label="Reason" required rows={2} value={v.note} onChange={set('note')} error={errors.note}
          placeholder="e.g. forgot to check out - confirmed with team lead" />
      </div>
    </Modal>
  );
}

function LeavesTab() {
  const { user } = useAuth();
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [deciding, setDeciding] = useState(null); // { leave, decision }

  const load = useCallback(() => {
    staffAttendanceApi.leaves(status).then(setData).catch((e) => setError(toApiError(e)));
  }, [status]);
  useEffect(load, [load]);

  return (
    <Card>
      <CardHeader
        title="Leave requests"
        action={(
          <SelectField value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"
            options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Withdrawn' }, { value: 'all', label: 'All' }]} />
        )}
      />
      <CardBody>
        {error && <Alert tone="error" className="mb-3">{error.message}</Alert>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
              <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Leave</th><th className="px-3 py-2">Dates</th><th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data?.leaves || []).length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-muted">No leave requests here.</td></tr>}
              {(data?.leaves || []).map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-3 py-2"><p className="font-medium text-ink">{l.userName}</p><p className="text-xs text-ink-subtle">{ROLE_LABELS[l.userRole] || l.userRole}</p></td>
                  <td className="px-3 py-2">{l.leaveTypeLabel}{l.halfDay && ' (half day)'}<p className="text-xs text-ink-muted">{l.reason}</p></td>
                  <td className="px-3 py-2">{fmtDay(l.startDate)}{l.endDate !== l.startDate ? ` - ${fmtDay(l.endDate)}` : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.days}</td>
                  <td className="px-3 py-2">
                    <Badge tone={LEAVE_STATUS_TONE[l.status]}>{l.status === 'cancelled' ? 'withdrawn' : l.status}</Badge>
                    {l.decidedBy && <p className="mt-1 text-xs text-ink-subtle">by {l.decidedBy.name}{l.decisionNote ? ` - “${l.decisionNote}”` : ''}</p>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.status === 'pending' && !(Number(l.userId) === Number(user?.id) && user?.role !== 'admin') && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="xs" onClick={() => setDeciding({ leave: l, decision: 'approve' })}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve</Button>
                        <Button size="xs" variant="secondary" onClick={() => setDeciding({ leave: l, decision: 'reject' })}><X className="h-3.5 w-3.5" aria-hidden="true" /> Reject</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
      {deciding && (
        <DecideModal {...deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); load(); }} />
      )}
    </Card>
  );
}

function DecideModal({ leave, decision, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (decision === 'reject' && !note.trim()) { setError({ message: 'Give a reason for rejecting.' }); return; }
    setSaving(true);
    try {
      await staffAttendanceApi.decide(leave.id, decision, note.trim());
      onDone();
    } catch (e) {
      const apiError = toApiError(e);
      setError({ message: apiError.details?.note || apiError.message });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal isOpen onClose={onClose} title={`${decision === 'approve' ? 'Approve' : 'Reject'} leave - ${leave.userName}`}
      description={`${leave.leaveTypeLabel}, ${fmtDay(leave.startDate)}${leave.endDate !== leave.startDate ? ` - ${fmtDay(leave.endDate)}` : ''} (${leave.days} day${leave.days === 1 ? '' : 's'}). They are notified.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>{decision === 'approve' ? 'Approve' : 'Reject'}</Button></>}>
      {error && <Alert tone="error" className="mb-3">{error.message}</Alert>}
      <TextAreaField label={decision === 'reject' ? 'Reason for rejecting' : 'Note (optional)'} required={decision === 'reject'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

function ReportTab() {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    staffAttendanceApi.report(month).then(setData).catch((e) => setError(toApiError(e)));
  }, [month]);

  return (
    <Card>
      <CardHeader title="Monthly report" action={<InputField label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />} />
      <CardBody>
        {error && <Alert tone="error" className="mb-3">{error.message}</Alert>}
        {!data ? <p className="text-sm text-ink-muted">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
                <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2 text-right">Present</th><th className="px-3 py-2 text-right">Half days</th><th className="px-3 py-2 text-right">Late</th><th className="px-3 py-2 text-right">Leave days</th><th className="px-3 py-2 text-right">Hours worked</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.people.map((p) => (
                  <tr key={p.userId}>
                    <td className="px-3 py-2"><p className="font-medium text-ink">{p.name}</p><p className="text-xs text-ink-subtle">{ROLE_LABELS[p.role] || p.role}</p></td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.present}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.halfDays}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.late}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.leaveDays}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHours(p.workMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
