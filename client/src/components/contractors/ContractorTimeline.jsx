import { CheckCircle2, Clock, XCircle, ArrowRight, ShieldCheck, PenTool, Send, FileText, Building2, UserPlus, DollarSign } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import { formatDate } from '../../utils/format';

export default function ContractorTimeline({ contractor, pos = [], poSummary = {} }) {
  const latestPo = pos[0] || null;

  // Build the complete 9-stage lifecycle steps
  const steps = [
    {
      id: 'created',
      title: '1. Contractor Profile Created',
      description: `${contractor.name} registered in directory`,
      timestamp: contractor.createdAt,
      status: 'completed',
      icon: UserPlus,
    },
    {
      id: 'assigned',
      title: '2. Assigned to Project / Site',
      description: contractor.stats?.projectCount > 0
        ? `Assigned to ${contractor.stats.projectCount} project(s) and ${contractor.stats.siteCount} site(s)`
        : 'Not assigned to projects yet',
      timestamp: null,
      status: contractor.stats?.projectCount > 0 ? 'completed' : 'pending',
      icon: Building2,
    },
    {
      id: 'po_created',
      title: '3. Work / Purchase Order Created',
      description: latestPo
        ? `Order ${latestPo.po_number || latestPo.poNumber} created with milestone budget`
        : 'Awaiting creation of first work order',
      timestamp: latestPo?.created_at || latestPo?.createdAt,
      status: latestPo ? 'completed' : 'pending',
      icon: FileText,
    },
    {
      id: 'po_sent',
      title: '4. PO Sent to Contractor',
      description: latestPo && latestPo.status !== 'draft'
        ? `Transmitted for contractor review`
        : 'Draft PO under internal review',
      timestamp: latestPo && latestPo.status !== 'draft' ? latestPo.updated_at : null,
      status: latestPo && latestPo.status !== 'draft' ? 'completed' : 'pending',
      icon: Send,
    },
    {
      id: 'po_accepted',
      title: latestPo?.status === 'rejected' ? '5. PO Rejected by Contractor' : '5. PO Accepted by Contractor',
      description: latestPo?.status === 'rejected'
        ? `Reason: "${latestPo.rejection_reason || 'Rejection on record'}"`
        : ['accepted', 'contractor_signed', 'contract_signed', 'completed'].includes(latestPo?.status)
          ? 'Contract terms & delivery milestones accepted'
          : 'Pending contractor formal acceptance',
      timestamp: ['accepted', 'contractor_signed', 'contract_signed', 'completed', 'rejected'].includes(latestPo?.status)
        ? latestPo.updated_at
        : null,
      status: latestPo?.status === 'rejected'
        ? 'rejected'
        : ['accepted', 'contractor_signed', 'contract_signed', 'completed'].includes(latestPo?.status)
          ? 'completed'
          : 'pending',
      icon: latestPo?.status === 'rejected' ? XCircle : CheckCircle2,
    },
    {
      id: 'contractor_signed',
      title: '6. Contractor Digitally Signed',
      description: latestPo?.contractor_signed_at || latestPo?.contractorSignedAt
        ? `Signed by ${latestPo.contractor_signed_name || latestPo.contractorSignedName}`
        : 'Awaiting contractor digital signature',
      timestamp: latestPo?.contractor_signed_at || latestPo?.contractorSignedAt,
      status: latestPo?.contractor_signed_at || latestPo?.contractorSignedAt ? 'completed' : 'pending',
      icon: PenTool,
    },
    {
      id: 'company_signed',
      title: '7. Company Executive Signed',
      description: latestPo?.company_signed_at || latestPo?.companySignedAt
        ? `Countersigned by ${latestPo.company_signed_name || latestPo.companySignedName} (${latestPo.company_signed_designation || 'Project Director'})`
        : 'Awaiting company executive signature',
      timestamp: latestPo?.company_signed_at || latestPo?.companySignedAt,
      status: latestPo?.company_signed_at || latestPo?.companySignedAt ? 'completed' : 'pending',
      icon: ShieldCheck,
    },
    {
      id: 'contract_signed',
      title: '8. Contract Executed & Sealed',
      description: latestPo?.status === 'contract_signed' || latestPo?.status === 'completed'
        ? 'Legal digital contract generated and permanently locked'
        : 'Final dual-signed document execution',
      timestamp: latestPo?.status === 'contract_signed' ? latestPo.updated_at : null,
      status: latestPo?.status === 'contract_signed' || latestPo?.status === 'completed' ? 'completed' : 'pending',
      icon: FileText,
    },
    {
      id: 'payments',
      title: '9. Milestone Certification & Payments',
      description: poSummary.milestonesCompleted > 0
        ? `${poSummary.milestonesCompleted} of ${poSummary.totalMilestones} milestones certified (${poSummary.paymentProgress || 0}% paid)`
        : 'Work underway; milestone certifications pending',
      timestamp: null,
      status: poSummary.milestonesCompleted > 0
        ? (poSummary.milestonesPending === 0 ? 'completed' : 'in_progress')
        : 'pending',
      icon: DollarSign,
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Contractor Engagement & Order Timeline"
        description="Comprehensive audit trail from onboarding and project assignment to PO execution, signatures, and payments."
      />
      <CardBody>
        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:bottom-3 before:top-3 before:left-3.5 sm:before:left-4.5 before:w-0.5 before:bg-line">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = step.status === 'completed';
            const isRejected = step.status === 'rejected';
            const isInProgress = step.status === 'in_progress';

            const dotBg = isCompleted
              ? 'bg-emerald-600 text-white ring-4 ring-emerald-50'
              : isRejected
                ? 'bg-red-600 text-white ring-4 ring-red-50'
                : isInProgress
                  ? 'bg-brand-600 text-white ring-4 ring-brand-50 animate-pulse'
                  : 'bg-canvas text-ink-subtle ring-4 ring-line';

            return (
              <div key={step.id} className="relative flex items-start gap-4">
                {/* Node icon */}
                <div className={`absolute -left-6 sm:-left-8 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${dotBg}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>

                {/* Step Content */}
                <div className="flex-1 rounded-xl border border-line bg-canvas/30 p-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <h4 className="text-xs font-bold text-ink flex items-center gap-2">
                      {step.title}
                      {isCompleted && (
                        <Badge tone="positive" className="text-[10px]">Completed</Badge>
                      )}
                      {isRejected && (
                        <Badge tone="danger" className="text-[10px]">Rejected</Badge>
                      )}
                      {isInProgress && (
                        <Badge tone="brand" className="text-[10px]">In Progress</Badge>
                      )}
                    </h4>
                    {step.timestamp && (
                      <span className="text-[11px] text-ink-subtle">
                        {formatDate(step.timestamp)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
