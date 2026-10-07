import { useState } from 'react';
import { HardHat, ClipboardList, CalendarClock } from 'lucide-react';
import ContractorWorkersTab from '../components/hr/ContractorWorkersTab';
import LabourRequestsTab from '../components/hr/LabourRequestsTab';
import AttendanceTab from '../components/hr/AttendanceTab';

/**
 * HR sub-page for the /contractor workspace.
 *
 * Tabs: My Workers | Labour Requests | Attendance
 *
 * All three components already scope their API calls by the signed-in
 * contractor's token server-side — no extra prop drilling needed. The
 * ContractorWorkersTab hides the contractor-picker column. The
 * LabourRequestsTab hides HR-only workflow actions. The AttendanceTab
 * is read-only for contractor (readOnly=true hides the Mark button).
 */
export default function ContractorHrPage() {
  const [activeTab, setActiveTab] = useState('workers');

  const tabs = [
    { id: 'workers',   label: 'My Workers',      icon: HardHat       },
    { id: 'requests',  label: 'Labour Requests',  icon: ClipboardList },
    { id: 'attendance',label: 'Attendance',       icon: CalendarClock },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white px-6 py-5">
        <h1 className="font-display text-xl font-semibold text-ink">Labour Management</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Your workers, requests, and attendance records.
        </p>
      </header>

      <nav className="flex overflow-x-auto border-b border-line bg-white px-6" aria-label="Contractor HR sections">
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
        {activeTab === 'workers'    && <ContractorWorkersTab />}
        {activeTab === 'requests'   && <LabourRequestsTab />}
        {activeTab === 'attendance' && <AttendanceTab readOnly />}
      </main>
    </div>
  );
}
