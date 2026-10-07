import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Pencil, RefreshCw, KeyRound, Power, ShieldCheck } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Alert from '../../../components/ui/Alert';
import Modal from '../../../components/ui/Modal';
import Skeleton from '../../../components/ui/Skeleton';
import InfoList from '../../../components/projects/InfoList';
import { InputField } from '../../../components/ui/Field';
import ProjectAccessSelector from '../../../components/users/ProjectAccessSelector';
import useAsync from '../../../hooks/useAsync';
import useAuth from '../../../hooks/useAuth';
import { usersApi } from '../../../api/usersApi';
import { toApiError } from '../../../api/axiosClient';
import { formatDate, formatDateTime } from '../../../utils/format';
import {
  USER_STATUS_LABELS, USER_STATUS_TONE, ROLE_TONE,
  moduleLabel, passwordProblem, MIN_PASSWORD_LENGTH,
} from '../../../utils/userOptions';

export default function UserDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState('account');
  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [actionError, setActionError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [projects, setProjects] = useState([]);

  const { data, isLoading, error, reload } = useAsync(
    () => usersApi.detail(id).then((detail) => {
      usersApi.lookups().then((l) => setProjects(l.projects ?? [])).catch(() => {});
      return detail;
    }),
    [id]
  );

  async function toggleStatus() {
    setIsBusy(true);
    setActionError(null);
    try {
      const next = data.user.status === 'active' ? 'inactive' : 'active';
      await usersApi.setStatus(id, next);
      setFlash(next === 'active' ? 'User activated.' : 'User deactivated. They can no longer sign in.');
      reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="User" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Users & access', to: '/admin/users' }, { label: 'Not found' }]} showBack />
        <Alert tone="error" title="Could not load this user">{error.message}</Alert>
        <Link to="/admin/users" className="mt-4 inline-block"><Button variant="secondary">Back to users</Button></Link>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Loading user…" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Users & access', to: '/admin/users' }]} showBack />
        <div className="space-y-4"><Skeleton className="h-11" /><Skeleton className="h-64" /></div>
      </>
    );
  }

  const { user, access, activity } = data;
  const isSelf = String(currentUser?.id) === String(user.id);

  const tabs = [
    { id: 'account', label: 'Account' },
    { id: 'access', label: 'Access', count: access.modules.length },
    { id: 'projects', label: 'Projects & sites', count: access.projects.length },
    { id: 'activity', label: 'Activity', count: activity.sessions.length },
  ];

  return (
    <>
      <PageHeader
        title={user.fullName}
        description={`${user.roleName} · ${user.email}${user.department ? ` · ${user.department}` : ''}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Users & access', to: '/admin/users' },
          { label: user.fullName },
        ]}
        showBack
        actions={
          <>
            <Badge tone={USER_STATUS_TONE[user.status] ?? 'neutral'}>
              {USER_STATUS_LABELS[user.status] ?? user.status}
            </Badge>
            <Button variant="secondary" onClick={reload} aria-label="Refresh user"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</Button>
            <Button variant="secondary" onClick={() => setResetOpen(true)}><KeyRound className="h-4 w-4" aria-hidden="true" />Reset password</Button>
            <Link to={`/admin/users/${id}/edit`}><Button><Pencil className="h-4 w-4" aria-hidden="true" />Edit</Button></Link>
          </>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}
      {actionError && <Alert tone="error" className="mb-4" title="Could not update this user">{actionError.message}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <InfoList
              columns={1}
              items={[
                { label: 'Full name', value: user.fullName },
                { label: 'Username', value: user.username || '—' },
                { label: 'Email', value: user.email },
                { label: 'Phone', value: user.phone || '—' },
                { label: 'Department', value: user.department || '—' },
                { label: 'Role', value: <Badge tone={ROLE_TONE[user.role] ?? 'neutral'}>{user.roleName}</Badge> },
                { label: 'Status', value: <Badge tone={USER_STATUS_TONE[user.status] ?? 'neutral'}>{USER_STATUS_LABELS[user.status]}</Badge> },
                { label: 'Created', value: formatDate(user.createdAt) },
                { label: 'Created by', value: user.createdBy?.name ?? '—' },
                { label: 'Last login', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never signed in' },
              ]}
            />

            {user.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Notes</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{user.notes}</p>
              </div>
            )}

            <div className="mt-5 border-t border-line pt-4">
              {isSelf ? (
                <p className="text-sm text-ink-muted">
                  This is your own account. You cannot deactivate it or change your own role — ask another administrator.
                </p>
              ) : (
                <Button
                  variant={user.status === 'active' ? 'secondary' : 'primary'}
                  onClick={toggleStatus}
                  isLoading={isBusy}
                  loadingText="Updating…"
                  fullWidth
                >
                  <Power className="h-4 w-4" aria-hidden="true" />
                  {user.status === 'active' ? 'Deactivate user' : 'Activate user'}
                </Button>
              )}
              <p className="mt-2 text-xs text-ink-subtle">
                Users are never deleted, so historical records keep pointing at a real account.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="px-5 pt-1" />

          {activeTab === 'account' && (
            <CardBody>
              <InfoList
                columns={2}
                items={[
                  { label: 'Role', value: user.roleName },
                  {
                    label: 'Permission profile',
                    value: access.hasCustomPermissions ? (
                      <Badge tone="warning">Custom permissions ({access.permissionIds?.length ?? 0} granted)</Badge>
                    ) : (
                      <Badge tone="neutral">Standard ({user.roleName})</Badge>
                    ),
                  },
                  { label: 'Modules reachable', value: access.modules.length },
                  { label: 'Project scope', value: access.projectScoped ? `${access.projects.length} project(s)` : 'All projects' },
                  { label: 'Site scope', value: access.siteScoped ? `${access.sites.length} site(s)` : 'All sites' },
                ]}
              />
              <p className="mt-5 border-t border-line pt-4 text-sm text-ink-muted">
                {access.hasCustomPermissions ? (
                  <>
                    This user has custom individual permissions assigned.{' '}
                    <Link to={`/admin/users/${id}/edit`} className="text-brand-700 hover:underline">
                      Edit individual permissions
                    </Link>
                  </>
                ) : (
                  <>
                    What this role may do is configured under{' '}
                    <Link to="/admin/users/roles" className="text-brand-700 hover:underline">Roles &amp; permissions</Link>,
                    and applies to every user holding it. You can customize individual permissions by{' '}
                    <Link to={`/admin/users/${id}/edit`} className="text-brand-700 hover:underline">
                      editing this user
                    </Link>.
                  </>
                )}
              </p>
            </CardBody>
          )}

          {activeTab === 'access' && (
            <CardBody>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden="true" />
                  <div>
                    <h3 className="font-display text-sm font-semibold text-ink">Accessible modules</h3>
                    <p className="text-xs text-ink-muted">
                      {access.hasCustomPermissions
                        ? `Individual custom permissions (${access.permissionIds?.length ?? 0} granted).`
                        : `Standard permissions inherited from the ${user.roleName} role.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={access.hasCustomPermissions ? 'warning' : 'neutral'}>
                    {access.hasCustomPermissions ? 'Custom permissions' : 'Inherited from role'}
                  </Badge>
                  <Link to={`/admin/users/${id}/edit`}>
                    <Button size="sm" variant="secondary">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit permissions
                    </Button>
                  </Link>
                </div>
              </div>
              {access.modules.length === 0 ? (
                <p className="text-sm text-ink-muted">This user currently has no module permissions.</p>
              ) : (
                <ul className="space-y-1.5">
                  {access.modules.map((entry) => (
                    <li key={entry.module} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas/50 px-4 py-2.5">
                      <span className="text-sm font-medium text-ink">{moduleLabel(entry.module)}</span>
                      <span className="flex flex-wrap gap-1">
                        {entry.actions.map((action) => (
                          <Badge key={action} tone="brand">{action}</Badge>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          )}

          {activeTab === 'projects' && (
            <CardBody>
              <ProjectAccessSelector
                userId={id}
                projects={projects}
                onSaved={(message) => { setFlash(message); reload(); }}
              />
            </CardBody>
          )}

          {activeTab === 'activity' && (
            <CardBody>
              <InfoList
                columns={2}
                items={[
                  { label: 'Last login', value: activity.lastLoginAt ? formatDateTime(activity.lastLoginAt) : 'Never signed in' },
                  { label: 'Recorded sessions', value: activity.sessions.length },
                ]}
              />
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-3 text-xs uppercase tracking-wide text-ink-subtle">Recent sessions</p>
                {activity.sessions.length === 0 ? (
                  <p className="text-sm text-ink-muted">No sessions recorded for this account yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {activity.sessions.map((session) => (
                      <li key={session.id} className="rounded-xl border border-line bg-canvas/50 px-4 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm text-ink">{formatDateTime(session.createdAt)}</span>
                          <Badge tone={session.isActive ? 'positive' : 'neutral'}>
                            {session.isActive ? 'Active' : session.revokedAt ? 'Signed out' : 'Expired'}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-ink-subtle">
                          {session.ipAddress || 'IP not recorded'} · {session.userAgent || 'Device not recorded'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-ink-subtle">
                  Derived from existing sign-in sessions — no additional tracking is collected.
                </p>
              </div>
            </CardBody>
          )}
        </Card>
      </div>

      {resetOpen && (
        <ResetPasswordDialog
          userId={id}
          userName={user.fullName}
          onClose={() => setResetOpen(false)}
          onDone={(message) => { setResetOpen(false); setFlash(message); reload(); }}
        />
      )}
    </>
  );
}

/** Sets a new password. The existing one is never shown, because it is only stored hashed. */
function ResetPasswordDialog({ userId, userName, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    const problem = passwordProblem(password);
    if (problem) { setFieldErrors({ password: problem }); return; }
    if (password !== confirmPassword) { setFieldErrors({ confirmPassword: 'The two passwords do not match.' }); return; }

    setIsSaving(true);
    setError(null);
    try {
      await usersApi.resetPassword(userId, { password, confirmPassword });
      onDone('Password reset. That user’s existing sessions were signed out.');
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Reset password"
      description={`Set a new password for ${userName}. Their current password cannot be shown — it is only stored as a hash.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} isLoading={isSaving} loadingText="Resetting…">Reset password</Button>
        </>
      }
    >
      {error && !error.details && <Alert tone="error" className="mb-4">{error.message}</Alert>}
      <div className="space-y-4">
        <InputField
          label="New password"
          required
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setFieldErrors({}); }}
          error={fieldErrors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, mixing cases and numbers.`}
        />
        <InputField
          label="Confirm new password"
          required
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors({}); }}
          error={fieldErrors.confirmPassword}
        />
        <Alert tone="warning">
          Resetting signs that user out of every device immediately.
        </Alert>
      </div>
    </Modal>
  );
}
