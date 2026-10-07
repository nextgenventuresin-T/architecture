import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Pencil, Building2, RefreshCw } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Badge from '../../../components/ui/Badge';
import OverviewTab from '../../../components/employees/OverviewTab';
import AssignmentsTab from '../../../components/employees/AssignmentsTab';
import WorkTab from '../../../components/employees/WorkTab';
import AssignEmployeeDialog from '../../../components/employees/AssignEmployeeDialog';
import useAsync from '../../../hooks/useAsync';
import { employeesApi } from '../../../api/employeesApi';
import { toApiError } from '../../../api/axiosClient';
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONE } from '../../../utils/employeeOptions';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [isAssigning, setIsAssigning] = useState(false);
  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [actionError, setActionError] = useState(null);
  const [endingId, setEndingId] = useState(null);

  const { data: detail, isLoading, error, reload } = useAsync(() => employeesApi.detail(id), [id]);

  async function handleEndAssignment(assignmentId) {
    setEndingId(assignmentId);
    setActionError(null);
    try {
      await employeesApi.endAssignment(id, assignmentId);
      setFlash('Assignment ended.');
      reload();
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setEndingId(null);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="Employee"
          breadcrumbs={[
            { label: 'Dashboard', to: '/admin' },
            { label: 'Employees', to: '/admin/employees' },
            { label: 'Not found' },
          ]}
          showBack
        />
        <Alert tone="error" title="Could not load this employee">{error.message}</Alert>
        <Link to="/admin/employees" className="mt-4 inline-block">
          <Button variant="secondary">Back to employees</Button>
        </Link>
      </>
    );
  }

  if (isLoading || !detail) {
    return (
      <>
        <PageHeader
          title="Loading employee…"
          breadcrumbs={[
            { label: 'Dashboard', to: '/admin' },
            { label: 'Employees', to: '/admin/employees' },
          ]}
          showBack
        />
        <div className="space-y-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const { employee, projects, sites, assignments, labour, activities } = detail;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'assignments', label: 'Projects & sites', count: projects.length + sites.length },
    { id: 'work', label: 'Work & labour', count: activities.length + labour.length },
  ];

  const panels = {
    overview: <OverviewTab employee={employee} />,
    assignments: (
      <AssignmentsTab
        projects={projects}
        sites={sites}
        assignments={assignments}
        onEndAssignment={handleEndAssignment}
        endingId={endingId}
      />
    ),
    work: <WorkTab activities={activities} labour={labour} />,
  };

  return (
    <>
      <PageHeader
        title={employee.fullName}
        description={`${employee.employeeCode} · ${employee.designation}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Employees', to: '/admin/employees' },
          { label: employee.fullName },
        ]}
        showBack
        actions={
          <>
            <Badge tone={EMPLOYEE_STATUS_TONE[employee.status] ?? 'neutral'}>
              {EMPLOYEE_STATUS_LABELS[employee.status] ?? employee.status}
            </Badge>
            <Button variant="secondary" onClick={() => setIsAssigning(true)}>
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Assign
            </Button>
            <Button variant="secondary" onClick={reload} aria-label="Refresh employee">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Link to={`/admin/employees/${id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit employee
              </Button>
            </Link>
          </>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}
      {actionError && <Alert tone="error" title="Could not complete that" className="mb-4">{actionError.message}</Alert>}

      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          setFlash(null);
          setActionError(null);
        }}
        className="mb-6"
      />

      <div role="tabpanel">{panels[activeTab]}</div>

      <AssignEmployeeDialog
        employee={isAssigning ? employee : null}
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
