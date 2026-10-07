import { Card, CardHeader, CardBody } from '../ui/Card';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';

/**
 * Summary figures pulled from the tabs above — the numbers someone would put
 * in a status report, in one place.
 */
export default function ReportsTab({ detail }) {
  const { project, progress, financials, materials, labour, issues, sites, approvals } = detail;

  const materialCost = materials.reduce((sum, m) => sum + Number(m.total_cost), 0);
  const labourCost = labour.reduce((sum, r) => sum + Number(r.daily_cost), 0);
  const openIssues = issues.filter((i) => i.status === 'open').length;
  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;

  const sections = [
    {
      title: 'Delivery',
      rows: [
        ['Overall completion', `${progress.overall}%`],
        ['Planned by today', `${progress.planned}%`],
        ['Schedule variance', `${progress.variance > 0 ? '+' : ''}${progress.variance}%`],
        ['Current phase', project.currentPhase ?? '—'],
        ['Tasks completed', `${progress.completed} of ${progress.totalTasks}`],
        ['Delayed tasks', formatNumber(progress.delayed)],
      ],
    },
    {
      title: 'Commercial',
      rows: [
        ['Estimated budget', formatCurrency(financials.budget)],
        ['Spent to date', formatCurrency(financials.spent)],
        ['Remaining budget', formatCurrency(financials.remaining)],
        ['Material purchases', formatCurrency(materialCost)],
        ['Labour cost (recorded)', formatCurrency(labourCost)],
        ['Contractor outstanding', formatCurrency(financials.contractorOutstanding)],
      ],
    },
    {
      title: 'Site and risk',
      rows: [
        ['Active sites', formatNumber(sites.length)],
        ['Workers engaged', formatNumber(labour.reduce((s, r) => s + r.worker_count, 0))],
        ['Open issues', formatNumber(openIssues)],
        ['Pending approvals', formatNumber(pendingApprovals)],
        ['Start date', formatDate(project.startDate)],
        ['Expected completion', formatDate(project.expectedCompletion)],
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader title={section.title} />
          <CardBody>
            <dl className="space-y-3">
              {section.rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5 last:border-0 last:pb-0">
                  <dt className="text-sm text-ink-muted">{label}</dt>
                  <dd className="shrink-0 text-sm font-medium tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
