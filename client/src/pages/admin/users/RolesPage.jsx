import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Select from '../../../components/ui/Select';
import PermissionMatrix from '../../../components/users/PermissionMatrix';
import useAsync from '../../../hooks/useAsync';
import { usersApi } from '../../../api/usersApi';
import { toApiError } from '../../../api/axiosClient';
import { USER_STATUS_TONE, USER_STATUS_LABELS, ROLE_TONE } from '../../../utils/userOptions';

/**
 * Roles and the permission matrix.
 *
 * The seven roles come from Interface 1 and are reused as-is — none is created
 * or removed here. The matrix reads its rows and columns from the permissions
 * table, so it reflects whatever the catalogue actually contains.
 */
export default function RolesPage() {
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [granted, setGranted] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(() => usersApi.permissions(), []);
  const { data, isLoading, error, reload } = useAsync(load, [load]);

  useEffect(() => {
    if (!data || selectedRoleId) return;
    // Open on the first editable role rather than Admin, which is read-only.
    const firstEditable = data.roles.find((r) => !r.isSystem) ?? data.roles[0];
    setSelectedRoleId(firstEditable?.id ?? null);
  }, [data, selectedRoleId]);

  useEffect(() => {
    if (!data || !selectedRoleId) return;
    const keys = new Set(data.matrix[selectedRoleId] ?? []);
    setGranted(data.permissions.filter((p) => keys.has(p.key)).map((p) => p.id));
  }, [data, selectedRoleId]);

  async function savePermissions(permissionIds) {
    setIsSaving(true);
    setSaveError(null);
    try {
      await usersApi.updateRolePermissions(selectedRoleId, permissionIds);
      setFlash('Permissions updated. They take effect immediately for every user in this role.');
      reload();
    } catch (caught) {
      setSaveError(toApiError(caught));
      throw caught;
    } finally {
      setIsSaving(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Roles & permissions" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Users & access', to: '/admin/users' }, { label: 'Roles' }]} showBack />
        <Alert tone="error" title="Could not load roles">{error.message}</Alert>
        <Button className="mt-4" onClick={reload}>Try again</Button>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Roles & permissions" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Users & access', to: '/admin/users' }]} showBack />
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>
      </>
    );
  }

  const selectedRole = data.roles.find((r) => r.id === selectedRoleId);

  const columns = [
    {
      key: 'role',
      header: 'Role name',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge tone={ROLE_TONE[row.slug] ?? 'neutral'}>{row.name}</Badge>
          {row.isSystem && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-subtle" title="System role — always has full access">
              <Lock className="h-3 w-3" aria-hidden="true" />
              System
            </span>
          )}
        </div>
      ),
    },
    { key: 'description', header: 'Description', render: (row) => <span className="text-ink-muted">{row.description || '—'}</span> },
    {
      key: 'users',
      header: 'Users',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">
          {row.userCount}
          {row.userCount > 0 && row.activeUserCount !== row.userCount && (
            <span className="ml-1 text-xs text-ink-subtle">({row.activeUserCount} active)</span>
          )}
        </span>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      align: 'right',
      render: (row) => <span className="tabular-nums text-ink-muted">{row.isSystem ? 'All' : row.permissionCount}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={USER_STATUS_TONE[row.status] ?? 'neutral'}>{USER_STATUS_LABELS[row.status] ?? row.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button variant="secondary" onClick={() => setSelectedRoleId(row.id)}>
          {row.isSystem ? 'View' : 'Edit permissions'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Control what each role may do. Changes apply to every user holding that role and are enforced by the API, not just the screen."
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Users & access', to: '/admin/users' },
          { label: 'Roles & permissions' },
        ]}
        showBack
        actions={<Link to="/admin/users"><Button variant="secondary">Back to users</Button></Link>}
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}
      {saveError && <Alert tone="error" className="mb-4" title="Could not save permissions">{saveError.message}</Alert>}

      <Card className="mb-6">
        <CardHeader title="Roles" description="The seven roles created with the authentication system." />
        <DataTable
          columns={columns}
          rows={data.roles}
          empty={{ icon: ShieldCheck, title: 'No roles found', description: 'Run the database migration.' }}
          renderCard={(row) => (
            <div>
              <div className="flex items-start justify-between gap-3">
                <Badge tone={ROLE_TONE[row.slug] ?? 'neutral'}>{row.name}</Badge>
                <Badge tone={USER_STATUS_TONE[row.status] ?? 'neutral'}>{USER_STATUS_LABELS[row.status]}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{row.description}</p>
              <p className="mt-1 text-xs text-ink-subtle">
                {row.userCount} user{row.userCount === 1 ? '' : 's'} · {row.isSystem ? 'all' : row.permissionCount} permissions
              </p>
              <Button className="mt-3" variant="secondary" onClick={() => setSelectedRoleId(row.id)}>
                {row.isSystem ? 'View' : 'Edit permissions'}
              </Button>
            </div>
          )}
        />
      </Card>

      <Card>
        <CardHeader
          title="Permission matrix"
          description="Tick what this role may do in each module. Click a module name to toggle the whole row."
          action={
            <Select
              label="Role to edit"
              value={String(selectedRoleId ?? '')}
              onChange={(event) => setSelectedRoleId(Number(event.target.value))}
              className="w-[200px]"
              options={data.roles.map((r) => ({ value: String(r.id), label: r.name }))}
            />
          }
        />
        <CardBody>
          {selectedRole && (
            <PermissionMatrix
              key={`${selectedRole.id}-${granted.join(',')}`}
              modules={data.modules}
              role={selectedRole}
              granted={granted}
              onSave={savePermissions}
              isSaving={isSaving}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
