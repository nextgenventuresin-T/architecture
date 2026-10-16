import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserCheck, X, UserPlus } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import { InputField, SelectField } from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import InfoList from '../../../components/projects/InfoList';
import useAsync from '../../../hooks/useAsync';
import { projectManagersApi } from '../../../api/projectManagersApi';
import { toApiError } from '../../../api/axiosClient';

const EMPTY_LOGIN = { enabled: false, email: '', username: '', password: '', confirmPassword: '' };

/**
 * /project-managers/new - make an EXISTING employee a Project Manager. Nothing is
 * typed twice: name, contact, employment and every other detail come straight from
 * the employee record (edit them in Employees).
 */
export default function ProjectManagerFormPage() {
  const navigate = useNavigate();
  const { data: employees = [], isLoading, error: loadError } = useAsync(() => projectManagersApi.candidates(), []);

  const [employeeId, setEmployeeId] = useState('');
  const [login, setLogin] = useState(EMPTY_LOGIN);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const employee = (employees || []).find((e) => String(e.id) === employeeId) || null;

  const setLoginField = (key) => (event) => {
    const value = key === 'enabled' ? event.target.checked : event.target.value;
    setLogin((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [`user_${key}`]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = {};
    if (!employee) errors.employee_id = 'Select an employee.';
    if (employee && login.enabled && !employee.login) {
      if (!(login.email || employee.email || '').trim()) errors.user_email = 'Enter an email address for the login.';
      if (login.password.length < 12) errors.user_password = 'Password must be at least 12 characters.';
      if (login.password !== login.confirmPassword) errors.user_confirmPassword = 'Passwords do not match.';
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormError(null);
    const payload = { employee_id: Number(employeeId) };
    if (login.enabled && !employee.login) {
      payload.createUserAccess = {
        email: (login.email || employee.email).trim(),
        username: login.username.trim() || null,
        password: login.password,
        confirmPassword: login.confirmPassword,
      };
    }
    try {
      const saved = await projectManagersApi.assign(payload);
      navigate(`/admin/project-managers/${saved.manager.id}`, {
        replace: true,
        state: { flash: `${saved.manager.fullName} is now a Project Manager and can be assigned to projects, tasks and subtasks.` },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) {
        const mapped = { ...apiError.details };
        for (const k of ['email', 'password', 'confirmPassword', 'username']) if (mapped[k]) mapped[`user_${k}`] = mapped[k];
        setFieldErrors(mapped);
      }
      setFormError(apiError);
      setIsSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Add project manager"
        description="Choose an employee. Their details come from the Employees module."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Project Managers', to: '/admin/project-managers' }, { label: 'New' }]}
        showBack
      />

      {formError && <Alert tone="error" title="Could not save" className="mb-4">{formError.message}</Alert>}
      {loadError && <Alert tone="error" title="Could not load employees" className="mb-4">{loadError.message}</Alert>}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Employee" />
          <CardBody className="space-y-5">
            <SelectField
              label="Employee"
              required
              value={employeeId}
              onChange={(e) => { setEmployeeId(e.target.value); setFieldErrors({}); setLogin(EMPTY_LOGIN); }}
              error={fieldErrors.employee_id}
              placeholder={isLoading ? 'Loading employees…' : (employees || []).length ? 'Select an employee' : 'No eligible employees'}
              disabled={isLoading}
              options={(employees || []).map((e) => ({
                value: String(e.id),
                label: [e.fullName, e.employeeCode, e.designation].filter(Boolean).join(' · '),
              }))}
            />
            {!isLoading && (employees || []).length === 0 && (
              <p className="text-sm text-ink-muted">
                Every active employee is already a project manager.{' '}
                <Link to="/admin/employees/new" className="font-medium text-brand-700 hover:underline">Add an employee</Link> first.
              </p>
            )}

            {employee && (
              <div className="rounded-xl border border-line bg-canvas/50 p-4">
                <InfoList columns={2} items={[
                  { label: 'Employee ID', value: employee.employeeCode },
                  { label: 'Current designation', value: employee.designation },
                  { label: 'Department', value: employee.department },
                  { label: 'Location', value: employee.workLocation },
                  { label: 'Phone', value: employee.phone },
                  { label: 'Email', value: employee.email },
                ]} />
                <p className="mt-3 text-xs text-ink-subtle">
                  Designation will change to <strong>Project Manager</strong>. To change any other detail,{' '}
                  <Link to={`/admin/employees/${employee.id}/edit`} className="font-medium text-brand-700 hover:underline">edit the employee</Link>.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {employee && (
          <Card>
            <CardHeader
              title="Login access"
              description={employee.login
                ? `Already signs in as ${employee.login.email} (${employee.login.role?.replace('_', ' ')}). Change the role in Users & Access if needed.`
                : 'Optional: a Project Manager login that shows only their assigned projects, sites and tasks.'}
            />
            {!employee.login && (
              <CardBody className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={login.enabled} onChange={setLoginField('enabled')} className="h-4 w-4 rounded border-line text-brand-600" />
                  Create a Project Manager login
                </label>
                {login.enabled && (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <InputField label="Login email" type="email" value={login.email} onChange={setLoginField('email')} error={fieldErrors.user_email}
                      placeholder={employee.email || 'name@company.in'} />
                    <InputField label="Username (optional)" value={login.username} onChange={setLoginField('username')} error={fieldErrors.user_username} />
                    <InputField label="Password" type="password" autoComplete="new-password" value={login.password} onChange={setLoginField('password')} error={fieldErrors.user_password} hint="At least 12 characters." />
                    <InputField label="Confirm password" type="password" autoComplete="new-password" value={login.confirmPassword} onChange={setLoginField('confirmPassword')} error={fieldErrors.user_confirmPassword} />
                  </div>
                )}
              </CardBody>
            )}
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="lg" isLoading={isSaving} loadingText="Saving…" disabled={!employee}>
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Make project manager
          </Button>
          <Link to="/admin/employees/new">
            <Button type="button" variant="secondary" size="lg">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              New employee
            </Button>
          </Link>
          <Link to="/admin/project-managers">
            <Button type="button" variant="ghost" size="lg">
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </>
  );
}
