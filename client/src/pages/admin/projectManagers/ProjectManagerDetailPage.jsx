import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Pencil, RefreshCw, Building2, ListChecks, MapPin } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Badge, { StatusBadge } from '../../../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import ProgressBar from '../../../components/ui/ProgressBar';
import Select from '../../../components/ui/Select';
import InfoList from '../../../components/projects/InfoList';
import useAsync from '../../../hooks/useAsync';
import { projectManagersApi } from '../../../api/projectManagersApi';
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONE, EMPLOYEE_TYPE_LABELS } from '../../../utils/employeeOptions';
import { formatDate, formatDateTime } from '../../../utils/format';

export default function ProjectManagerDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [taskFilter, setTaskFilter] = useState('open');

  const { data, isLoading, error, reload } = useAsync(() => projectManagersApi.detail(id), [id]);

  const tasks = useMemo(() => {
    const all = data?.tasks ?? [];
    if (taskFilter === 'open') return all.filter((t) => t.status !== 'completed' && t.progress < 100);
    if (taskFilter === 'done') return all.filter((t) => t.status === 'completed' || t.progress >= 100);
    return all;
  }, [data, taskFilter]);

  const crumbs = [{ label: 'Dashboard', to: '/admin' }, { label: 'Project Managers', to: '/admin/project-managers' }];

  if (error) {
    return (
      <>
        <PageHeader title="Project manager" breadcrumbs={[...crumbs, { label: 'Not found' }]} showBack />
        <Alert tone="error" title="Could not load this project manager">{error.message}</Alert>
        <Link to="/admin/project-managers" className="mt-4 inline-block"><Button variant="secondary">Back to project managers</Button></Link>
      </>
    );
  }
  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Loading project manager…" breadcrumbs={crumbs} showBack />
        <div className="space-y-4"><Skeleton className="h-11" /><Skeleton className="h-64" /></div>
      </>
    );
  }

  const { manager, projects = [], sites = [] } = data;
  const allTasks = data.tasks ?? [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'tasks', label: 'Assigned tasks', count: allTasks.length },
    { id: 'sites', label: 'Sites', count: sites.length },
  ];

  const projectColumns = [
    {
      key: 'name', header: 'Project',
      render: (p) => (
        <div className="min-w-0">
          <Link to={`/admin/projects/${p.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">{p.name}</Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{p.code}{p.clientName ? ` · ${p.clientName}` : ''}</p>
        </div>
      ),
    },
    { key: 'location', header: 'Location', render: (p) => <span className="text-ink-muted">{p.location || '—'}</span> },
    { key: 'scope', header: 'Scope', render: (p) => <span className="whitespace-nowrap text-ink-muted">{p.siteCount} sites · {p.taskCount} tasks</span> },
    { key: 'dates', header: 'Timeline', render: (p) => <span className="whitespace-nowrap text-ink-muted">{formatDate(p.startDate)} – {formatDate(p.expectedCompletion)}</span> },
    { key: 'progress', header: 'Progress', render: (p) => <div className="w-28"><ProgressBar value={p.progress} status={p.status} showLabel /></div> },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
  ];

  const taskColumns = [
    {
      key: 'name', header: 'Task',
      render: (t) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{t.name}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">{t.kind === 'subtask' ? `Subtask of ${t.parentName}` : 'Main task'}</p>
        </div>
      ),
    },
    {
      key: 'where', header: 'Project / site / area',
      render: (t) => (
        <div className="text-ink-muted">
          <Link to={`/admin/projects/${t.projectId}`} className="hover:text-brand-700 hover:underline">{t.projectName}</Link>
          <p className="text-xs text-ink-subtle">{[t.siteName, t.areaName].filter(Boolean).join(' · ') || 'No site / area'}</p>
        </div>
      ),
    },
    { key: 'dates', header: 'Schedule', render: (t) => <span className="whitespace-nowrap text-ink-muted">{formatDate(t.startDate)} – {formatDate(t.endDate)}</span> },
    { key: 'progress', header: 'Progress', render: (t) => <div className="w-28"><ProgressBar value={t.progress} status={t.status} showLabel /></div> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
  ];

  const siteColumns = [
    { key: 'name', header: 'Site', render: (s) => <Link to={`/admin/projects/${s.projectId}/sites/${s.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">{s.name}</Link> },
    { key: 'project', header: 'Project', render: (s) => <span className="text-ink-muted">{s.projectName}</span> },
    { key: 'contractor', header: 'Contractor', render: (s) => <span className="text-ink-muted">{s.contractorName || '—'}</span> },
    { key: 'progress', header: 'Progress', render: (s) => <div className="w-28"><ProgressBar value={s.progress} status={s.status} showLabel /></div> },
  ];

  const panels = {
    overview: (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Profile" description="From the employee record - edit it in Employees." />
          <CardBody>
            <InfoList columns={2} items={[
              { label: 'Employee ID', value: manager.employeeCode },
              { label: 'Designation', value: manager.designation },
              { label: 'Phone', value: manager.phone },
              { label: 'Email', value: manager.email },
              { label: 'Department', value: manager.department },
              { label: 'Employment type', value: EMPLOYEE_TYPE_LABELS[manager.employeeType] ?? manager.employeeType },
              { label: 'Joining date', value: manager.joiningDate ? formatDate(manager.joiningDate) : null },
              { label: 'Experience', value: manager.experienceYears != null ? `${manager.experienceYears} years` : null },
              { label: 'Base location', value: manager.workLocation },
              { label: 'Work mode', value: manager.workMode },
              { label: 'Availability', value: manager.availabilityStatus?.replace('_', ' ') },
              { label: 'Reports to', value: manager.reportingManager?.name },
              { label: 'Address', value: manager.address },
            ]} />
            {manager.notes && <p className="mt-5 whitespace-pre-line rounded-lg bg-canvas p-3 text-sm text-ink-muted">{manager.notes}</p>}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Workload" />
            <CardBody className="grid grid-cols-2 gap-4">
              <Stat icon={Building2} label="Active projects" value={manager.activeProjectCount} sub={`${manager.projectCount} total`} />
              <Stat icon={MapPin} label="Sites" value={manager.siteCount} />
              <Stat icon={ListChecks} label="Open tasks" value={manager.openTaskCount} sub={`${manager.taskCount} assigned`} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Login" />
            <CardBody>
              {manager.login ? (
                <InfoList items={[
                  { label: 'Sign-in email', value: manager.login.email },
                  { label: 'Role', value: 'Project Manager' },
                  { label: 'Account', value: manager.login.isActive ? 'Active' : 'Disabled' },
                  { label: 'Last sign-in', value: manager.login.lastLoginAt ? formatDateTime(manager.login.lastLoginAt) : 'Never' },
                ]} />
              ) : (
                <p className="text-sm text-ink-muted">No login yet. <Link to={`/admin/employees/${id}/edit`} className="font-medium text-brand-700 hover:underline">Create one on the employee record</Link> (role: Project Manager) so they can update their sites and tasks.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    ),
    projects: (
      <Card>
        <DataTable columns={projectColumns} rows={projects} empty={{ icon: Building2, title: 'No projects yet', description: 'Assign this manager from a project’s team settings.' }} />
      </Card>
    ),
    tasks: (
      <Card>
        <div className="border-b border-line px-5 py-4">
          <Select label="Filter tasks" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className="w-[180px]"
            options={[{ value: 'open', label: 'Open tasks' }, { value: 'done', label: 'Completed' }, { value: 'all', label: 'All tasks' }]} />
        </div>
        <DataTable
          columns={taskColumns}
          rows={tasks}
          getRowKey={(t) => `${t.kind}-${t.id}`}
          empty={{ icon: ListChecks, title: 'No tasks here', description: 'Tasks and subtasks assigned to this manager appear here.' }}
        />
      </Card>
    ),
    sites: (
      <Card>
        <DataTable columns={siteColumns} rows={sites} empty={{ icon: MapPin, title: 'No sites', description: 'Sites of the projects this manager runs appear here.' }} />
      </Card>
    ),
  };

  return (
    <>
      <PageHeader
        title={manager.fullName}
        description={[manager.employeeCode, manager.workLocation].filter(Boolean).join(' · ')}
        breadcrumbs={[...crumbs, { label: manager.fullName }]}
        showBack
        actions={
          <>
            <Badge tone={EMPLOYEE_STATUS_TONE[manager.status] ?? 'neutral'}>{EMPLOYEE_STATUS_LABELS[manager.status] ?? manager.status}</Badge>
            <Button variant="secondary" onClick={reload} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Link to={`/admin/employees/${id}`}>
              <Button variant="secondary">Employee record</Button>
            </Link>
            <Link to={`/admin/employees/${id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit employee details
              </Button>
            </Link>
          </>
        }
      />
      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}
      <Tabs tabs={tabs} active={activeTab} onChange={(tab) => { setActiveTab(tab); setFlash(null); }} className="mb-6" />
      <div role="tabpanel">{panels[activeTab]}</div>
    </>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-subtle"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-subtle">{sub}</p>}
    </div>
  );
}
