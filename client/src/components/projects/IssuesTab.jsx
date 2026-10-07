import { AlertTriangle } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { formatDate } from '../../utils/format';
import { SEVERITY_TONE } from '../../utils/projectOptions';

/** Open and resolved issues, most urgent first. */
export default function IssuesTab({ detail }) {
  const { issues } = detail;
  const open = issues.filter((i) => i.status === 'open').length;

  if (issues.length === 0) {
    return (
      <Card>
        <EmptyState icon={AlertTriangle} title="No issues raised" description="Problems reported from site will be listed here." />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Issues" description={open ? `${open} still open` : 'All issues resolved'} />
      <ul className="divide-y divide-line">
        {issues.map((issue) => (
          <li key={issue.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`font-medium ${issue.status === 'resolved' ? 'text-ink-muted line-through' : 'text-ink'}`}>
                  {issue.title}
                </p>
                {issue.description && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{issue.description}</p>}
                <p className="mt-1.5 text-xs text-ink-subtle">
                  {issue.site_name ?? 'Project level'} · raised {formatDate(issue.raised_on)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={SEVERITY_TONE[issue.severity] ?? 'neutral'}>{issue.severity} severity</Badge>
                <Badge tone={issue.status === 'open' ? 'warning' : 'positive'}>
                  {issue.status === 'open' ? 'Open' : 'Resolved'}
                </Badge>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
