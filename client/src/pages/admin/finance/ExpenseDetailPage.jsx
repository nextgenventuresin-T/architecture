import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Pencil, RefreshCw, Download } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import InfoList from '../../../components/projects/InfoList';
import useAsync from '../../../hooks/useAsync';
import useAuth from '../../../hooks/useAuth';
import { financeApi } from '../../../api/financeApi';
import { toApiError } from '../../../api/axiosClient';
import { ROLES } from '../../../config/roles';
import { formatCurrency, formatDate } from '../../../utils/format';
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONE,
  PAYMENT_METHOD_LABELS,
  STATUS_TRANSITIONS,
  STATUS_ACTION_LABELS,
  EDITABLE_STATUSES,
  categoryLabel,
} from '../../../utils/financeOptions';

export default function ExpenseDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();

  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [actionError, setActionError] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);

  const canManage = [ROLES.ADMIN, ROLES.FINANCE].includes(user?.role);

  const { data: expense, isLoading, error, reload } = useAsync(() => financeApi.expense(id), [id]);

  async function changeStatus(nextStatus) {
    setPendingStatus(nextStatus);
    setActionError(null);
    try {
      await financeApi.updateExpenseStatus(id, nextStatus);
      setFlash(`Expense marked as ${EXPENSE_STATUS_LABELS[nextStatus]?.toLowerCase() ?? nextStatus}.`);
      reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setPendingStatus(null);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="Expense"
          breadcrumbs={[
            { label: 'Dashboard', to: '/admin' },
            { label: 'Finance', to: '/admin/finance' },
            { label: 'Not found' },
          ]}
          showBack
        />
        <Alert tone="error" title="Could not load this expense">{error.message}</Alert>
        <Link to="/admin/finance/expenses" className="mt-4 inline-block">
          <Button variant="secondary">Back to expenses</Button>
        </Link>
      </>
    );
  }

  if (isLoading || !expense) {
    return (
      <>
        <PageHeader
          title="Loading expense…"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Finance', to: '/admin/finance' }]}
          showBack
        />
        <div className="space-y-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const transitions = STATUS_TRANSITIONS[expense.status] ?? [];

  return (
    <>
      <PageHeader
        title={expense.expenseNumber}
        description={`${categoryLabel(expense.category)} · ${formatCurrency(expense.amount)} · ${formatDate(expense.date)}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Finance', to: '/admin/finance' },
          { label: 'Expenses', to: '/admin/finance/expenses' },
          { label: expense.expenseNumber },
        ]}
        showBack
        actions={
          <>
            <Badge tone={EXPENSE_STATUS_TONE[expense.status] ?? 'neutral'}>
              {EXPENSE_STATUS_LABELS[expense.status] ?? expense.status}
            </Badge>
            <Button variant="secondary" onClick={reload} aria-label="Refresh expense">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            {canManage && EDITABLE_STATUSES.includes(expense.status) && (
              <Link to={`/admin/finance/expenses/${id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Button>
              </Link>
            )}
          </>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}
      {actionError && <Alert tone="error" className="mb-4" title="Could not update this expense">{actionError.message}</Alert>}
      {expense.requiresProjectHeadApproval && (
        <Alert tone="warning" className="mb-4">
          <strong>Approval Requirement:</strong> Room Rent requires Project Head approval before acceptance/payment.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Expense details" />
          <CardBody>
            <InfoList
              columns={2}
              items={[
                { label: 'Amount', value: <span className="font-medium tabular-nums">{formatCurrency(expense.amount)}</span> },
                { label: 'Date', value: formatDate(expense.date) },
                {
                  label: 'Project',
                  value: (
                    <Link to={`/admin/projects/${expense.project.id}`} className="text-brand-700 hover:underline">
                      {expense.project.name}
                    </Link>
                  ),
                },
                { label: 'Site', value: expense.site?.name ?? '—' },
                { label: 'Category', value: categoryLabel(expense.category) },
                {
                  label: 'Contractor',
                  value: expense.contractor ? (
                    <span className="font-medium text-ink">{expense.contractor.name}</span>
                  ) : '—',
                },
                { label: 'Party Name', value: expense.partyName || '—' },
                {
                  label: 'Receipt / Bill',
                  value: expense.billFile ? (
                    <a
                      href={financeApi.billUrl(expense.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {expense.billFile.name || 'View Bill'}
                    </a>
                  ) : '—',
                },
                {
                  label: 'Status',
                  value: (
                    <Badge tone={EXPENSE_STATUS_TONE[expense.status] ?? 'neutral'}>
                      {EXPENSE_STATUS_LABELS[expense.status] ?? expense.status}
                    </Badge>
                  ),
                },
                { label: 'Paid by', value: expense.paidBy || '—' },
                {
                  label: 'Payment method',
                  value: expense.paymentMethod ? PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod : '—',
                },
                { label: 'Reference', value: expense.reference || '—' },
                { label: 'Recorded by', value: expense.createdBy?.name ?? '—' },
              ]}
            />

            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Description</p>
              <p className="text-sm leading-relaxed text-ink">{expense.description}</p>
            </div>

            {expense.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Notes</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{expense.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Payment status"
            description="Only the moves the API will accept are offered."
          />
          <CardBody>
            {transitions.length === 0 ? (
              <p className="text-sm text-ink-muted">
                This expense is {EXPENSE_STATUS_LABELS[expense.status]?.toLowerCase() ?? expense.status} and is now a
                settled record. No further status change is possible.
              </p>
            ) : !canManage ? (
              <p className="text-sm text-ink-muted">
                Only Admin and Finance can change an expense&apos;s payment status.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {transitions.map((next) => (
                  <Button
                    key={next}
                    variant={next === 'paid' || next === 'approved' ? 'primary' : 'secondary'}
                    onClick={() => changeStatus(next)}
                    isLoading={pendingStatus === next}
                    loadingText="Updating…"
                    fullWidth
                  >
                    {STATUS_ACTION_LABELS[`${expense.status}>${next}`] ?? EXPENSE_STATUS_LABELS[next] ?? next}
                  </Button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
