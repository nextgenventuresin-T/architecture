import { useState } from 'react';
import { CalendarClock, CalendarDays } from 'lucide-react';
import AttendanceTab from '../components/hr/AttendanceTab';
import LeaveTab from '../components/hr/LeaveTab';

/**
 * HR sub-page for the /employee workspace.
 *
 * Tabs: Attendance (view-only) | Leave (apply + history)
 *
 * AttendanceTab receives readOnly=true so the "Mark attendance" button
 * is hidden — employees cannot mark their own attendance.
 * LeaveTab receives employeeOnly=true so the approve/reject actions are
 * hidden; the "Apply for leave" button and "Withdraw" action are shown.
 * The backend further enforces both constraints by role.
 */
export default function EmployeeHrPage() {
  const [activeTab, setActiveTab] = useState('attendance');

  const tabs = [
    { id: 'attendance', label: 'Attendance', icon: CalendarClock },
    { id: 'leave',      label: 'Leave',      icon: CalendarDays  },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white px-6 py-5">
        <h1 className="font-display text-xl font-semibold text-ink">My Attendance &amp; Leave</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          View your attendance records and manage leave applications.
        </p>
      </header>

      <nav className="flex overflow-x-auto border-b border-line bg-white px-6" aria-label="Employee HR sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
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

      <main className="flex-1">
        {activeTab === 'attendance' && <AttendanceTab readOnly />}
        {activeTab === 'leave'      && <LeaveTab employeeOnly />}
      </main>
    </div>
  );
}
