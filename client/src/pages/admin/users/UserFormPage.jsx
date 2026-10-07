import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import UserPermissionSelector from '../../../components/users/UserPermissionSelector';
import { usersApi } from '../../../api/usersApi';
import { toApiError } from '../../../api/axiosClient';
import { USER_STATUS_OPTIONS, passwordProblem, MIN_PASSWORD_LENGTH } from '../../../utils/userOptions';

const EMPTY = {
  full_name: '', email: '', username: '', phone: '', department: '',
  role: '', status: 'active', password: '', confirmPassword: '', notes: '',
};

/**
 * Add and edit user form with granular individual permissions selection.
 * When adding or editing a user, administrators can select and customize individual
 * permissions across all 15 modules × 5 actions. Roles provide initial defaults.
 */
export default function UserFormPage({ mode = 'create' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [values, setValues] = useState(EMPTY);
  const [roles, setRoles] = useState([]);
  const [permissionsData, setPermissionsData] = useState(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState(new Set());
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Map of role slug/id -> array of default permission IDs
  const roleDefaultMap = useMemo(() => {
    if (!permissionsData?.roles || !permissionsData?.matrix || !permissionsData?.permissions) {
      return {};
    }
    const map = {};
    for (const r of permissionsData.roles) {
      const keys = new Set(permissionsData.matrix[r.id] ?? []);
      const pids = permissionsData.permissions.filter((p) => keys.has(p.key)).map((p) => p.id);
      map[r.slug] = pids;
      map[r.id] = pids;
    }
    return map;
  }, [permissionsData]);

  // Load lookups and permissions catalogue
  useEffect(() => {
    let active = true;
    Promise.all([
      usersApi.lookups().catch(() => ({ roles: [] })),
      usersApi.permissions().catch(() => null),
    ]).then(([lookupsData, permsData]) => {
      if (!active) return;
      setRoles(lookupsData.roles ?? []);
      setPermissionsData(permsData);

      if (!isEdit) {
        const defaultRole = lookupsData.roles?.[0]?.slug ?? 'admin';
        setValues((current) => ({
          ...current,
          role: current.role || defaultRole,
        }));

        // In create mode, if permsData is ready, initialize selected permissions from default role
        if (permsData) {
          const defaultRoleObj = permsData.roles?.find((r) => r.slug === defaultRole) ?? permsData.roles?.[0];
          if (defaultRoleObj) {
            const keys = new Set(permsData.matrix[defaultRoleObj.id] ?? []);
            const pids = permsData.permissions.filter((p) => keys.has(p.key)).map((p) => p.id);
            setSelectedPermissionIds(new Set(pids));
          }
        }
        setIsLoading(false);
      }
    });

    return () => { active = false; };
  }, [isEdit]);

  // Load user detail in edit mode
  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setIsLoading(true);

    usersApi.detail(id)
      .then((detail) => {
        if (!active) return;
        const { user, access } = detail;
        setValues({
          full_name: user.fullName ?? '',
          email: user.email ?? '',
          username: user.username ?? '',
          phone: user.phone ?? '',
          department: user.department ?? '',
          role: user.role ?? '',
          status: user.status ?? 'active',
          password: '', confirmPassword: '',
          notes: user.notes ?? '',
        });

        if (access?.permissionIds && Array.isArray(access.permissionIds)) {
          setSelectedPermissionIds(new Set(access.permissionIds));
        }
      })
      .catch((caught) => active && setError(toApiError(caught)))
      .finally(() => active && setIsLoading(false));

    return () => { active = false; };
  }, [id, isEdit]);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleRoleChange = (event) => {
    const newRole = event.target.value;
    setValues((current) => ({ ...current, role: newRole }));
    setFieldErrors((current) => ({ ...current, role: undefined }));

    // Pre-populate permissions for the newly selected role
    if (roleDefaultMap[newRole]) {
      setSelectedPermissionIds(new Set(roleDefaultMap[newRole]));
    }
  };

  function validate() {
    const errors = {};
    if (!values.full_name.trim()) errors.full_name = 'Enter a full name.';
    if (!values.email.trim()) errors.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.';
    if (!values.role) errors.role = 'Choose a role.';

    if (!isEdit) {
      const problem = passwordProblem(values.password);
      if (problem) errors.password = problem;
      else if (values.password !== values.confirmPassword) errors.confirmPassword = 'The two passwords do not match.';
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        username: values.username.trim() || null,
        phone: values.phone.trim() || null,
        department: values.department.trim() || null,
        role: values.role,
        status: values.status,
        notes: values.notes.trim() || null,
        permissionIds: Array.from(selectedPermissionIds),
        ...(isEdit ? {} : { password: values.password, confirmPassword: values.confirmPassword }),
      };

      const user = isEdit ? await usersApi.update(id, payload) : await usersApi.create(payload);
      navigate(`/admin/users/${user.id}`, {
        state: { flash: isEdit ? 'User updated with individual permissions.' : 'User created with individual permissions.' },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  const title = isEdit ? 'Edit user' : 'Add user';
  const selectedRoleObj = roles.find((r) => r.slug === values.role);
  const currentRoleDefaultIds = roleDefaultMap[values.role] || [];

  if (isLoading) {
    return (
      <>
        <PageHeader title="Loading user…" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Users & access', to: '/admin/users' }]} showBack />
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
            ? 'Update this account and configure individual module permissions.'
            : 'Create a sign-in account and assign individual module permissions across the ERP.'
        }
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Users & access', to: '/admin/users' },
          { label: title },
        ]}
        showBack
      />

      {error && !error.details && (
        <Alert tone="error" title="Could not save this user" className="mb-4">{error.message}</Alert>
      )}

      <Card className="max-w-5xl">
        <form onSubmit={handleSubmit}>
          <CardBody>
            {/* Account Details */}
            <h3 className="mb-4 font-display text-base font-semibold text-ink">Account Information</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField label="Full name" required value={values.full_name} onChange={set('full_name')} error={fieldErrors.full_name} placeholder="Ravi Sharma" />
              <InputField label="Email" required type="email" value={values.email} onChange={set('email')} error={fieldErrors.email} placeholder="ravi@company.com" />
              <InputField label="Username" value={values.username} onChange={set('username')} error={fieldErrors.username} hint="Optional. Can be used to sign in instead of the email." />
              <InputField label="Phone" value={values.phone} onChange={set('phone')} error={fieldErrors.phone} />
              <SelectField
                label="Role"
                required
                value={values.role}
                onChange={handleRoleChange}
                placeholder="Select a role"
                options={roles.map((r) => ({ value: r.slug, label: r.name }))}
                error={fieldErrors.role}
                hint="Selecting a role pre-populates default permissions below."
              />
              <InputField label="Department" value={values.department} onChange={set('department')} error={fieldErrors.department} />
              <SelectField
                label="Status"
                value={values.status}
                onChange={set('status')}
                options={USER_STATUS_OPTIONS}
                error={fieldErrors.status}
                hint="An inactive user cannot sign in."
              />

              {!isEdit && (
                <>
                  <InputField
                    label="Password"
                    required
                    type="password"
                    autoComplete="new-password"
                    value={values.password}
                    onChange={set('password')}
                    error={fieldErrors.password}
                    hint={`At least ${MIN_PASSWORD_LENGTH} characters, mixing cases and numbers.`}
                  />
                  <InputField
                    label="Confirm password"
                    required
                    type="password"
                    autoComplete="new-password"
                    value={values.confirmPassword}
                    onChange={set('confirmPassword')}
                    error={fieldErrors.confirmPassword}
                  />
                </>
              )}

              <TextAreaField label="Notes" value={values.notes} onChange={set('notes')} rows={2} className="sm:col-span-2" placeholder="Reporting line, contract end date, anything worth recording…" />
            </div>

            {/* Granular Individual Permissions Matrix */}
            <div className="mt-8 border-t border-line pt-6">
              <UserPermissionSelector
                modules={permissionsData?.modules ?? []}
                permissions={permissionsData?.permissions ?? []}
                selectedIds={selectedPermissionIds}
                onChange={setSelectedPermissionIds}
                roleName={selectedRoleObj?.name}
                roleDefaultIds={currentRoleDefaultIds}
              />
            </div>
          </CardBody>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 bg-canvas/30">
            <span className="text-xs text-ink-subtle">
              {selectedPermissionIds.size} individual permission(s) will be granted to this user upon saving.
            </span>
            <div className="flex flex-wrap gap-2">
              <Link to={isEdit ? `/admin/users/${id}` : '/admin/users'}>
                <Button variant="secondary" type="button">Cancel</Button>
              </Link>
              <Button type="submit" isLoading={isSaving} loadingText="Saving…">
                {isEdit ? 'Save changes' : 'Create user'}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </>
  );
}
