import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Save, X } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import { InputField, TextAreaField } from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import useAsync from '../../../hooks/useAsync';
import { sitesApi } from '../../../api/projectsApi';
import { toApiError } from '../../../api/axiosClient';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  activity_date: today(),
  work_completed: '',
  labour_present: '',
  contractor_activity: '',
  equipment_used: '',
  expenses: '',
  issues: '',
  notes: '',
  document_name: '',
};

/** Records one day of work on a site. The API enforces one entry per day. */
export default function SiteActivityFormPage() {
  const { id, siteId } = useParams();
  const navigate = useNavigate();

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: site, isLoading } = useAsync(() => sitesApi.detail(siteId), [siteId]);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  const siteTo = `/admin/projects/${id}/sites/${siteId}`;

  function validate() {
    const errors = {};
    if (!values.activity_date) errors.activity_date = 'Choose the date this work happened.';
    else if (new Date(values.activity_date) > new Date()) errors.activity_date = 'You cannot log activity for a future date.';
    if (!values.work_completed.trim()) errors.work_completed = 'Describe the work completed.';
    if (values.labour_present !== '' && Number(values.labour_present) < 0) errors.labour_present = 'Labour count cannot be negative.';
    if (values.expenses !== '' && Number(values.expenses) < 0) errors.expenses = 'Expenses cannot be negative.';
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
    setFormError(null);
    try {
      await sitesApi.logActivity(siteId, {
        ...values,
        labour_present: values.labour_present === '' ? 0 : Number(values.labour_present),
        expenses: values.expenses === '' ? 0 : Number(values.expenses),
      });
      navigate(siteTo, { replace: true, state: { flash: 'Daily activity recorded.' } });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
      setIsSaving(false);
    }
  }

  const siteName = site?.site?.name ?? 'Site';

  return (
    <>
      <PageHeader
        title="Record daily activity"
        description={`Log today's work, labour and expenses for ${siteName}.`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Projects', to: '/admin/projects' },
          { label: site?.site?.project_name ?? 'Project', to: `/admin/projects/${id}` },
          { label: siteName, to: siteTo },
          { label: 'Record activity' },
        ]}
        showBack
      />

      {formError && <Alert tone="error" title="Could not save this entry" className="mb-4">{formError.message}</Alert>}

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Card>
            <CardHeader title="Work and labour" description="What was done on site, and who was there." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <InputField label="Date" type="date" required max={today()} value={values.activity_date} onChange={set('activity_date')} error={fieldErrors.activity_date} />
              <InputField label="Labour present" type="number" min="0" value={values.labour_present} onChange={set('labour_present')} error={fieldErrors.labour_present} placeholder="84" hint="Number of workers on site." />
              <TextAreaField label="Work completed" required rows={3} value={values.work_completed} onChange={set('work_completed')} error={fieldErrors.work_completed} placeholder="Eighth-floor slab shuttering completed; steel binding in progress." className="sm:col-span-2" />
              <InputField label="Contractor activity" value={values.contractor_activity} onChange={set('contractor_activity')} placeholder="Gurmeet Constructions — RCC crew" />
              <InputField label="Equipment used" value={values.equipment_used} onChange={set('equipment_used')} placeholder="Tower crane, concrete pump" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Expenses, issues and notes" description="Anything that affects cost or needs following up." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <InputField label="Expenses (₹)" type="number" min="0" step="100" value={values.expenses} onChange={set('expenses')} error={fieldErrors.expenses} placeholder="96000" hint="Money spent on site today." />
              <InputField label="Attachment name" value={values.document_name} onChange={set('document_name')} placeholder="slab-pour-photos.zip" hint="File uploads arrive in a later interface; record the name for now." />
              <TextAreaField label="Site issues" rows={2} value={values.issues} onChange={set('issues')} placeholder="Cement stock exhausted; plastering crew idle." className="sm:col-span-2" />
              <TextAreaField label="Notes" rows={2} value={values.notes} onChange={set('notes')} placeholder="Slab pour scheduled for tomorrow morning." className="sm:col-span-2" />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg" isLoading={isSaving} loadingText="Saving…">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save entry
            </Button>
            <Link to={siteTo}>
              <Button type="button" variant="secondary" size="lg">
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
