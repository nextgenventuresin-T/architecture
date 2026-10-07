import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Network,
  HardHat,
  Briefcase,
  ClipboardList,
  CalendarClock,
  CalendarDays,
} from 'lucide-react';
import useAsync from '../hooks/useAsync';
import useAuth from '../hooks/useAuth';
import { hrApi } from '../api/hrApi';
import { ROLES } from '../config/roles';

// Restructured HR Module components
import HrEmployeeDirectoryTab from '../components/hr/HrEmployeeDirectoryTab';
import OrgHierarchyTab from '../components/hr/OrgHierarchyTab';
import LabourManagementTab from '../components/hr/LabourManagementTab';
import ContractorWorkersTab from '../components/hr/ContractorWorkersTab';
import AttendanceTab from '../components/hr/AttendanceTab';
import LabourRequestsTab from '../components/hr/LabourRequestsTab';
import LeaveTab from '../components/hr/LeaveTab';
import HrOverviewTab from '../components/hr/HrOverviewTab';

/**
 * HR & Labour Management Dashboard — /admin/hr and /hr (HR role).
 *
 * Restructured clean modules:
 *   A. Employee Directory (Reusing existing master employees directly)
 *   B. Organization / Reporting Hierarchy (Visual tree, chain of command, list)
 *   C. Labour (Workforce records, trades, wages, site allocations)
 *   D. Contractor Workers (Workers enrolled per contractor company)
 *   E. Attendance (Company employees, labour, contractor workers)
 *   Secondary: Labour Requests, Leave, HR Overview
 */
export default function HrDashboardPage({ initialTab = 'employee-directory' }) {
  const { user } = useAuth();
  const isHrOrAdmin = [ROLES.ADMIN, ROLES.HR].includes(user?.role);

  const { data: summary, isLoading: summaryLoading } = useAsync(
    () => hrApi.dashboard(),
    []
  );

  const [activeTab, setActiveTab] = useState(initialTab);

  const tabs = [
    {
      id: 'employee-directory',
      label: 'Employee Directory',
      icon: Users,
      show: isHrOrAdmin,
    },
    {
      id: 'org-hierarchy',
      label: 'Org Hierarchy',
      icon: Network,
      show: isHrOrAdmin,
    },
    {
      id: 'labour',
      label: 'Labour',
      icon: HardHat,
      show: isHrOrAdmin,
    },
    {
      id: 'contractor-workers',
      label: 'Contractor Workers',
      icon: Briefcase,
      show: isHrOrAdmin || user?.role === ROLES.CONTRACTOR,
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: CalendarClock,
      show: true,
    },
    {
      id: 'labour-requests',
      label: 'Labour Requests',
      icon: ClipboardList,
      show: true,
    },
    {
      id: 'leave',
      label: 'Leave',
      icon: CalendarDays,
      show: isHrOrAdmin,
    },
    {
      id: 'overview',
      label: 'HR Overview',
      icon: LayoutDashboard,
      show: isHrOrAdmin,
    },
  ].filter((t) => t.show);

  // Ensure activeTab is a valid visible tab after role filtering
  const validTab = tabs.find((t) => t.id === activeTab) ? activeTab : tabs[0]?.id;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* ── Page header ── */}
      <header className="border-b border-line bg-white px-6 py-5">
        <h1 className="font-display text-xl font-semibold text-ink">
          Human Resources &amp; Labour Management
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Company employee directory, reporting hierarchy, trade labour, contractor rosters, attendance, and leave.
        </p>
      </header>

      {/* ── Tab bar ── */}
      <nav
        className="flex overflow-x-auto border-b border-line bg-white px-6"
        aria-label="HR sections"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = validTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-muted hover:text-ink',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ── Tab content ── */}
      <main className="flex-1">
        {/* Module A: Employee Directory */}
        {validTab === 'employee-directory' && (
          <HrEmployeeDirectoryTab />
        )}

        {/* Module B: Organization / Reporting Hierarchy */}
        {validTab === 'org-hierarchy' && (
          <OrgHierarchyTab />
        )}

        {/* Module C: Labour Management */}
        {validTab === 'labour' && (
          <LabourManagementTab />
        )}

        {/* Module D: Contractor Workers */}
        {validTab === 'contractor-workers' && (
          <ContractorWorkersTab />
        )}

        {/* Module E: Attendance */}
        {validTab === 'attendance' && (
          <AttendanceTab />
        )}

        {/* Secondary: Labour Requests */}
        {validTab === 'labour-requests' && (
          <LabourRequestsTab />
        )}

        {/* Secondary: Leave */}
        {validTab === 'leave' && (
          <LeaveTab />
        )}

        {/* Secondary: HR Overview */}
        {validTab === 'overview' && (
          summaryLoading
            ? <LoadingPane />
            : <HrOverviewTab summary={summary ?? emptySummary} onSelectTab={setActiveTab} />
        )}
      </main>
    </div>
  );
}

function LoadingPane() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-ink-subtle">Loading…</p>
    </div>
  );
}

/** Prevent null-reference errors while the dashboard summary loads */
const emptySummary = {
  companyLabourCount: 0,
  contractorLabourCount: 0,
  totalWorkforce: 0,
  contractorOrgCount: 0,
  siteCount: 0,
  projectCount: 0,
  today: { present: 0, absent: 0, halfDay: 0, onLeave: 0, total: 0 },
  requests: { pendingReview: 0, approved: 0, partiallyAssigned: 0, total: 0 },
  pendingLeave: 0,
  contractorBreakdown: [],
};
