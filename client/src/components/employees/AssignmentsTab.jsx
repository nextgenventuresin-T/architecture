import { Link } from 'react-router-dom';
import { Building2, MapPin, X } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge, { StatusBadge } from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import EmptyState from '../ui/EmptyState';
import { formatCompactCurrency, formatDate } from '../../utils/format';

/**
 * Everything this employee is attached to. Projects and sites merge two
 * sources: the team roles Interface 3 stores on projects/sites, and the
 * explicit postings Interface 5 records. The history list below shows only the
 * explicit postings, which are the ones that can be ended here.
 */
export default function AssignmentsTab({ projects, sites, assignments, onEndAssignment, endingId }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Assigned projects"
          description="Projects where this employee holds a team role or an assignment."
        />
        {projects.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Not assigned to any project"
            description={'Use "Assign" to put this employee on a project.'}
          />
        ) : (
          <ul className="divide-y divide-line">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link
                    to={`/admin/projects/${project.id}`}
                    className="font-medium text-ink hover:text-brand-700 hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {project.code} · {project.location} · due {formatDate(project.expected_completion)}
                  </p>
                  {project.roles && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {project.roles.split(', ').map((role) => (
                        <Badge key={role} tone="brand">{role}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-ink-muted">
                    {formatCompactCurrency(project.estimated_budget)}
                  </span>
                  <div className="w-28">
                    <ProgressBar value={project.progress} status={project.status} showLabel />
                  </div>
                  <StatusBadge status={project.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Assigned sites" description="Individual sites this employee works on." />
        {sites.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Not assigned to any site"
            description="Assign this employee to a specific site to see it here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {sites.map((site) => (
              <li key={site.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link
                    to={`/admin/projects/${site.project_id}/sites/${site.id}`}
                    className="font-medium text-ink hover:text-brand-700 hover:underline"
                  >
                    {site.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {site.project_code} · {site.project_name}
                  </p>
                  {site.roles && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {site.roles.split(', ').map((role) => (
                        <Badge key={role} tone="brand">{role}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-ink-muted">{site.labour_count} labour</span>
                  <div className="w-28">
                    <ProgressBar value={site.progress} status={site.status} showLabel />
                  </div>
                  <StatusBadge status={site.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Assignment history"
          description="Postings recorded in Employee Management, current first."
        />
        {assignments.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No assignment history"
            description="Assignments made from this screen are listed here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {assignments.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {row.site_name || row.project_name || 'Unassigned'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {row.site_name && row.project_name ? `${row.project_name} · ` : ''}
                    from {formatDate(row.assigned_on)}
                    {row.end_date ? ` to ${formatDate(row.end_date)}` : ''}
                  </p>
                  {row.notes && <p className="mt-1.5 text-sm text-ink-muted">{row.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {row.role && <Badge tone="neutral">{row.role}</Badge>}
                  {row.is_current ? (
                    <>
                      <Badge tone="positive">Current</Badge>
                      <button
                        type="button"
                        onClick={() => onEndAssignment(row.id)}
                        disabled={endingId === row.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="End this assignment"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {endingId === row.id ? 'Ending…' : 'End'}
                      </button>
                    </>
                  ) : (
                    <Badge tone="neutral">Ended</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
