import { HardHat, Phone, Mail, Star, Users } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge, { StatusBadge } from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import InfoList from './InfoList';
import { formatCurrency } from '../../utils/format';

/** Contract value, progress, payment position and open requests per contractor. */
export default function ContractorTab({ detail, onAssign }) {
  const { contractors = [], issues = [] } = detail || {};

  if (contractors.length === 0) {
    return (
      <Card>
        <CardBody className="py-8">
          <EmptyState
            icon={HardHat}
            title="No contractor engaged"
            description="Assign a contractor from the project team to see contract and payment details."
          />
          {typeof onAssign === 'function' && (
            <div className="mt-4 flex justify-center">
              <Button onClick={onAssign} className="gap-2">
                <Users className="h-4 w-4" />
                Assign Contractor
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {contractors.map((contractor) => {
        const paidShare = contractor.contract_value ? Math.round((contractor.paid_amount / contractor.contract_value) * 100) : 0;
        const contractorIssues = issues.filter((i) => i.status === 'open');

        return (
          <Card key={contractor.id}>
            <CardHeader
              title={contractor.name}
              description={contractor.speciality}
              action={<StatusBadge status={contractor.payment_status} />}
            />
            <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-4">
                <InfoList
                  items={[
                    { label: 'Contact person', value: contractor.contact_person },
                    {
                      label: 'Phone',
                      value: contractor.phone && (
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />{contractor.phone}</span>
                      ),
                    },
                    {
                      label: 'Email',
                      value: contractor.email && (
                        <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />{contractor.email}</span>
                      ),
                    },
                    {
                      label: 'Rating',
                      value: contractor.rating && (
                        <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />{Number(contractor.rating).toFixed(1)} / 5</span>
                      ),
                    },
                  ]}
                />
              </div>

              <div className="space-y-4">
                <InfoList
                  items={[
                    { label: 'Contract value', value: formatCurrency(contractor.contract_value) },
                    { label: 'Paid to date', value: formatCurrency(contractor.paid_amount) },
                    {
                      label: 'Outstanding',
                      value: (
                        <span className={contractor.outstanding > 0 ? 'text-danger' : 'text-ink'}>
                          {formatCurrency(contractor.outstanding)}
                        </span>
                      ),
                    },
                  ]}
                />
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="text-ink-muted">Paid</span>
                    <span className="tabular-nums text-ink">{paidShare}%</span>
                  </div>
                  <ProgressBar value={paidShare} status="on-track" />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Work progress</p>
                  <ProgressBar value={Math.round(contractor.work_progress)} status="on-track" showLabel />
                </div>
                <div className="flex flex-wrap gap-2">
                  {contractor.pending_approvals > 0 && (
                    <Badge tone="warning">{contractor.pending_approvals} pending approval{contractor.pending_approvals === 1 ? '' : 's'}</Badge>
                  )}
                  {contractorIssues.length > 0 && (
                    <Badge tone="danger">{contractorIssues.length} open issue{contractorIssues.length === 1 ? '' : 's'}</Badge>
                  )}
                  {contractor.pending_approvals === 0 && contractorIssues.length === 0 && (
                    <Badge tone="positive">Nothing outstanding</Badge>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
