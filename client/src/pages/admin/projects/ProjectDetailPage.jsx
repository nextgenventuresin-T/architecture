import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Pencil, Users, RefreshCw } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import { StatusBadge } from '../../../components/ui/Badge';
import AssignTeamDialog from '../../../components/projects/AssignTeamDialog';
import OverviewTab from '../../../components/projects/OverviewTab';
import SitesTab from '../../../components/projects/SitesTab';
import ProgressTab from '../../../components/projects/ProgressTab';
import MaterialsTab from '../../../components/projects/MaterialsTab';
import LabourTab from '../../../components/projects/LabourTab';
import ContractorTab from '../../../components/projects/ContractorTab';
import FinanceTab from '../../../components/projects/FinanceTab';
import ApprovalsTab from '../../../components/projects/ApprovalsTab';
import IssuesTab from '../../../components/projects/IssuesTab';
import DocumentsTab from '../../../components/projects/DocumentsTab';
import ReportsTab from '../../../components/projects/ReportsTab';
import TasksBudgetTab from '../../../components/projects/TasksBudgetTab';
import DailyWorkTab from '../../../components/projects/DailyWorkTab';
import useAsync from '../../../hooks/useAsync';
import { projectsApi } from '../../../api/projectsApi';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [isAssigning, setIsAssigning] = useState(false);
  const [flash, setFlash] = useState(location.state?.flash ?? null);

  const { data: detail, isLoading, error, reload } = useAsync(() => projectsApi.detail(id), [id]);
  const { data: lookups } = useAsync(() => projectsApi.lookups(), []);

  if (error) {
    return (
      <>
        <PageHeader
          title="Project"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Projects', to: '/admin/projects' }, { label: 'Not found' }]}
          showBack
        />
        <Alert tone="error" title="Could not load this project">{error.message}</Alert>
        <Link to="/admin/projects" className="mt-4 inline-block">
          <Button variant="secondary">Back to projects</Button>
        </Link>
      </>
    );
  }

  if (isLoading || !detail) {
    return (
      <>
        <PageHeader title="Loading project…" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Projects', to: '/admin/projects' }]} showBack />
        <div className="space-y-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const { project } = detail;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks & Planning', count: detail.tasks?.length || 0 },
    { id: 'daily-work', label: 'Daily Work Updates', count: detail.dailyWorkUpdates?.length || 0 },
    { id: 'sites', label: 'Sites', count: detail.sites.length },
    { id: 'progress', label: 'Progress' },
    { id: 'materials', label: 'Materials', count: detail.materials.length },
    { id: 'labour', label: 'Labour', count: detail.labour.length },
    { id: 'contractor', label: 'Contractor' },
    { id: 'finance', label: 'Finance' },
    { id: 'approvals', label: 'Approvals', count: detail.approvals.filter((a) => a.status === 'pending').length },
    { id: 'issues', label: 'Issues', count: detail.issues.filter((i) => i.status === 'open').length },
    { id: 'documents', label: 'Documents', count: detail.documents.length },
    { id: 'reports', label: 'Reports' },
  ];

  const panels = {
    overview: <OverviewTab detail={detail} />,
    tasks: <TasksBudgetTab detail={detail} projectId={id} onReload={reload} />,
    phases: <TasksBudgetTab detail={detail} projectId={id} onReload={reload} />,
    'daily-work': <DailyWorkTab detail={detail} />,
    sites: <SitesTab detail={detail} projectId={id} lookups={lookups} onChanged={reload} />,
    progress: <ProgressTab detail={detail} />,
    materials: <MaterialsTab detail={detail} projectId={id} />,
    labour: <LabourTab detail={detail} projectId={id} lookups={lookups} onChanged={reload} />,
    contractor: <ContractorTab detail={detail} onAssign={() => setIsAssigning(true)} />,
    finance: <FinanceTab detail={detail} />,
    approvals: <ApprovalsTab detail={detail} onChanged={reload} />,
    issues: <IssuesTab detail={detail} />,
    documents: <DocumentsTab detail={detail} onChanged={reload} />,
    reports: <ReportsTab detail={detail} />,
  };

  return (
    <>
      <PageHeader
        title={project.name}
        description={`${project.code} · ${project.location}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Projects', to: '/admin/projects' },
          { label: project.name },
        ]}
        showBack
        actions={
          <>
            <StatusBadge status={project.status} />
            <Button variant="secondary" onClick={() => setIsAssigning(true)}>
              <Users className="h-4 w-4" aria-hidden="true" />
              Assign team
            </Button>
            <Button variant="secondary" onClick={reload} aria-label="Refresh project">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Link to={`/admin/projects/${id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit project
              </Button>
            </Link>
          </>
        }
      />

      {flash && (
        <Alert tone="success" className="mb-4">{flash}</Alert>
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={(tab) => { setActiveTab(tab); setFlash(null); }} className="mb-6" />

      <div role="tabpanel">{panels[activeTab]}</div>

      <AssignTeamDialog
        project={isAssigning ? project : null}
        lookups={lookups}
        onClose={() => setIsAssigning(false)}
        onSaved={() => {
          setIsAssigning(false);
          setFlash('Project team updated.');
          reload();
        }}
      />
    </>
  );
}
