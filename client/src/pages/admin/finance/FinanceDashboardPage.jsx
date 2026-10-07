import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import FinanceSummary from '../../../components/finance/FinanceSummary';
import OverviewTab from '../../../components/finance/OverviewTab';
import ExpensesTab from '../../../components/finance/ExpensesTab';
import ContractorPaymentsTab from '../../../components/finance/ContractorPaymentsTab';
import ProcurementCostsTab from '../../../components/finance/ProcurementCostsTab';
import ProjectFinanceTab from '../../../components/finance/ProjectFinanceTab';
import PaymentsTab from '../../../components/finance/PaymentsTab';
import useAsync from '../../../hooks/useAsync';
import useAuth from '../../../hooks/useAuth';
import { financeApi } from '../../../api/financeApi';
import { ROLES } from '../../../config/roles';

/**
 * The finance module's home. Overview, expenses, contractor payments,
 * procurement costs, project finance and payment tracking are tabs on one
 * screen, so the sidebar stays as it is and no view is crowded.
 */
export default function FinanceDashboardPage({ initialTab = 'overview', basePath = '/admin' }) {
  const { user } = useAuth();
  const modulePath = basePath === '/admin' ? '/admin/finance' : basePath;
  const [activeTab, setActiveTab] = useState(initialTab);

  const canManage = [ROLES.ADMIN, ROLES.FINANCE].includes(user?.role);

  const load = useCallback(() => financeApi.lookups(), []);
  const { data: lookups, isLoading, error, reload } = useAsync(load, [load]);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'contractor-payments', label: 'Contractor payments' },
    { id: 'procurement', label: 'Procurement costs' },
    { id: 'projects', label: 'Project finance' },
    { id: 'payments', label: 'Payments' },
  ];

  if (error) {
    return (
      <>
        <PageHeader
          title="Finance"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Finance' }]}
        />
        <Alert tone="error" title="Could not load finance data">{error.message}</Alert>
        <Button className="mt-4" onClick={reload}>Try again</Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Finance"
        description="Budgets, expenses, contractor payments and procurement cost across every project."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Finance' }]}
        actions={
          <>
            <Button variant="secondary" onClick={reload} aria-label="Refresh finance data">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            {canManage && (
              <Link to={`${modulePath}/expenses/new`}>
                <Button>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add expense
                </Button>
              </Link>
            )}
          </>
        }
      />

      {isLoading || !lookups ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          {lookups.summary && <FinanceSummary summary={lookups.summary} onSelectTab={setActiveTab} />}

          <Card>
            <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="px-5 pt-1" />

            {activeTab === 'overview' && <OverviewTab summary={lookups.summary} />}
            {activeTab === 'expenses' && <ExpensesTab lookups={lookups} canManage={canManage} />}
            {activeTab === 'contractor-payments' && <ContractorPaymentsTab lookups={lookups} />}
            {activeTab === 'procurement' && <ProcurementCostsTab lookups={lookups} />}
            {activeTab === 'projects' && <ProjectFinanceTab lookups={lookups} />}
            {activeTab === 'payments' && <PaymentsTab lookups={lookups} />}
          </Card>
        </>
      )}
    </>
  );
}
