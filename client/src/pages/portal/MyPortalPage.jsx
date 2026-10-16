import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, CalendarPlus, Clock, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal';
import { InputField, SelectField, TextAreaField } from '../../components/ui/Field';
import { myPortalApi } from '../../api/staffPortalApi';
import { toApiError } from '../../api/axiosClient';
import useAuth from '../../hooks/useAuth';

export const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtHours = (min) => {
  if (min == null) return '—';
  const m = Math.max(0, Math.round(Number(min)));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
export const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });
const shiftMonth = (m, by) => {
  const d = new Date(`${m}-01T00:00:00`);
  d.setMonth(d.getMonth() + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const LEAVE_STATUS_TONE = { pending: 'warning', approved: 'positive', rejected: 'danger', cancelled: 'neutral' };
export const ATT_STATUS = {
  present: { label: 'Present', tone: 'positive' },
  half_day: { label: 'Half day', tone: 'warning' },
  absent: { label: 'Absent', tone: 'danger' },
};

/**
 * "My Portal" - for EVERY signed-in user, whatever their role: mark today's attendance
 * (check in / check out; the time is captured by the server, not this device), see the
 * month, and apply for / withdraw leave. Admin and HR are notified of each leave request.
 */
export default function MyPortalPage() {
  const { user } = useAuth();
  const [today, setToday] = useState(null);
  const [month, setMonth] = useState(null);
  const [monthKey, setMonthKey] = useState(null);
  const [leaves, setLeaves] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [applying, setApplying] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const loadToday = useCallback(() => myPortalApi.today().then((d) => {
    setToday(d);
    setMonthKey((k) => k || d.date.slice(0, 7));
  }).catch((e) => setError(toApiError(e))), []);
  const loadLeaves = useCallback(() => myPortalApi.leaves().then(setLeaves).catch(() => setLeaves({ leaves: [], takenThisYear: {} })), []);

  useEffect(() => { loadToday(); loadLeaves(); }, [loadToday, loadLeaves]);
  useEffect(() => {
    if (!monthKey) return;
    myPortalApi.month(monthKey).then(setMonth).catch(() => setMonth(null));
  }, [monthKey, today]);

  async function mark(kind) {
    setBusy(kind);
    setError(null);
    setFlash(null);
    try {
      const d = kind === 'in' ? await myPortalApi.checkIn(note) : await myPortalApi.checkOut(note);
      setToday(d);
      setNote('');
      setFlash(kind === 'in'
        ? `Checked in at ${fmtTime(d.attendance?.checkInAt)}${d.attendance?.isLate ? ' (late)' : ''}.`
        : `Checked out at ${fmtTime(d.attendance?.checkOutAt)} - ${fmtHours(d.attendance?.workMinutes)} today.`);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(leave) {
    if (!window.confirm(`Withdraw your ${leave.leaveTypeLabel.toLowerCase()} for ${fmtDay(leave.startDate)}?`)) return;
    try {
      setLeaves(await myPortalApi.cancelLeave(leave.id));
      loadToday();
      setFlash('Leave withdrawn.');
    } catch (e) {
      setError(toApiError(e));
    }
  }

  if (!today && !error) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const att = today?.attendance;
  const liveMinutes = att?.isOpen ? Math.max(0, Math.round((now - new Date(att.checkInAt)) / 60000)) : att?.workMinutes;
  const fullDayLeave = today?.onLeave && !today.onLeave.halfDay;
  const s = month?.summary;

  return (
    <>
      <PageHeader
        title="My Portal"
        description={`${user?.fullName ? `Hi ${user.fullName.trim()} - ` : ''}mark your attendance and manage your leave.`}
      />

      {error && <Alert tone="error" className="mb-4" title="Could not complete that">{error.message}</Alert>}
      {flash && <Alert tone="positive" className="mb-4">{flash}</Alert>}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Today's attendance"
            description={`${fmtDay(today.date)} · office starts ${today.rules.workStart}, late after ${today.rules.lateAfter}`}
          />
          <CardBody>
            {fullDayLeave ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4 text-sm text-brand-900">
                You are on approved <strong>{today.onLeave.leaveTypeLabel.toLowerCase()}</strong> today.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-line bg-canvas/60 p-3">
                    <p className="text-xs text-ink-subtle">Checked in</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-ink">{fmtTime(att?.checkInAt)}</p>
                    {att?.isLate && <Badge tone="warning" className="mt-1">Late</Badge>}
                  </div>
                  <div className="rounded-lg border border-line bg-canvas/60 p-3">
                    <p className="text-xs text-ink-subtle">Checked out</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-ink">{fmtTime(att?.checkOutAt)}</p>
                  </div>
                  <div className="rounded-lg border border-line bg-canvas/60 p-3">
                    <p className="text-xs text-ink-subtle">{att?.isOpen ? 'Working for' : 'Worked'}</p>
                    <p className={`mt-1 text-lg font-bold tabular-nums ${att?.isOpen ? 'text-emerald-700' : 'text-ink'}`}>{fmtHours(liveMinutes)}</p>
                  </div>
                </div>

                {!att?.checkOutAt && (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <InputField
                      className="min-w-[220px] flex-1"
                      label="Note (optional)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={att?.checkInAt ? 'e.g. leaving early for site visit' : 'e.g. working from site today'}
                      maxLength={255}
                    />
                    {!att?.checkInAt ? (
                      <Button size="lg" onClick={() => mark('in')} isLoading={busy === 'in'} loadingText="Checking in…">
                        <LogIn className="h-4 w-4" aria-hidden="true" /> Check in
                      </Button>
                    ) : (
                      <Button size="lg" onClick={() => mark('out')} isLoading={busy === 'out'} loadingText="Checking out…">
                        <LogOut className="h-4 w-4" aria-hidden="true" /> Check out
                      </Button>
                    )}
                  </div>
                )}
                {att?.checkOutAt && (
                  <p className="mt-4 text-sm text-ink-muted">
                    Day complete{att.status === 'half_day' ? ' - counted as a half day' : ''}. See you tomorrow.
                  </p>
                )}
                {today.onLeave?.halfDay && (
                  <p className="mt-3 text-xs text-brand-800">You have an approved half-day leave today.</p>
                )}
              </>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-subtle">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Times are recorded by the server clock ({today.timeZone}), not this device.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Leave"
            action={<Button size="sm" onClick={() => setApplying(true)}><CalendarPlus className="h-4 w-4" aria-hidden="true" /> Apply</Button>}
          />
          <CardBody className="space-y-2 text-sm">
            {today.upcomingLeaves.length === 0 ? (
              <p className="text-ink-muted">No upcoming leave.</p>
            ) : today.upcomingLeaves.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2">
                <span className="text-ink">{fmtDay(l.startDate)}{l.endDate !== l.startDate ? ` - ${fmtDay(l.endDate)}` : ''}</span>
                <Badge tone={LEAVE_STATUS_TONE[l.status]}>{l.status}</Badge>
              </div>
            ))}
            {leaves && Object.keys(leaves.takenThisYear || {}).length > 0 && (
              <div className="border-t border-line pt-2 text-xs text-ink-muted">
                <p className="mb-1 font-semibold text-ink">Taken this year</p>
                {Object.entries(leaves.takenThisYear).map(([t, d]) => (
                  <p key={t}>{leaves.leaveTypes?.[t] || t}: {d} day{d === 1 ? '' : 's'}</p>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader
          title={monthKey ? monthLabel(monthKey) : 'This month'}
          description={s ? `${s.present} present · ${s.halfDays} half day${s.halfDays === 1 ? '' : 's'} · ${s.late} late · ${s.leaveDays} leave day${s.leaveDays === 1 ? '' : 's'} · ${fmtHours(s.workMinutes)} worked` : undefined}
          action={(
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => setMonthKey((m) => shiftMonth(m, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="secondary" onClick={() => setMonthKey((m) => shiftMonth(m, 1))} disabled={monthKey >= today.date.slice(0, 7)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
              <tr><th className="px-4 py-2">Day</th><th className="px-4 py-2">In</th><th className="px-4 py-2">Out</th><th className="px-4 py-2 text-right">Worked</th><th className="px-4 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(month?.records || []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">No attendance marked in this month.</td></tr>
              )}
              {(month?.records || []).slice().reverse().map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{fmtDay(r.date)}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtTime(r.checkInAt)}{r.isLate && <Badge tone="warning" className="ml-2">Late</Badge>}</td>
                  <td className="px-4 py-2 tabular-nums">{r.isOpen ? <span className="text-emerald-700">working</span> : fmtTime(r.checkOutAt)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtHours(r.workMinutes)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={ATT_STATUS[r.status]?.tone ?? 'neutral'}>{ATT_STATUS[r.status]?.label ?? r.status}</Badge>
                    {r.corrected && <span className="ml-2 text-xs text-ink-subtle" title={r.correctionNote || ''}>corrected</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="My leave applications" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
              <tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Dates</th><th className="px-4 py-2 text-right">Days</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(leaves?.leaves || []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">You have not applied for leave yet.</td></tr>
              )}
              {(leaves?.leaves || []).map((l) => {
                const canWithdraw = l.status === 'pending' || (l.status === 'approved' && l.startDate > today.date);
                return (
                  <tr key={l.id} className="align-top">
                    <td className="px-4 py-2">{l.leaveTypeLabel}{l.halfDay && ' (half day)'}<p className="text-xs text-ink-subtle">{l.reason}</p></td>
                    <td className="px-4 py-2">{fmtDay(l.startDate)}{l.endDate !== l.startDate ? ` - ${fmtDay(l.endDate)}` : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.days}</td>
                    <td className="px-4 py-2">
                      <Badge tone={LEAVE_STATUS_TONE[l.status]}>{l.status}</Badge>
                      {l.decisionNote && <p className="mt-1 text-xs text-ink-muted">“{l.decisionNote}”{l.decidedBy?.name ? ` - ${l.decidedBy.name}` : ''}</p>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canWithdraw && <Button size="xs" variant="secondary" onClick={() => withdraw(l)}>Withdraw</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {applying && (
        <ApplyLeaveModal
          leaveTypes={today.leaveTypes}
          defaultDate={today.date}
          onClose={() => setApplying(false)}
          onApplied={(d) => { setLeaves(d); setApplying(false); loadToday(); setFlash('Leave applied - Admin and HR have been notified.'); }}
        />
      )}
    </>
  );
}

function ApplyLeaveModal({ leaveTypes, defaultDate, onClose, onApplied }) {
  const [v, setV] = useState({ leave_type: 'casual', start_date: defaultDate, end_date: defaultDate, half_day: false, reason: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setV((c) => ({ ...c, [k]: val })); setErrors((c) => ({ ...c, [k]: undefined })); };
  const days = v.half_day ? 0.5 : (v.start_date && v.end_date && v.end_date >= v.start_date
    ? Math.round((Date.parse(v.end_date) - Date.parse(v.start_date)) / 86400000) + 1 : 0);

  async function submit() {
    const errs = {};
    if (!v.start_date) errs.start_date = 'Enter the first day.';
    if (!v.half_day && (!v.end_date || v.end_date < v.start_date)) errs.end_date = 'The last day cannot be before the first day.';
    if (!v.reason.trim()) errs.reason = 'Give a reason.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setError(null);
    try {
      onApplied(await myPortalApi.applyLeave({ ...v, end_date: v.half_day ? v.start_date : v.end_date, reason: v.reason.trim() }));
    } catch (e) {
      const apiError = toApiError(e);
      if (apiError.details) setErrors(apiError.details);
      setError(apiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Apply for leave" description="Admin and HR are notified and decide it."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} isLoading={saving}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Apply{days ? ` for ${days} day${days === 1 ? '' : 's'}` : ''}</Button></>}>
      {error && !error.details && <Alert tone="error" className="mb-3">{error.message}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField className="sm:col-span-2" label="Leave type" required value={v.leave_type} onChange={set('leave_type')} error={errors.leave_type}
          options={Object.entries(leaveTypes || {}).map(([value, label]) => ({ value, label }))} />
        <InputField label="From" type="date" required value={v.start_date} onChange={set('start_date')} error={errors.start_date} />
        <InputField label="To" type="date" required={!v.half_day} disabled={v.half_day} value={v.half_day ? v.start_date : v.end_date} min={v.start_date} onChange={set('end_date')} error={errors.end_date} />
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" checked={v.half_day} onChange={set('half_day')} /> Half day only
        </label>
        <TextAreaField className="sm:col-span-2" label="Reason" required rows={3} value={v.reason} onChange={set('reason')} error={errors.reason} />
      </div>
    </Modal>
  );
}
