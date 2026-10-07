import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Pencil, Building2, RefreshCw } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Badge from '../../../components/ui/Badge';
import OverviewTab from '../../../components/contractors/OverviewTab';
import ProjectsSitesTab from '../../../components/contractors/ProjectsSitesTab';
import LabourTab from '../../../components/contractors/LabourTab';
import PaymentsTab from '../../../components/contractors/PaymentsTab';
import ApprovalsTab from '../../../components/contractors/ApprovalsTab';
import ContractorDocumentsTab from '../../../components/contractors/ContractorDocumentsTab';
import ContractorPOsTab from '../../../components/contractors/ContractorPOsTab';
import ContractorTimeline from '../../../components/contractors/ContractorTimeline';
import AssignContractorDialog from '../../../components/contractors/AssignContractorDialog';
import useAsync from '../../../hooks/useAsync';
import { contractorsApi } from '../../../api/contractorsApi';
import { CONTRACTOR_STATUS_TONE } from '../../../utils/contractorOptions';

export default function ContractorDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [isAssigning, setIsAssigning] = useState(false);
  const [flash, setFlash] = useState(location.state?.flash ?? null);

  const { data: detail, isLoading, error, reload } = useAsync(() => contractorsApi.detail(id), [id]);

  if (error) {
    return (
      <>
        <PageHeader
          title="Contractor"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Contractors', to: '/admin/contractors' }, { label: 'Not found' }]}
          showBack
        />
        <Alert tone="error" title="Could not load this contractor">{error.message}</Alert>
        <Link to="/admin/contractors" className="mt-4 inline-block">
          <Button variant="secondary">Back to contractors</Button>
        </Link>
      </>
    );
  }

  if (isLoading || !detail) {
    return (
      <>
        <PageHeader title="Loading contractor…" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Contractors', to: '/admin/contractors' }]} showBack />
        <div className="space-y-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const {
    contractor,
    projects = [],
    sites = [],
    payments = [],
    labour = [],
    approvals = [],
    documents = [],
    pos = [],
    poSummary = {},
  } = detail;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents', count: documents.length },
    { id: 'pos', label: 'POs & Contracts', count: pos.length },
    { id: 'timeline', label: 'Timeline' },
    { id: 'sites', label: 'Projects & sites', count: projects.length + sites.length },
    { id: 'labour', label: 'Labour', count: labour.length },
    { id: 'payments', label: 'Payments', count: payments.length },
    { id: 'approvals', label: 'Approvals', count: approvals.filter((a) => a.status === 'pending').length },
  ];

  const panels = {
    overview: <OverviewTab contractor={contractor} poSummary={poSummary} documentsCount={documents.length} />,
    documents: <ContractorDocumentsTab contractor={contractor} documents={documents} onChanged={reload} />,
    pos: <ContractorPOsTab contractor={contractor} pos={pos} poSummary={poSummary} onChanged={reload} />,
    timeline: <ContractorTimeline contractor={contractor} pos={pos} poSummary={poSummary} />,
    sites: <ProjectsSitesTab projects={projects} sites={sites} contractor={contractor} onPoCreated={reload} />,
    labour: <LabourTab labour={labour} />,
    payments: <PaymentsTab payments={payments} />,
    approvals: <ApprovalsTab approvals={approvals} />,
  };


  return (
    <>
      <PageHeader
        title={contractor.name}
        description={contractor.contactPerson ? `Contact: ${contractor.contactPerson}` : undefined}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Contractors', to: '/admin/contractors' },
          { label: contractor.name },
        ]}
        showBack
        actions={
          <>
            <Badge tone={CONTRACTOR_STATUS_TONE[contractor.status] ?? 'neutral'}>{contractor.status}</Badge>
            <Button variant="secondary" onClick={() => setIsAssigning(true)}>
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Assign
            </Button>
            <Button variant="secondary" onClick={reload} aria-label="Refresh contractor">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Link to={`/admin/contractors/${id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit contractor
              </Button>
            </Link>
          </>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}

      <Tabs tabs={tabs} active={activeTab} onChange={(tab) => { setActiveTab(tab); setFlash(null); }} className="mb-6" />

      <div role="tabpanel">{panels[activeTab]}</div>

      <AssignContractorDialog
        contractor={isAssigning ? contractor : null}
        onClose={() => setIsAssigning(false)}
        onSaved={(message) => {
          setIsAssigning(false);
          setFlash(message);
          reload();
        }}
      />
    </>
  );
}
