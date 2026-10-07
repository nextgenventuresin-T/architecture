import { RefreshCw } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import SummaryCards from '../../components/dashboard/SummaryCards';
import QuickActions from '../../components/dashboard/QuickActions';
import SiteMonitor from '../../components/dashboard/SiteMonitor';
import ProgressPanel from '../../components/dashboard/ProgressPanel';
import TodayActivity from '../../components/dashboard/TodayActivity';
import ApprovalsQueue from '../../components/dashboard/ApprovalsQueue';
import ContractorOverview from '../../components/dashboard/ContractorOverview';
import MaterialSummary from '../../components/dashboard/MaterialSummary';
import { useAdminData } from '../../components/layout/AdminLayout';
import useAuth from '../../hooks/useAuth';

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error, reload, decideApproval, search } = useAdminData();

  const firstName = (user?.fullName || '').split(' ')[0];

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" breadcrumbs={[{ label: 'Dashboard' }]} />
        <Alert tone="error" title="Could not load the dashboard">
          {error.message}
        </Alert>
        <Button className="mt-4" onClick={reload}>
          Try again
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : 'Dashboard'}
        description="Everything across your sites, contractors and approvals in one view."
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={
          <Button variant="secondary" onClick={reload} isLoading={isLoading} loadingText="Refreshing…">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <div className="space-y-6">
        <SummaryCards summary={data?.summary} isLoading={isLoading} />

        <QuickActions />

        {/* Site monitoring gets the wide column; progress and today's log sit beside it */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SiteMonitor
              projects={data?.projects}
              contractors={data?.contractors}
              isLoading={isLoading}
              search={search}
            />
          </div>
          <div className="space-y-6">
            <ProgressPanel projects={data?.projects} isLoading={isLoading} />
            <TodayActivity entries={data?.todaysActivity} isLoading={isLoading} />
          </div>
        </div>

        <ApprovalsQueue
          approvals={data?.approvals}
          isLoading={isLoading}
          onDecide={decideApproval}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ContractorOverview
              contractors={data?.contractors}
              projects={data?.projects}
              isLoading={isLoading}
              search={search}
            />
          </div>
          <MaterialSummary materials={data?.materials} isLoading={isLoading} />
        </div>
      </div>
    </>
  );
}
