import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, UserPlus, Send, Eye, Users, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { hrApi } from '../../api/hrApi';
import { contractorsApi } from '../../api/contractorsApi';
import { toApiError } from '../../api/axiosClient';
import { formatDate } from '../../utils/format';
import {
  LABOUR_REQUEST_STATUS_LABELS,
  LABOUR_REQUEST_STATUS_TONE,
  PRIORITY_TONE,
  REQUEST_TRANSITIONS,
} from '../../utils/hrOptions';
import useAuth from '../../hooks/useAuth';
import useAsync from '../../hooks/useAsync';
import { ROLES } from '../../config/roles';

/**
 * Full lifecycle modal for a Labour Request.
 *
 * Workflow actions available per role:
 *   CONTRACTOR / requester  → submit (DRAFT), cancel (own DRAFT/SUBMITTED)
 *   HR                      → review, approve/reject (with note), assign worker,
 *                             complete, cancel
 *   ADMIN                   → all of the above
 *
 * Assign-worker panel lets HR/Admin pick from contractor workers scoped to the
 * request's contractor (if contractor-type) and specify how many of the
 * outstanding quantity this worker covers (partial or full fulfilment).
 */
export default function LabourRequestDetailModal({ requestId, onClose }) {
  const { user } = useAuth();
  const isHrOrAdmin = [ROLES.ADMIN, ROLES.HR].includes(user?.role);

  const load = useCallback(
    () => hrApi.requests.detail(requestId),
    [requestId]
  );
  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const request = data?.request;
  const fulfilments = data?.fulfilments ?? [];

  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(null);   // which action is in flight
  const [decisionNote, setDecisionNote] = useState('');
  const [showDecision, setShowDecision] = useState(null);  // 'approve' | 'reject'
  const [showAssign, setShowAssign] = useState(false);

  // Assign-worker state
  const [contractors, setContractors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [assignValues, setAssignValues] = useState({
    contractorId: '',
    contractorWorkerId: '',
    quantityFulfilled: 1,
    notes: '',
  });

  // Load contractors list once for assign panel
  useEffect(() => {
    if (!showAssign || !isHrOrAdmin) return;
    contractorsApi.list({ pageSize: 50 })
      .then((d) => setContractors(d.contractors ?? []))
      .catch(() => setContractors([]));
  }, [showAssign, isHrOrAdmin]);

  // Load workers when contractor is selected in assign panel
  useEffect(() => {
    if (!assignValues.contractorId) { setWorkers([]); return undefined; }
    let active = true;
    hrApi.workers.list({ contractorId: assignValues.contractorId, pageSize: 100, status: 'active' })
      .then((d) => active && setWorkers(d.workers ?? []))
      .catch(() => active && setWorkers([]));
    return () => { active = false; };
  }, [assignValues.contractorId]);

  // Reset assign panel when opened
  useEffect(() => {
    if (showAssign) {
      const remaining = request ? request.quantity - (request.quantityFulfilled ?? 0) : 1;
      setAssignValues({ contractorId: '', contractorWorkerId: '', quantityFulfilled: remaining > 0 ? remaining : 1, notes: '' });
    }
  }, [showAssign, request]);

  async function doAction(actionName, apiFn) {
    setActionError(null);
    setBusy(actionName);
    try {
      await apiFn();
      await reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleDecision() {
    if (!decisionNote.trim() && showDecision === 'reject') {
      setActionError({ message: 'A decision note is required when rejecting.' });
      return;
    }
    const apiFn = showDecision === 'approve'
      ? () => hrApi.requests.approve(requestId, decisionNote)
      : () => hrApi.requests.reject(requestId, decisionNote);
    await doAction(showDecision, apiFn);
    setShowDecision(null);
    setDecisionNote('');
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assignValues.contractorWorkerId) {
      setActionError({ message: 'Select a worker to assign.' });
      return;
    }
    setActionError(null);
    setBusy('assign');
    try {
      await hrApi.requests.assignWorker(requestId, {
        contractorWorkerId: Number(assignValues.contractorWorkerId),
        quantityFulfilled: Number(assignValues.quantityFulfilled),
        notes: assignValues.notes || null,
      });
      setShowAssign(false);
      await reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  const status = request?.status;
  const transitions = REQUEST_TRANSITIONS[status] ?? [];
  const canSubmit = transitions.includes('SUBMITTED') && (user?.role === ROLES.CONTRACTOR || isHrOrAdmin);
  const canReview = transitions.includes('UNDER_REVIEW') && isHrOrAdmin;
  const canApprove = transitions.includes('APPROVED') && isHrOrAdmin;
  const canReject = transitions.includes('REJECTED') && isHrOrAdmin;
  const canAssign = (transitions.includes('PARTIALLY_ASSIGNED') || transitions.includes('FULLY_ASSIGNED')) && isHrOrAdmin;
  const canComplete = transitions.includes('COMPLETED') && isHrOrAdmin;
  const canCancel = transitions.includes('CANCELLED') && (isHrOrAdmin || user?.role === ROLES.CONTRACTOR);

  const remaining = request ? Math.max(0, request.quantity - (request.quantityFulfilled ?? 0)) : 0;

  return (
    <Modal
      isOpen={Boolean(requestId)}
      onClose={onClose}
      title={isLoading ? 'Loading…' : (request?.title ?? 'Labour Request')}
      description={request ? `${request.requestNumber} · Created ${formatDate(request.createdAt)}` : undefined}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>Close</Button>
      }
    >
      {isLoading && (
        <p className="py-8 text-center text-sm text-ink-subtle">Loading request details…</p>
      )}

      {!isLoading && error && (
        <Alert tone="error" title="Could not load this request">{error.message}</Alert>
      )}

      {actionError && (
        <Alert tone="error" title="Action failed" className="mb-4">{actionError.message}</Alert>
      )}

      {!isLoading && request && (
        <div className="space-y-6">

          {/* ── Status + meta row ── */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={LABOUR_REQUEST_STATUS_TONE[status] ?? 'neutral'} className="text-sm">
              {LABOUR_REQUEST_STATUS_LABELS[status] ?? status}
            </Badge>
            <Badge tone={PRIORITY_TONE[request.priority] ?? 'neutral'}>
              {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)} priority
            </Badge>
            {request.labourType && (
              <Badge tone={request.labourType === 'company' ? 'brand' : 'warning'}>
                {request.labourType === 'company' ? 'Company labour' : 'Contractor labour'}
              </Badge>
            )}
          </div>

          {/* ── Details grid ── */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Detail label="Project"      value={request.project?.name ?? '—'} />
            <Detail label="Site"         value={request.site?.name ?? '—'} />
            <Detail label="Skill"        value={request.skillCategory ?? '—'} />
            <Detail label="Qty required" value={request.quantity} />
            <Detail label="Qty fulfilled" value={request.quantityFulfilled ?? 0} />
            <Detail label="Qty remaining" value={remaining} />
            <Detail label="Required from" value={request.requiredFrom ? formatDate(request.requiredFrom) : '—'} />
            <Detail label="Required to"   value={request.requiredTo   ? formatDate(request.requiredTo)   : '—'} />
          </dl>

          {request.description && (
            <p className="rounded-lg bg-surface px-4 py-3 text-sm text-ink-muted">
              {request.description}
            </p>
          )}

          {request.decisionNote && (
            <div className="rounded-lg border border-line bg-surface px-4 py-3">
              <p className="mb-1 text-xs font-medium text-ink-subtle uppercase tracking-wide">Decision note</p>
              <p className="text-sm text-ink">{request.decisionNote}</p>
            </div>
          )}

          {/* ── Fulfilments list ── */}
          {fulfilments.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-ink flex items-center gap-2">
                <Users className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                Workers assigned so far
              </h4>
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface text-left text-xs text-ink-muted">
                      <th className="px-4 py-2 font-medium">Worker</th>
                      <th className="px-4 py-2 font-medium">Contractor</th>
                      <th className="px-4 py-2 font-medium text-right">Qty</th>
                      <th className="px-4 py-2 font-medium">Assigned on</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {fulfilments.map((f) => (
                      <tr key={f.id}>
                        <td className="px-4 py-2.5 text-ink">{f.worker?.fullName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{f.worker?.contractorName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{f.quantityFulfilled}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{formatDate(f.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Decision panel (approve / reject) ── */}
          {showDecision && (
            <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
              <p className="text-sm font-medium text-ink">
                {showDecision === 'approve' ? 'Approve this request?' : 'Reject this request?'}
              </p>
              <TextAreaField
                label="Decision note"
                required={showDecision === 'reject'}
                hint={showDecision === 'approve' ? 'Optional' : 'Required for rejection'}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={2}
                placeholder="Add any notes for the requester…"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => { setShowDecision(null); setDecisionNote(''); }}
                >
                  Cancel
                </Button>
                <Button
                  tone={showDecision === 'approve' ? 'default' : 'danger'}
                  onClick={handleDecision}
                  isLoading={busy === showDecision}
                  loadingText={showDecision === 'approve' ? 'Approving…' : 'Rejecting…'}
                >
                  {showDecision === 'approve' ? 'Confirm approve' : 'Confirm reject'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Assign-worker panel ── */}
          {showAssign && isHrOrAdmin && (
            <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
              <p className="text-sm font-medium text-ink">
                Assign a worker ({remaining} remaining)
              </p>
              <form className="space-y-3" onSubmit={handleAssign}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Contractor"
                    required
                    value={assignValues.contractorId}
                    onChange={(e) =>
                      setAssignValues((v) => ({ ...v, contractorId: e.target.value, contractorWorkerId: '' }))
                    }
                    placeholder="Select a contractor"
                    options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                  <SelectField
                    label="Worker"
                    required
                    value={assignValues.contractorWorkerId}
                    onChange={(e) =>
                      setAssignValues((v) => ({ ...v, contractorWorkerId: e.target.value }))
                    }
                    placeholder={!assignValues.contractorId ? 'Select contractor first' : 'Select a worker'}
                    disabled={!assignValues.contractorId}
                    options={workers.map((w) => ({
                      value: String(w.id),
                      label: `${w.fullName} — ${w.skillCategory}`,
                    }))}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InputField
                    label="Quantity fulfilled by this worker"
                    type="number"
                    min="1"
                    max={remaining}
                    required
                    value={assignValues.quantityFulfilled}
                    onChange={(e) =>
                      setAssignValues((v) => ({ ...v, quantityFulfilled: e.target.value }))
                    }
                    hint={`Max ${remaining}`}
                  />
                  <InputField
                    label="Notes"
                    value={assignValues.notes}
                    onChange={(e) => setAssignValues((v) => ({ ...v, notes: e.target.value }))}
                    hint="Optional"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowAssign(false)}>Cancel</Button>
                  <Button type="submit" isLoading={busy === 'assign'} loadingText="Assigning…">
                    Assign worker
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
            {canSubmit && !showDecision && !showAssign && (
              <Button
                onClick={() => doAction('submit', () => hrApi.requests.submit(requestId))}
                isLoading={busy === 'submit'}
                loadingText="Submitting…"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Submit for review
              </Button>
            )}
            {canReview && !showDecision && !showAssign && (
              <Button
                variant="secondary"
                onClick={() => doAction('review', () => hrApi.requests.review(requestId))}
                isLoading={busy === 'review'}
                loadingText="Moving…"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                Mark under review
              </Button>
            )}
            {canApprove && !showDecision && !showAssign && (
              <Button onClick={() => setShowDecision('approve')}>
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                Approve
              </Button>
            )}
            {canReject && !showDecision && !showAssign && (
              <Button variant="secondary" tone="danger" onClick={() => setShowDecision('reject')}>
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Reject
              </Button>
            )}
            {canAssign && !showDecision && !showAssign && (
              <Button onClick={() => setShowAssign(true)}>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Assign worker
              </Button>
            )}
            {canComplete && !showDecision && !showAssign && (
              <Button
                variant="secondary"
                onClick={() => doAction('complete', () => hrApi.requests.complete(requestId))}
                isLoading={busy === 'complete'}
                loadingText="Completing…"
              >
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                Mark complete
              </Button>
            )}
            {canCancel && !showDecision && !showAssign && (
              <Button
                variant="secondary"
                tone="danger"
                onClick={() => doAction('cancel', () => hrApi.requests.cancel(requestId))}
                isLoading={busy === 'cancel'}
                loadingText="Cancelling…"
              >
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                Cancel request
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
