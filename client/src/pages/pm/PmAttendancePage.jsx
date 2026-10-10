import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import { SelectField, InputField } from '../../components/ui/Field';
import { pmApi } from '../../api/pmApi';
import { toApiError } from '../../api/axiosClient';
import { formatDate } from '../../utils/format';

const STATUSES = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LEAVE', label: 'Leave' },
];
const TONE = { PRESENT: 'positive', HALF_DAY: 'warning', ABSENT: 'danger', LEAVE: 'neutral' };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Labour attendance / workdays at the Project Manager's ASSIGNED sites. The workers listed are the
 * labour of the contractor responsible for the chosen site; the server rejects anything else.
 */
export default function PmAttendancePage() {
  const [scope, setScope] = useState({ projects: [] });
  const [projectId, setProjectId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [date, setDate] = useState(today());
  const [workers, setWorkers] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    pmApi.scope().then(setScope).catch((e) => setError(toApiError(e))).finally(() => setLoading(false));
  }, []);

  const project = scope.projects.find((p) => String(p.id) === String(projectId));
  const site = project?.sites.find((s) => String(s.id) === String(siteId));

  const loadSiteData = useCallback(() => {
    if (!projectId || !siteId) { setWorkers([]); setRecords([]); return; }
    pmApi.workers({ projectId, siteId }).then((d) => setWorkers(d.workers || [])).catch((e) => setError(toApiError(e)));
    pmApi.attendance({ projectId, siteId, date, pageSize: 100 }).then((d) => setRecords(d.records || [])).catch(() => setRecords([]));
  }, [projectId, siteId, date]);

  useEffect(loadSiteData, [loadSiteData]);

  const recorded = useMemo(() => {
    const map = new Map();
    records.forEach((r) => { if (r.worker?.id) map.set(r.worker.id, r); });
    return map;
  }, [records]);

  async function mark(worker) {
    setError(null);
    setFlash(null);
    setSavingId(worker.id);
    try {
      await pmApi.markAttendance({
        contractorWorkerId: worker.id,
        projectId: Number(projectId),
        siteId: Number(siteId),
        taskId: taskId ? Number(taskId) : undefined,
        date,
        status: statuses[worker.id] || 'PRESENT',
      });
      setFlash(`Attendance recorded for ${worker.name}.`);
      loadSiteData();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Labour Attendance"
        description="Record workdays for the contractor labour at your assigned sites. Each entry is linked to you, the project, site, task and contractor."
      />
      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}
      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}

      <Card>
        <CardHeader title="Where and when" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <SelectField
            label="Project"
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setSiteId(''); setTaskId(''); }}
            placeholder={loading ? 'Loading…' : scope.projects.length ? 'Select project' : 'No projects assigned to you'}
            options={scope.projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
          />
          <SelectField
            label="Site"
            value={siteId}
            onChange={(e) => { setSiteId(e.target.value); setTaskId(''); }}
            disabled={!project}
            placeholder={project ? 'Select site' : 'Select project first'}
            options={(project?.sites ?? []).map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <SelectField
            label="Task (optional)"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={!site}
            placeholder="No specific task"
            options={(site?.tasks ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
          />
          <InputField label="Date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </CardBody>
      </Card>

      {site && (
        <Card className="mt-6">
          <CardHeader
            title={`Workers — ${site.contractor?.name ?? 'no contractor assigned to this site'}`}
            description="Only the labour of the contractor responsible for this site can be marked."
          />
          <CardBody>
            {workers.length === 0 ? (
              <p className="text-sm text-ink-subtle">No active workers are registered for the contractor of this site.</p>
            ) : (
              <ul className="divide-y divide-line">
                {workers.map((w) => {
                  const rec = recorded.get(w.id);
                  return (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium text-ink">{w.name}</p>
                        <p className="text-xs text-ink-subtle">{w.skillCategory}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {rec && <Badge tone={TONE[rec.status] ?? 'neutral'}>{rec.status.replace('_', ' ')} · recorded</Badge>}
                        <select
                          value={statuses[w.id] || rec?.status || 'PRESENT'}
                          onChange={(e) => setStatuses((c) => ({ ...c, [w.id]: e.target.value }))}
                          className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
                          aria-label={`Status for ${w.name}`}
                        >
                          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <Button size="sm" isLoading={savingId === w.id} onClick={() => mark(w)}>
                          <Check className="mr-1 h-4 w-4" /> {rec ? 'Update' : 'Record'}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {records.length > 0 && (
        <Card className="mt-6">
          <CardHeader title={`Recorded on ${formatDate(date)}`} icon={CalendarCheck} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas-subtle text-xs uppercase text-ink-subtle">
                <tr>
                  <th className="px-5 py-2.5">Worker</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Task</th>
                  <th className="px-5 py-2.5">Contractor</th>
                  <th className="px-5 py-2.5">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5 text-ink">{r.worker?.name}</td>
                    <td className="px-5 py-2.5"><Badge tone={TONE[r.status] ?? 'neutral'}>{r.status.replace('_', ' ')}</Badge></td>
                    <td className="px-5 py-2.5 text-ink-muted">{r.task?.name ?? '—'}</td>
                    <td className="px-5 py-2.5 text-ink-muted">{r.contractor?.name ?? '—'}</td>
                    <td className="px-5 py-2.5 text-ink-muted">{r.recordedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {loading && <Skeleton className="mt-6 h-24 w-full" />}
    </>
  );
}
