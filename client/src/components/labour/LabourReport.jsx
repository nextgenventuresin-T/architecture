import { useCallback, useState } from 'react';
import { Download, Search, Users } from 'lucide-react';
import { Card, CardBody } from '../ui/Card';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { InputField, SelectField } from '../ui/Field';
import ScopePicker from './ScopePicker';
import useAsync from '../../hooks/useAsync';
import { labourApi } from '../../api/labourApi';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';

const EMPTY_SCOPE = { projectId: '', siteId: '', taskId: '', subtaskId: '', areaId: '' };

/**
 * Project / site-wise labour report: who worked on which task and area, on which
 * dates, days worked, daily wage and total. Reads the same labour ledger as the
 * finance totals, so it always reconciles with them.
 *
 * mode="admin"      : every worker, company labour and contractor workers.
 * mode="contractor" : the contractor's own sites; company-labour wages are hidden.
 */
export default function LabourReport({ mode = 'admin' }) {
  const isContractor = mode === 'contractor';
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [kind, setKind] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    const params = {
      projectId: scope.projectId || undefined, siteId: scope.siteId || undefined, taskId: scope.taskId || undefined,
      areaId: scope.areaId || undefined, workerKind: kind, from: from || undefined, to: to || undefined, search: search.trim() || undefined,
    };
    return isContractor ? labourApi.myReport(params) : labourApi.report(params);
  }, [scope.projectId, scope.siteId, scope.taskId, scope.areaId, kind, from, to, search, isContractor]);
  const { data, isLoading, error } = useAsync(load, [load]);
  const rows = (data?.rows || []).filter((r) => !scope.subtaskId || String(r.subtask?.id) === String(scope.subtaskId));
  const totals = data?.totals;

  function exportCsv() {
    const head = ['Worker', 'Phone', 'Type', 'Project', 'Site', 'Task', 'Subtask', 'Area', 'Dates', 'Days worked', 'Daily wage', 'Total'];
    const lines = rows.map((r) => [
      r.workerName, r.phone || '', r.kindLabel, r.project?.name || '', r.site?.name || '', r.task?.name || '', r.subtask?.name || '',
      r.area?.name || '', r.dates.join(' '), r.daysWorked, r.dailyWage ?? '', r.wages ?? '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `labour_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <ScopePicker value={scope} onChange={setScope} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {!isContractor && (
              <SelectField label="Workers" value={kind} onChange={(e) => setKind(e.target.value)}
                options={[{ value: 'all', label: 'All workers' }, { value: 'company', label: 'Company labour' }, { value: 'contractor', label: 'Contractor workers' }]} />
            )}
            {isContractor && (
              <SelectField label="Workers" value={kind} onChange={(e) => setKind(e.target.value)}
                options={[{ value: 'all', label: 'All workers' }, { value: 'contractor', label: 'My workers' }, { value: 'company', label: 'Company labour' }]} />
            )}
            <InputField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <InputField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-ink">Search worker</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone"
                  className="h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {error && <Alert tone="error" title="Could not load the labour report">{error.message}</Alert>}

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Workers" value={formatNumber(totals.workers)} />
          <Tile label="Days worked" value={formatNumber(totals.daysWorked)} />
          {isContractor ? (
            <Tile label="My workers' wages" value={formatCurrency(totals.contractorWages)} />
          ) : (
            <>
              <Tile label="Company labour cost" value={formatCurrency(totals.companyWages)} />
              <Tile label="Contractor labour cost" value={formatCurrency(totals.contractorWages)} />
            </>
          )}
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">{rows.length} worker-task line{rows.length === 1 ? '' : 's'}</p>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
          </Button>
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-ink-subtle">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-ink-muted">
            <Users className="h-8 w-8 text-ink-subtle" aria-hidden="true" />
            No labour recorded for these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas text-[11px] uppercase text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Project / Site</th>
                  <th className="px-3 py-2">Task / Area</th>
                  <th className="px-3 py-2">Attendance</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2 text-right">Daily wage</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={`${r.workerId}-${r.workerName}-${r.task?.id}-${r.subtask?.id}-${r.area?.id}-${i}`} className="align-top">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-ink">{r.workerName}</p>
                      <p className="text-[11px] text-ink-subtle">{[r.phone, r.trade].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.kind === 'company' ? 'brand' : 'neutral'}>{r.kindLabel}</Badge>
                      {r.pendingAttendance && <p className="mt-1 text-[10px] text-amber-700">Awaiting Admin attendance</p>}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      <p>{r.project?.name || '—'}</p>
                      <p className="text-[11px] text-ink-subtle">{r.site?.name || ''}</p>
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      <p>{r.task?.name || '—'}{r.subtask ? ` › ${r.subtask.name}` : ''}</p>
                      {r.area && <p className="text-[11px] font-medium text-brand-800">{r.area.name}</p>}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      <p>{formatDate(r.firstDate)}{r.lastDate && r.lastDate !== r.firstDate ? ` – ${formatDate(r.lastDate)}` : ''}</p>
                      <p className="text-[11px] text-ink-subtle">{r.dates.length} day{r.dates.length === 1 ? '' : 's'} present</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{formatNumber(r.daysWorked)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{r.dailyWage != null ? formatCurrency(r.dailyWage) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">
                      {r.wages != null ? formatCurrency(r.wages) : '—'}
                      {r.wages != null && r.dailyWage != null && r.daysWorked > 0 && (
                        <span className="block text-[10px] font-normal text-ink-subtle">{formatNumber(r.daysWorked)} × {formatCurrency(r.dailyWage)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </Card>
  );
}
