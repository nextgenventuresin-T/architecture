import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { ClipboardPlus, MapPin, ShieldCheck, Users, Package, Wallet, AlertTriangle, ArrowRight } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import Tabs from '../../../components/ui/Tabs';
import DataTable from '../../../components/ui/DataTable';
import Badge, { StatusBadge } from '../../../components/ui/Badge';
import ProgressBar from '../../../components/ui/ProgressBar';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import InfoList from '../../../components/projects/InfoList';
import useAsync from '../../../hooks/useAsync';
import { sitesApi } from '../../../api/projectsApi';
import MaterialsTab from '../../../components/projects/MaterialsTab';
import LabourTab from '../../../components/projects/LabourTab';
import TasksBudgetTab from '../../../components/projects/TasksBudgetTab';
import ProgressTab from '../../../components/projects/ProgressTab';
import { formatCurrency, formatNumber, formatDate } from '../../../utils/format';
import { SAFETY_TONE, SEVERITY_TONE, labelFor } from '../../../utils/projectOptions';

const SAFETY_LABEL = { safe: 'Safe', caution: 'Caution', incident: 'Incident reported' };

export default function SiteDetailPage() {
  const { id, siteId } = useParams();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('activity');
  // Success message handed over by the activity form after it redirects here.
  const [flash, setFlash] = useState(location.state?.flash ?? null);

  const { data, isLoading, error, reload } = useAsync(() => sitesApi.detail(siteId), [siteId]);

  const backTo = `/admin/projects/${id}`;

  if (error) {
    return (
      <>
        <PageHeader title="Site" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Projects', to: '/admin/projects' }, { label: 'Site' }]} showBack />
        <Alert tone="error" title="Could not load this site">{error.message}</Alert>
        <Link to={backTo} className="mt-4 inline-block"><Button variant="secondary">Back to project</Button></Link>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Loading site…" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Projects', to: '/admin/projects' }]} showBack />
        <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>
      </>
    );
  }

  const { site, stats, activities, labour, materials, issues } = data;

  const tabs = [
    { id: 'progress', label: 'Progress & Budget' },
    { id: 'activity', label: 'Daily activity', count: activities.length },
    { id: 'tasks', label: 'Tasks & Planning', count: data.tasks?.length || 0 },
    { id: 'labour', label: 'Labour', count: labour.length },
    { id: 'materials', label: 'Materials', count: materials.length },
    { id: 'issues', label: 'Issues', count: issues.filter((i) => i.status === 'open').length },
  ];

  return (
    <>
      <PageHeader
        title={site.name}
        description={`${site.project_name} · ${site.address}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Projects', to: '/admin/projects' },
          { label: site.project_name, to: backTo },
          { label: site.name },
        ]}
        showBack
        actions={
          <>
            <StatusBadge status={site.status} />
            <Link to={backTo}>
              <Button variant="secondary">Back to project</Button>
            </Link>
            <Link to={`/admin/projects/${id}/sites/${siteId}/activity/new`}>
              <Button>
                <ClipboardPlus className="h-4 w-4" aria-hidden="true" />
                Record activity
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Site information"
            action={
              <Badge tone={SAFETY_TONE[site.safety_status] ?? 'neutral'}>
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                {labelFor(SAFETY_LABEL, site.safety_status)}
              </Badge>
            }
          />
          <CardBody className="space-y-5">
            <InfoList
              columns={2}
              items={[
                { label: 'Project', value: <Link to={backTo} className="text-brand-700 hover:underline">{site.project_name}</Link> },
                { label: 'Location', value: <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />{site.address}</span> },
                { label: 'Site engineer', value: site.site_engineer_name },
                { label: 'Contractor', value: site.contractor_name },
                { label: 'Engineer contact', value: site.site_engineer_phone },
                { label: 'Contractor contact', value: site.contractor_phone },
              ]}
            />
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">Site progress</span>
                <span className="font-medium tabular-nums text-ink">{site.progress}%</span>
              </div>
              <ProgressBar value={site.progress} status={site.status} />
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
          <MiniStat icon={Users} label="Today's attendance" value={`${formatNumber(stats.todayAttendance)} of ${formatNumber(site.labour_count)}`} />
          <MiniStat icon={Package} label="Materials received / used" value={`${formatNumber(stats.materialsReceived)} / ${formatNumber(stats.materialsConsumed)}`} />
          <MiniStat icon={Wallet} label="Daily expenses logged" value={formatCurrency(stats.totalDailyExpenses)} />
          <MiniStat icon={AlertTriangle} label="Open issues" value={formatNumber(stats.openIssues)} tone={stats.openIssues > 0 ? 'warning' : 'default'} />
        </div>
      </div>

      {flash && <Alert tone="success" className="mt-6">{flash}</Alert>}

      <Tabs tabs={tabs} active={activeTab} onChange={(tab) => { setActiveTab(tab); setFlash(null); }} className="mb-6 mt-6" />

      <div role="tabpanel">
        {activeTab === 'progress' && (
          <ProgressTab
            detail={{
              progress: {
                overall: site.progress || 0,
                planned: site.progress || 0,
                variance: 0,
                completed: (data.tasks || []).filter((t) => t.status === 'completed').length,
                inProgress: (data.tasks || []).filter((t) => t.status === 'on-track').length,
                pending: (data.tasks || []).filter((t) => t.status === 'attention').length,
                delayed: (data.tasks || []).filter((t) => t.status === 'delayed').length,
              },
              tasks: data.tasks || [],
              project: { status: site.status, currentPhase: site.name },
              budgetSummary: data.budgetSummary,
            }}
          />
        )}
        {activeTab === 'activity' && <ActivityPanel activities={activities} projectId={id} siteId={siteId} onReload={reload} />}
        {activeTab === 'tasks' && (
          <TasksBudgetTab
            detail={{
              tasks: data.tasks || [],
              sites: [site],
              project: { id, name: site.project_name, code: site.project_code || '' },
            }}
            projectId={id}
            preselectedSiteId={siteId}
            onReload={reload}
          />
        )}
        {activeTab === 'labour' && <LabourTab detail={{ labour, project: { id } }} projectId={id} siteId={siteId} />}
        {activeTab === 'materials' && <MaterialsTab detail={{ materials, project: { id } }} projectId={id} siteId={siteId} />}
        {activeTab === 'issues' && <IssuesPanel issues={issues} />}
      </div>
    </>
  );
}

function MiniStat({ icon: Icon, label, value, tone = 'default' }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-muted">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-canvas text-ink-muted'}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 font-display text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function ActivityPanel({ activities, projectId, siteId }) {
  if (activities.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No activity recorded yet"
          description="Record the first daily log to start tracking work, labour and expenses on this site."
          action={
            <Link to={`/admin/projects/${projectId}/sites/${siteId}/activity/new`}>
              <Button>Record activity</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Daily activity log"
        description={`${activities.length} entries, most recent first`}
        action={
          <Link
            to={`/admin/projects/${projectId}/sites/${siteId}/activity/new`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
          >
            Add entry
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />
      <ul className="divide-y divide-line">
        {activities.map((entry) => (
          <li key={entry.id} className="px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-medium text-ink">{formatDate(entry.activity_date)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{formatNumber(entry.labour_present)} present</Badge>
                <Badge tone="neutral">{formatCurrency(entry.expenses)}</Badge>
              </div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{entry.work_completed}</p>
            {entry.contractor_activity && (
              <p className="mt-1.5 text-sm text-ink-muted"><span className="text-ink-subtle">Contractor: </span>{entry.contractor_activity}</p>
            )}
            {entry.equipment_used && (
              <p className="mt-1 text-sm text-ink-muted"><span className="text-ink-subtle">Equipment: </span>{entry.equipment_used}</p>
            )}
            {entry.issues && (
              <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm leading-relaxed text-danger">{entry.issues}</p>
            )}
            {entry.notes && <p className="mt-2 text-sm italic text-ink-subtle">{entry.notes}</p>}
            {entry.document_name && (
              <p className="mt-2 text-xs text-ink-subtle">Attachment noted: {entry.document_name}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LabourPanel({ labour }) {
  const columns = [
    { key: 'category', header: 'Category', render: (r) => <span className="font-medium text-ink">{r.category}</span> },
    { key: 'contractor', header: 'Contractor', render: (r) => <span className="text-ink-muted">{r.contractor_name ?? '—'}</span> },
    { key: 'workers', header: 'Workers', align: 'right', render: (r) => <span className="tabular-nums">{formatNumber(r.worker_count)}</span> },
    { key: 'present', header: 'Present', align: 'right', render: (r) => <span className="tabular-nums">{formatNumber(r.present_count)}</span> },
    { key: 'rate', header: 'Daily rate', align: 'right', render: (r) => <span className="tabular-nums text-ink-muted">{formatCurrency(r.daily_rate)}</span> },
    { key: 'cost', header: 'Daily cost', align: 'right', render: (r) => <span className="tabular-nums text-ink">{formatCurrency(r.daily_cost)}</span> },
    { key: 'payment', header: 'Payment', render: (r) => <StatusBadge status={r.payment_status} /> },
  ];
  return (
    <Card>
      <CardHeader title="Labour on this site" />
      <DataTable columns={columns} rows={labour} empty={{ icon: Users, title: 'No labour recorded', description: 'Crew records for this site will appear here.' }} />
    </Card>
  );
}

function MaterialsPanel({ materials }) {
  const columns = [
    { key: 'material', header: 'Material', render: (r) => <div><p className="font-medium text-ink">{r.material_name}</p><p className="mt-0.5 text-xs text-ink-subtle">{r.category}</p></div> },
    { key: 'received', header: 'Received', align: 'right', render: (r) => <span className="tabular-nums">{formatNumber(r.quantity)} {r.unit}</span> },
    { key: 'used', header: 'Consumed', align: 'right', render: (r) => <span className="tabular-nums text-ink-muted">{formatNumber(r.used_quantity)} {r.unit}</span> },
    { key: 'remaining', header: 'Remaining', align: 'right', render: (r) => <span className="tabular-nums">{formatNumber(r.remaining_quantity)} {r.unit}</span> },
    { key: 'supplier', header: 'Supplier', render: (r) => <span className="text-ink-muted">{r.supplier ?? '—'}</span> },
    { key: 'date', header: 'Received on', render: (r) => <span className="whitespace-nowrap text-ink-muted">{formatDate(r.received_date)}</span> },
  ];
  return (
    <Card>
      <CardHeader title="Materials at this site" />
      <DataTable columns={columns} rows={materials} empty={{ icon: Package, title: 'No materials recorded', description: 'Deliveries to this site will appear here.' }} />
    </Card>
  );
}

function IssuesPanel({ issues }) {
  if (issues.length === 0) {
    return <Card><EmptyState icon={AlertTriangle} title="No issues on this site" description="Problems reported here will be listed for follow-up." /></Card>;
  }
  return (
    <Card>
      <CardHeader title="Site issues" />
      <ul className="divide-y divide-line">
        {issues.map((issue) => (
          <li key={issue.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className={`font-medium ${issue.status === 'resolved' ? 'text-ink-muted line-through' : 'text-ink'}`}>{issue.title}</p>
              {issue.description && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{issue.description}</p>}
              <p className="mt-1.5 text-xs text-ink-subtle">Raised {formatDate(issue.raised_on)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={SEVERITY_TONE[issue.severity] ?? 'neutral'}>{issue.severity}</Badge>
              <Badge tone={issue.status === 'open' ? 'warning' : 'positive'}>{issue.status === 'open' ? 'Open' : 'Resolved'}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
