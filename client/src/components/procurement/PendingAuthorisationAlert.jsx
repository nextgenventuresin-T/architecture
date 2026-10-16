import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, X } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { procurementApi } from '../../api/procurementApi';
import { formatNumber, formatDate } from '../../utils/format';

const ROLE_LABEL = { contractor: 'Contractor', project_manager: 'Project Manager' };

/** Unplanned = not in the task plan at all; Excess = more than the plan allows. */
function kindOf(row) {
  if (row.isExcess && Number(row.plannedQuantityAtRequest || 0) === 0) return { label: 'Unplanned', tone: 'danger' };
  if (row.isExcess) return { label: 'Over plan', tone: 'warning' };
  return { label: 'Approval', tone: 'neutral' };
}

/**
 * Admin's alert on the Procurement page: every request waiting for Admin's decision,
 * unplanned material first. Granting it moves the request to Approved, so the
 * procurement flows on (order / dispatch / fulfil); rejecting it stops it.
 */
export default function PendingAuthorisationAlert({ modulePath, onDecided }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(() => {
    procurementApi
      .list({ status: 'pending_approval', pageSize: 50 })
      .then((data) => {
        const list = data?.requests ?? [];
        const rank = (r) => (kindOf(r).label === 'Unplanned' ? 0 : kindOf(r).label === 'Over plan' ? 1 : 2);
        setRows([...list].sort((a, b) => rank(a) - rank(b)));
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  async function decide(row, status) {
    if (status === 'rejected' && !window.confirm(`Reject ${row.requestNumber}? It will not be procured.`)) return;
    setBusy(`${row.id}:${status}`);
    setMessage(null);
    try {
      await procurementApi.updateStatus(row.id, status);
      setMessage({
        tone: 'ok',
        text: status === 'approved'
          ? `${row.requestNumber} authorised - procurement can now proceed.`
          : `${row.requestNumber} rejected.`,
      });
      load();
      onDecided?.();
    } catch (err) {
      setMessage({ tone: 'error', text: err.response?.data?.error?.message || err.message });
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0 && !message) return null;

  const unplannedCount = rows.filter((r) => kindOf(r).label === 'Unplanned').length;

  return (
    <section
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50/70 p-4"
      aria-label="Procurement requests awaiting authorisation"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-900">
            {rows.length} request{rows.length === 1 ? '' : 's'} awaiting your authorisation
            {unplannedCount > 0 && ` · ${unplannedCount} unplanned`}
          </h2>
          <p className="text-xs text-amber-800">
            Nothing here can be ordered, dispatched or received until you grant it.
          </p>
        </div>
      </div>

      {message && (
        <p className={`mt-3 text-xs font-medium ${message.tone === 'error' ? 'text-danger' : 'text-emerald-700'}`}>{message.text}</p>
      )}

      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-amber-200 overflow-hidden rounded-lg border border-amber-200 bg-white">
          {rows.map((row) => {
            const kind = kindOf(row);
            const item = row.tool?.name || row.material?.name || '—';
            const where = [row.project?.name, row.task?.name, row.subtask?.name].filter(Boolean).join(' › ');
            return (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                    <Link to={`${modulePath}/${row.id}`} className="text-sm font-semibold text-ink hover:text-brand-700 hover:underline">
                      {row.requestNumber}
                    </Link>
                    <span className="text-sm text-ink">
                      {formatNumber(row.quantity)} {row.unit} {item}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {where || 'No task'}
                    {row.requesterRole && ` · Raised by ${ROLE_LABEL[row.requesterRole] || row.requesterRole}`}
                    {row.responsibleContractor?.name && ` (${row.responsibleContractor.name})`}
                    {row.createdAt && ` · ${formatDate(row.createdAt)}`}
                  </p>
                  {kind.label === 'Over plan' && (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Planned {formatNumber(row.plannedQuantityAtRequest)} · already requested {formatNumber(row.procuredQuantityAtRequest)} · extra {formatNumber(row.excessQuantity)} {row.unit}
                    </p>
                  )}
                  {row.excessReason && (
                    <p className="mt-1 text-xs text-ink"><span className="font-medium">Reason:</span> {row.excessReason}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="xs"
                    onClick={() => decide(row, 'approved')}
                    isLoading={busy === `${row.id}:approved`}
                    disabled={Boolean(busy)}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Grant
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => decide(row, 'rejected')}
                    isLoading={busy === `${row.id}:rejected`}
                    disabled={Boolean(busy)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
