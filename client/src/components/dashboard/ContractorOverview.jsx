import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ArrowUpRight, HardHat } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge, { StatusBadge } from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import Select from '../ui/Select';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import { formatCompactCurrency, formatNumber } from '../../utils/format';

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All payments' },
  { value: 'pending', label: 'Pending' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cleared', label: 'Cleared' },
];

/** Who is working where, with how many people, and what they are owed. */
export default function ContractorOverview({ contractors = [], projects = [], isLoading, search = '' }) {
  const [projectId, setProjectId] = useState('all');
  const [payment, setPayment] = useState('all');

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: 'All projects' },
      ...projects.map((project) => ({ value: project.id, label: project.name })),
    ],
    [projects]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contractors.filter((contractor) => {
      if (projectId !== 'all' && !contractor.projectIds.includes(projectId)) return false;
      if (payment !== 'all' && contractor.paymentStatus !== payment) return false;
      if (!term) return true;
      return [contractor.name, contractor.site, contractor.currentWork]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [contractors, projectId, payment, search]);

  return (
    <Card>
      <CardHeader
        title="Contractor overview"
        description={`${visible.length} of ${contractors.length} contractors shown`}
        action={
          <>
            <Select label="Filter by project" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projectOptions} className="w-[170px]" />
            <Select label="Filter by payment status" value={payment} onChange={(e) => setPayment(e.target.value)} options={PAYMENT_OPTIONS} className="w-[150px]" />
            <Link
              to="/admin/contractors"
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
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No contractors match these filters"
          description="Clear the project or payment filter to see the full list."
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((contractor) => (
            <li key={contractor.id} className="px-5 py-4 transition-colors hover:bg-canvas/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-ink">{contractor.name}</h3>
                  <p className="mt-0.5 text-sm text-ink-muted">{contractor.site}</p>
                </div>
                <StatusBadge status={contractor.paymentStatus} />
              </div>

              <p className="mt-2 text-sm text-ink-muted">
                <span className="text-ink-subtle">Current work: </span>
                {contractor.currentWork}
              </p>

              <ProgressBar value={contractor.progress} showLabel className="mt-3" />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {formatNumber(contractor.workers)} workers
                </Badge>
                {contractor.pendingApprovals > 0 && (
                  <Badge tone="warning">{contractor.pendingApprovals} pending approvals</Badge>
                )}
                {contractor.outstanding > 0 && (
                  <Badge tone={contractor.paymentStatus === 'overdue' ? 'danger' : 'neutral'}>
                    {formatCompactCurrency(contractor.outstanding)} outstanding
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
