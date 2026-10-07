import { Card, CardHeader, CardBody } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import InfoList from './InfoList';
import { formatCurrency, formatDate, daysUntil } from '../../utils/format';
import { labelFor, PROJECT_TYPES } from '../../utils/projectOptions';

const typeLabel = (value) => PROJECT_TYPES.find((t) => t.value === value)?.label ?? labelFor({}, value);

/** Project info, client, team, timeline and budget in one scannable view. */
export default function OverviewTab({ detail }) {
  const { project, financials, progress } = detail;
  const remaining = daysUntil(project.expectedCompletion);
  const spentShare = financials.budget ? Math.round((financials.spent / financials.budget) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title="Project information" action={<StatusBadge status={project.status} />} />
          <CardBody className="space-y-5">
            <InfoList
              columns={2}
              items={[
                { label: 'Project code', value: project.code },
                { label: 'Type', value: typeLabel(project.projectType) },
                { label: 'Location', value: project.location },
                { label: 'Current phase', value: project.currentPhase },
                { label: 'Sites', value: `${project.siteCount} site${project.siteCount === 1 ? '' : 's'}` },
                { label: 'Contractor', value: project.contractor?.name },
              ]}
            />
            {project.description && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Description</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{project.description}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Project timeline" description={project.currentPhase ? `Currently in ${project.currentPhase}` : undefined} />
          <CardBody className="space-y-4">
            <InfoList
              columns={2}
              items={[
                { label: 'Start date', value: formatDate(project.startDate) },
                { label: 'Expected completion', value: formatDate(project.expectedCompletion) },
                {
                  label: 'Time remaining',
                  value: remaining === null ? '—' : remaining < 0
                    ? <span className="text-danger">Overdue by {Math.abs(remaining)} days</span>
                    : `${remaining} days`,
                },
                { label: 'Tasks completed', value: `${progress.completed} of ${progress.totalTasks}` },
              ]}
            />
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">Overall progress</span>
                <span className="font-medium tabular-nums text-ink">{progress.overall}%</span>
              </div>
              <ProgressBar value={progress.overall} status={project.status} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Client" />
          <CardBody>
            <InfoList items={[{ label: 'Client', value: project.client?.name }]} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Project team" />
          <CardBody>
            <InfoList
              items={[
                { label: 'Project manager', value: project.team.projectManager?.name },
                { label: 'Architect', value: project.team.architect?.name },
                { label: 'Site engineer', value: project.team.siteEngineer?.name },
                { label: 'Contractor', value: project.contractor?.name },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Budget" description={`${spentShare}% of budget committed`} />
          <CardBody className="space-y-4">
            <InfoList
              items={[
                { label: 'Estimated budget', value: formatCurrency(financials.budget) },
                { label: 'Spent to date', value: formatCurrency(financials.spent) },
                {
                  label: 'Remaining',
                  value: (
                    <span className={financials.remaining < 0 ? 'text-danger' : 'text-ink'}>
                      {formatCurrency(financials.remaining)}
                    </span>
                  ),
                },
              ]}
            />
            <ProgressBar value={spentShare} status={spentShare > 100 ? 'delayed' : 'on-track'} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
