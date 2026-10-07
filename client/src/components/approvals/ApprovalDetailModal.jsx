import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, ExternalLink } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Alert from '../ui/Alert';
import Skeleton from '../ui/Skeleton';
import ApprovalHistoryList from './ApprovalHistoryList';
import useAsync from '../../hooks/useAsync';
import { approvalsApi } from '../../api/approvalsApi';
import { toApiError } from '../../api/axiosClient';
import { formatCurrency, formatDate } from '../../utils/format';
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_TONE,
  MODULE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONE,
  formatSourceStatus,
  sourceLinkFor,
} from '../../utils/approvalOptions';

/**
 * Full detail for one approval, with the approve/reject actions.
 *
 * The dialog re-fetches the record rather than trusting the row from the
 * list: the list may be seconds stale, and the server's answer to "may this
 * user still decide this, and is it still pending" is the one that matters.
 * Whether the buttons render at all comes from `decision.canDecide` in that
 * response — and the API re-checks it anyway when the decision is posted, so
 * hiding the buttons is only a courtesy, never the protection.
 */
export default function ApprovalDetailModal({ approval, isOpen, onClose, onDecided, basePath = '/admin' }) {
  const [pendingDecision, setPendingDecision] = useState(null); // 'approved' | 'rejected'
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [fieldError, setFieldError] = useState(null);

  const load = useCallback(
    () => (approval ? approvalsApi.detail(approval.module, approval.sourceId) : Promise.resolve(null)),
    [approval?.module, approval?.sourceId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);

  const detail = data?.approval ?? approval ?? null;
  const history = data?.history ?? [];
  const decision = data?.decision ?? { canDecide: false, isPending: false, reason: null };

  const resetDecision = () => {
    setPendingDecision(null);
    setComment('');
    setSubmitError(null);
    setFieldError(null);
  };

  const close = () => {
    resetDecision();
    onClose();
  };

  const submit = async () => {
    if (!pendingDecision || !detail) return;

    // Mirrors the server rule rather than replacing it — the API refuses a
    // reasonless rejection regardless, this just saves a round trip.
    if (pendingDecision === 'rejected' && !comment.trim()) {
      setFieldError('Enter a reason for rejecting this request.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setFieldError(null);

    try {
      await approvalsApi.decide(detail.module, detail.sourceId, {
        decision: pendingDecision,
        comment: comment.trim() || undefined,
      });
      resetDecision();
      await reload();
      onDecided?.(pendingDecision);
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details?.comment) setFieldError(apiError.details.comment);
      else setSubmitError(apiError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!approval) return null;

  const moduleLink = sourceLinkFor(detail, basePath);
  const showActions = decision.canDecide && decision.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="lg"
      title={detail?.reference ? `${detail.reference} · ${MODULE_LABELS[detail.module] ?? detail.module}` : 'Approval'}
      description={detail?.title}
      footer={
        showActions ? (
          pendingDecision ? (
            <>
              <Button variant="secondary" onClick={resetDecision} disabled={isSubmitting}>
                Back
              </Button>
              <Button
                onClick={submit}
                isLoading={isSubmitting}
                loadingText={pendingDecision === 'approved' ? 'Approving…' : 'Rejecting…'}
                className={pendingDecision === 'rejected' ? 'bg-danger hover:bg-danger/90 active:bg-danger' : ''}
              >
                {pendingDecision === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPendingDecision('rejected')}
                className="border-danger/30 text-danger hover:bg-danger-soft hover:border-danger/40"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Reject
              </Button>
              <Button onClick={() => setPendingDecision('approved')}>
                <Check className="h-4 w-4" aria-hidden="true" />
                Approve
              </Button>
            </>
          )
        ) : (
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        )
      }
    >
      {error ? (
        <>
          <Alert tone="error" title="Could not load this approval">
            {error.message}
          </Alert>
          <Button className="mt-4" onClick={reload}>
            Try again
          </Button>
        </>
      ) : isLoading && !detail ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* ---------------------------------------------------- summary */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={APPROVAL_STATUS_TONE[detail.status] ?? 'neutral'}>
              {APPROVAL_STATUS_LABELS[detail.status] ?? detail.status}
            </Badge>
            {/* The module's own status alongside the normalised one, so an
                approver can see that a labour request is specifically
                "Partially assigned" rather than just "Approved". */}
            {detail.sourceStatus && formatSourceStatus(detail.sourceStatus).toLowerCase()
              !== (APPROVAL_STATUS_LABELS[detail.status] ?? '').toLowerCase() && (
              <span className="text-xs text-ink-subtle">
                In module: {formatSourceStatus(detail.sourceStatus)}
              </span>
            )}
            {detail.priority && (
              <Badge tone={PRIORITY_TONE[detail.priority] ?? 'neutral'}>
                {PRIORITY_LABELS[detail.priority] ?? detail.priority}
              </Badge>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label="Reference" value={detail.reference} />
            <Row label="Module" value={MODULE_LABELS[detail.module] ?? detail.module} />
            <Row label="Request type" value={formatSourceStatus(detail.requestType)} />
            <Row label="Requested by" value={detail.requestedBy?.name} />
            <Row label="Project" value={detail.project?.name} />
            <Row label="Site" value={detail.site?.name} />
            <Row label="Date" value={formatDate(detail.requestedOn)} />
            {detail.amount !== null && detail.amount !== undefined && (
              <Row label="Amount" value={formatCurrency(detail.amount)} />
            )}
            {detail.extraReference && <Row label="Reference no." value={detail.extraReference} />}
          </dl>

          {detail.details && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">Details</p>
              <p className="whitespace-pre-line rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-muted">
                {detail.details}
              </p>
            </div>
          )}

          {moduleLink && (
            <Link
              to={moduleLink}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open in {MODULE_LABELS[detail.module] ?? detail.module}
            </Link>
          )}

          {/* ---------------------------------------------- decision form */}
          {pendingDecision && (
            <div className="rounded-xl border border-line bg-canvas px-4 py-3.5">
              <label htmlFor="approval-comment" className="mb-1.5 block text-sm font-medium text-ink">
                {pendingDecision === 'approved' ? 'Comment (optional)' : 'Reason for rejection'}
              </label>
              <textarea
                id="approval-comment"
                rows={3}
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
                maxLength={500}
                aria-invalid={Boolean(fieldError) || undefined}
                aria-describedby={fieldError ? 'approval-comment-error' : undefined}
                placeholder={
                  pendingDecision === 'approved'
                    ? 'Add a note for the requester…'
                    : 'Explain why this request is being rejected…'
                }
                className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:shadow-focus focus:outline-none ${
                  fieldError ? 'border-danger focus:border-danger' : 'border-line focus:border-brand-500'
                }`}
              />
              {fieldError && (
                <p id="approval-comment-error" role="alert" className="mt-1.5 text-sm text-danger">
                  {fieldError}
                </p>
              )}
              <p className="mt-1 text-xs text-ink-subtle">{comment.length}/500</p>
            </div>
          )}

          {submitError && (
            <Alert tone="error" title="Could not record that decision">
              {submitError}
            </Alert>
          )}

          {/* Explain the absence of buttons rather than silently omitting
              them — "why can't I approve this" is otherwise a support call. */}
          {!showActions && decision.reason && (
            <Alert tone="info" title="You cannot process this approval">
              {decision.reason}
            </Alert>
          )}
          {!showActions && !decision.reason && !decision.isPending && (
            <Alert tone="info" title="Already decided">
              This request is {APPROVAL_STATUS_LABELS[detail.status]?.toLowerCase() ?? detail.status} and can no
              longer be changed.
            </Alert>
          )}

          {/* ------------------------------------------------- history */}
          <div>
            <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">
              Approval history
            </p>
            <ApprovalHistoryList history={history} isLoading={isLoading && history.length === 0} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{value || '—'}</dd>
    </div>
  );
}
