import { Users, HardHat, Building2, MapPin, ClipboardList, CalendarClock } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { formatNumber } from '../../utils/format';

/**
 * HR & Labour Management landing view. Every figure comes from
 * GET /hr/dashboard (hrDashboardService.getSummary) — nothing here is
 * hardcoded. `contractorBreakdown` is only present for ADMIN/HR callers;
 * a CONTRACTOR sees the same cards scoped to their own workforce.
 */
export default function HrOverviewTab({ summary, onSelectTab }) {
  const cards = [
    { label: 'Company Employees', value: summary.companyLabourCount, icon: Users, tone: 'text-brand-600 bg-brand-50', tab: 'employee-directory' },
    { label: 'Labour Workforce', value: summary.contractorLabourCount, icon: HardHat, tone: 'text-amber-700 bg-amber-50', tab: 'labour' },
    { label: 'Total Workforce', value: summary.totalWorkforce, icon: Users, tone: 'text-emerald-700 bg-emerald-50', tab: 'labour' },
    { label: 'Contractor Partners', value: summary.contractorOrgCount, icon: Building2, tone: 'text-brand-600 bg-brand-50', tab: 'contractor-workers' },
    { label: 'Active Sites', value: summary.siteCount, icon: MapPin, tone: 'text-brand-600 bg-brand-50', tab: 'attendance' },
    { label: 'Active Projects', value: summary.projectCount, icon: Building2, tone: 'text-brand-600 bg-brand-50', tab: 'attendance' },
  ];

  // A Card panel is clickable only when the host provided a tab navigator.
  const panelNav = (tab) =>
    onSelectTab
      ? {
          onClick: () => onSelectTab(tab),
          role: 'button',
          tabIndex: 0,
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectTab(tab);
            }
          },
          className: 'card-interactive',
        }
      : {};

  return (
    <div className="space-y-6 p-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const inner = (
            <div className="flex items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
                <card.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold tabular-nums leading-tight text-ink">{formatNumber(card.value)}</p>
                <p className="truncate text-xs text-ink-subtle">{card.label}</p>
              </div>
            </div>
          );

          return onSelectTab && card.tab ? (
            <button
              key={card.label}
              type="button"
              onClick={() => onSelectTab(card.tab)}
              aria-label={`${card.label} — open ${card.tab.replace('-', ' ')}`}
              className="card-interactive block rounded-xl border border-line bg-white px-4 py-3.5 text-left"
            >
              {inner}
            </button>
          ) : (
            <div key={card.label} className="rounded-xl border border-line bg-white px-4 py-3.5">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card {...panelNav('attendance')}>
          <CardHeader
            title="Today's attendance"
            description="Company + contractor labour marked so far today."
            action={<CalendarClock className="h-4 w-4 text-ink-subtle" aria-hidden="true" />}
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Present" value={summary.today.present} tone="positive" />
              <Stat label="Absent" value={summary.today.absent} tone="danger" />
              <Stat label="Half day" value={summary.today.halfDay} tone="warning" />
              <Stat label="On leave" value={summary.today.onLeave} tone="neutral" />
            </dl>
            <p className="mt-3 text-xs text-ink-subtle">{formatNumber(summary.today.total)} records marked today</p>
          </CardBody>
        </Card>

        <Card {...panelNav('labour-requests')}>
          <CardHeader
            title="Labour requests"
            description="Contractor requests awaiting action."
            action={<ClipboardList className="h-4 w-4 text-ink-subtle" aria-hidden="true" />}
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Pending review" value={summary.requests.pendingReview} tone="warning" />
              <Stat label="Approved" value={summary.requests.approved} tone="brand" />
              <Stat label="Partially assigned" value={summary.requests.partiallyAssigned} tone="brand" />
              <Stat label="Total" value={summary.requests.total} tone="neutral" />
            </dl>
            {summary.pendingLeave !== undefined && (
              <p className="mt-3 text-xs text-ink-subtle">{formatNumber(summary.pendingLeave)} leave requests pending</p>
            )}
          </CardBody>
        </Card>
      </div>

      {Array.isArray(summary.contractorBreakdown) && (
        <Card>
          <CardHeader title="Contractor-wise workforce" description="Active workers, assignments and sites per contractor." />
          {summary.contractorBreakdown.length === 0 ? (
            <EmptyState title="No contractor labour deployed yet" description="Contractor breakdowns will appear here once workers are assigned." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="px-5 py-3 font-medium">Contractor</th>
                    <th className="px-5 py-3 font-medium">Workers</th>
                    <th className="px-5 py-3 font-medium">Active assignments</th>
                    <th className="px-5 py-3 font-medium">Sites</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {summary.contractorBreakdown.map((row) => (
                    <tr key={row.contractorId}>
                      <td className="px-5 py-3 text-ink">{row.contractorName}</td>
                      <td className="px-5 py-3 tabular-nums text-ink-muted">{formatNumber(row.workerTotal)}</td>
                      <td className="px-5 py-3 tabular-nums text-ink-muted">{formatNumber(row.activeAssignmentTotal)}</td>
                      <td className="px-5 py-3 tabular-nums text-ink-muted">{formatNumber(row.siteTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd>
        <Badge tone={tone} className="mt-1">{formatNumber(value)}</Badge>
      </dd>
    </div>
  );
}
