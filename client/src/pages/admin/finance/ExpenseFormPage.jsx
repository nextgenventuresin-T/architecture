import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import { financeApi } from '../../../api/financeApi';
import { projectsApi } from '../../../api/projectsApi';
import { toApiError } from '../../../api/axiosClient';
import { EXPENSE_CATEGORY_OPTIONS, PAYMENT_METHOD_OPTIONS } from '../../../utils/financeOptions';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  project_id: '',
  site_id: '',
  category: 'material',
  description: '',
  amount: '',
  expense_date: today(),
  paid_by: '',
  payment_method: '',
  reference: '',
  notes: '',
};

/** Add and edit share one form — the fields are identical, only the call differs. */
export default function ExpenseFormPage({ mode = 'create' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [values, setValues] = useState(EMPTY);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    financeApi
      .lookups()
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setIsLoading(true);
    financeApi
      .expense(id)
      .then((expense) => {
        if (!active) return;
        setValues({
          project_id: String(expense.project.id),
          site_id: expense.site ? String(expense.site.id) : '',
          category: expense.category ?? 'other',
          description: expense.description ?? '',
          amount: String(expense.amount ?? ''),
          expense_date: expense.date ? String(expense.date).slice(0, 10) : today(),
          paid_by: expense.paidBy ?? '',
          payment_method: expense.paymentMethod ?? '',
          reference: expense.reference ?? '',
          notes: expense.notes ?? '',
        });
      })
      .catch((caught) => active && setError(toApiError(caught)))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // Sites depend on the chosen project.
  useEffect(() => {
    if (!values.project_id) {
      setSites([]);
      return undefined;
    }
    let active = true;
    projectsApi
      .detail(values.project_id)
      .then((data) => active && setSites(data.sites ?? []))
      .catch(() => active && setSites([]));
    return () => {
      active = false;
    };
  }, [values.project_id]);

  const set = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => ({
      ...current,
      [key]: value,
      // Changing project clears a site chosen under the previous project.
      ...(key === 'project_id' ? { site_id: '' } : {}),
    }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  function validate() {
    const errors = {};
    if (!values.project_id) errors.project_id = 'Select a project.';
    if (!values.description.trim()) errors.description = 'Enter a description.';
    if (!values.amount || Number(values.amount) <= 0) errors.amount = 'Enter an amount greater than zero.';
    if (!values.expense_date) errors.expense_date = 'Enter the expense date.';
    if (!values.category) errors.category = 'Choose a category.';
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        project_id: Number(values.project_id),
        site_id: values.site_id ? Number(values.site_id) : null,
        category: values.category,
        description: values.description.trim(),
        amount: Number(values.amount),
        expense_date: values.expense_date,
        paid_by: values.paid_by.trim() || null,
        payment_method: values.payment_method || null,
        reference: values.reference.trim() || null,
        notes: values.notes.trim() || null,
      };

      const expense = isEdit
        ? await financeApi.updateExpense(id, payload)
        : await financeApi.createExpense(payload);

      navigate(`/admin/finance/expenses/${expense.id}`, {
        state: { flash: isEdit ? 'Expense updated.' : 'Expense recorded.' },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  const title = isEdit ? 'Edit expense' : 'Add expense';

  if (isLoading) {
    return (
      <>
        <PageHeader
          title="Loading expense…"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Finance', to: '/admin/finance' }]}
          showBack
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={
          isEdit
            ? 'Update this expense. An expense that has been paid or cancelled can no longer be edited.'
            : 'Record a project or site expense. It starts as Pending and can be approved from the expense screen.'
        }
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Finance', to: '/admin/finance' },
          { label: 'Expenses', to: '/admin/finance/expenses' },
          { label: title },
        ]}
        showBack
      />

      {error && !error.details && (
        <Alert tone="error" title="Could not save this expense" className="mb-4">{error.message}</Alert>
      )}

      <Card className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="Expense date"
                required
                type="date"
                value={values.expense_date}
                onChange={set('expense_date')}
                error={fieldErrors.expense_date}
              />

              <SelectField
                label="Category"
                required
                value={values.category}
                onChange={set('category')}
                options={EXPENSE_CATEGORY_OPTIONS}
                error={fieldErrors.category}
              />

              <SelectField
                label="Project"
                required
                value={values.project_id}
                onChange={set('project_id')}
                placeholder="Select a project"
                options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
                error={fieldErrors.project_id}
              />

              <SelectField
                label="Site"
                value={values.site_id}
                onChange={set('site_id')}
                placeholder={values.project_id ? 'Not assigned to a site' : 'Select a project first'}
                options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
                error={fieldErrors.site_id}
              />

              <InputField
                label="Description"
                required
                value={values.description}
                onChange={set('description')}
                error={fieldErrors.description}
                placeholder="What the money was spent on"
                className="sm:col-span-2"
              />

              <InputField
                label="Amount (₹)"
                required
                type="number"
                min="0"
                step="0.01"
                value={values.amount}
                onChange={set('amount')}
                error={fieldErrors.amount}
              />

              <InputField
                label="Paid by"
                value={values.paid_by}
                onChange={set('paid_by')}
                error={fieldErrors.paid_by}
                placeholder="Person, department or petty cash"
              />

              <SelectField
                label="Payment method"
                value={values.payment_method}
                onChange={set('payment_method')}
                placeholder="Not recorded"
                options={PAYMENT_METHOD_OPTIONS}
                error={fieldErrors.payment_method}
              />

              <InputField
                label="Reference"
                value={values.reference}
                onChange={set('reference')}
                error={fieldErrors.reference}
                placeholder="Cheque number, UTR, bill number"
              />

              <TextAreaField
                label="Notes"
                value={values.notes}
                onChange={set('notes')}
                rows={3}
                className="sm:col-span-2"
                placeholder="Anything else worth recording about this expense…"
              />
            </div>
          </CardBody>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <Link to={isEdit ? `/admin/finance/expenses/${id}` : '/admin/finance/expenses'}>
              <Button variant="secondary" type="button">Cancel</Button>
            </Link>
            <Button type="submit" isLoading={isSaving} loadingText="Saving…">
              {isEdit ? 'Save changes' : 'Record expense'}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
