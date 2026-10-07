import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, CalendarDays, ArrowUpRight, Building2 } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import Select from '../ui/Select';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import { formatDate, daysUntil } from '../../utils/format';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'on-track', label: 'On track' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'on-hold', label: 'On hold' },
];

/**
 * Which contractor is on which site, how far along it is and what happened
 * today — the Admin's main scanning surface.
 */
export default function SiteMonitor({ projects = [], contractors = [], isLoading, search = '' }) {
  const [status, setStatus] = useState('all');
  const [contractorId, setContractorId] = useState('all');

  const contractorOptions = useMemo(
    () => [
      { value: 'all', label: 'All contractors' },
      ...contractors.map((c) => ({ value: c.id, label: c.name })),
    ],
    [contractors]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (status !== 'all' && project.status !== status) return false;
      if (contractorId !== 'all' && project.contractorId !== contractorId) return false;
      if (!term) return true;
      return [project.name, project.contractor, project.location]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [projects, status, contractorId, search]);

  return (
    <Card>
      <CardHeader
        title="Project and site monitoring"
        description={`${visible.length} of ${projects.length} sites shown`}
        action={
          <>
            <Select label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} className="w-[150px]" />
            <Select label="Filter by contractor" value={contractorId} onChange={(e) => setContractorId(e.target.value)} options={contractorOptions} className="w-[170px]" />
            <Link
              to="/admin/projects"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              View all
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No sites match these filters"
          description="Try clearing the status or contractor filter, or adjust your search."
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((project) => (
            <SiteRow key={project.id} project={project} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SiteRow({ project }) {
  const remaining = daysUntil(project.expectedCompletion);
  const isOverdue = remaining !== null && remaining < 0;

  return (
    <li className="px-5 py-4 transition-colors hover:bg-canvas/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-ink">{project.name}</h3>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">{project.contractor}</p>
        </div>
        <span className="shrink-0 font-display text-lg font-semibold tabular-nums text-ink">
          {project.progress}%
        </span>
      </div>

      <ProgressBar value={project.progress} status={project.status} className="mt-3" />

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        <div className="flex items-center gap-1.5 text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <dt className="sr-only">Location</dt>
          <dd className="truncate">{project.location}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-ink-muted">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <dt className="sr-only">Started</dt>
          <dd>Started {formatDate(project.startDate)}</dd>
        </div>
        <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-danger' : 'text-ink-muted'}`}>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <dt className="sr-only">Expected completion</dt>
          <dd>
            {isOverdue ? `Overdue by ${Math.abs(remaining)} days` : `Due ${formatDate(project.expectedCompletion)}`}
          </dd>
        </div>
      </dl>

      <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm leading-relaxed text-ink-muted">
        <span className="font-medium text-ink">Today: </span>
        {project.todaysActivity}
      </p>
    </li>
  );
}
