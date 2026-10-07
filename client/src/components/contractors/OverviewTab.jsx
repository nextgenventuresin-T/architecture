import { Phone, Mail, MapPin, Star, UserCheck, UserX, FileText, CheckCircle2, Building2, HardHat, DollarSign } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import InfoList from '../projects/InfoList';
import Badge from '../ui/Badge';
import { formatCurrency } from '../../utils/format';
import { CONTRACTOR_TYPE_LABELS } from '../../utils/contractorOptions';

/** Contact details, notes and the headline visual dashboard for one contractor (Requirement 14). */

export default function OverviewTab({ contractor, poSummary = {}, documentsCount = 0 }) {
  const { stats } = contractor;

  const totalPoValue = poSummary.totalPoValue ?? stats.contractValue ?? 0;
  const advancePaid = poSummary.advancePaid ?? 0;
  const releasedAmount = poSummary.releasedAmount ?? stats.paidAmount ?? 0;
  const pendingAmount = poSummary.pendingAmount ?? stats.outstanding ?? 0;
  const paymentProgress = poSummary.paymentProgress ?? (totalPoValue > 0 ? Math.round((releasedAmount / totalPoValue) * 100) : 0);

  return (
    <div className="space-y-6">
      {/* SECTION 14: Visual Dashboard KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Total PO Value</span>
          <div className="mt-1 text-xl font-bold tracking-tight text-ink">{formatCurrency(totalPoValue)}</div>
          <p className="mt-1 text-xs text-ink-muted">{poSummary.totalPos || 0} work orders</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Advance Paid</span>
          <div className="mt-1 text-xl font-bold tracking-tight text-brand-700">{formatCurrency(advancePaid)}</div>
          <p className="mt-1 text-xs text-ink-muted">Agreed mobilization</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Amount Released</span>
          <div className="mt-1 text-xl font-bold tracking-tight text-emerald-600">{formatCurrency(releasedAmount)}</div>
          <p className="mt-1 text-xs text-ink-muted">Payments settled</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Amount Pending</span>
          <div className="mt-1 text-xl font-bold tracking-tight text-amber-600">{formatCurrency(pendingAmount)}</div>
          <p className="mt-1 text-xs text-ink-muted">Remaining balance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Contact & Profile */}
        <Card className="lg:col-span-2">
          <CardHeader title="Contractor Information" description={CONTRACTOR_TYPE_LABELS[contractor.type] ?? contractor.type} />
          <CardBody>
            <InfoList
              columns={2}
              items={[
                { label: 'Contact person', value: contractor.contactPerson },
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
                  label: 'Address',
                  value: contractor.address && (
                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />{contractor.address}</span>
                  ),
                },
                {
                  label: 'Rating',
                  value: contractor.rating && (
                    <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />{contractor.rating.toFixed(1)} / 5</span>
                  ),
                },
                {
                  label: 'Compliance Documents',
                  value: `${documentsCount} file(s) on record`,
                },
              ]}
            />

            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Portal access</p>
              {contractor.linkedUser ? (
                <div className="flex items-center gap-2 text-sm text-ink">
                  <UserCheck className="h-4 w-4 text-success" aria-hidden="true" />
                  <span>{contractor.linkedUser.fullName} ({contractor.linkedUser.email})</span>
                  {!contractor.linkedUser.isActive && <Badge tone="warning">Account inactive</Badge>}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <UserX className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                  <span>No user account linked — this contractor cannot sign in yet.</span>
                </div>
              )}
            </div>

            {contractor.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Notes</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{contractor.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Engagement & Milestones Snapshot */}
        <Card>
          <CardHeader title="At a glance" />
          <CardBody className="space-y-5">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">Payment Progress</span>
                <span className="tabular-nums font-semibold text-ink">{paymentProgress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-canvas-subtle border border-line overflow-hidden">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${paymentProgress}%` }} />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">Average work progress</span>
                <span className="tabular-nums font-semibold text-ink">{stats.progress}%</span>
              </div>
              <ProgressBar value={stats.progress} status="on-track" />
            </div>

            <InfoList
              items={[
                { label: 'Assigned projects', value: stats.projectCount },
                { label: 'Assigned sites', value: stats.siteCount },
                { label: 'Active POs', value: poSummary.activePosCount ?? pos?.length ?? 0 },
                { label: 'Pending acceptance', value: poSummary.sentPos ?? 0 },
                { label: 'Signed contracts', value: poSummary.signedContractsCount ?? 0 },
                { label: 'Labour workforce', value: `${stats.labourCount} workers` },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {/* Statutory & Banking Details Card */}
      <Card>
        <CardHeader
          title="Statutory & Banking Credentials"
          description="Official identity, tax identifiers and banking details for payments and statutory compliance."
        />
        <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-brand-600" />
              Tax & Identity Identifiers
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-ink-subtle block text-[10px] uppercase font-semibold">PAN Card</span>
                <span className="font-mono font-medium text-ink text-sm">{contractor.panNumber || contractor.pan_number || '—'}</span>
              </div>
              <div>
                <span className="text-ink-subtle block text-[10px] uppercase font-semibold">Aadhaar Card</span>
                <span className="font-mono font-medium text-ink text-sm">{contractor.aadhaarNumber || contractor.aadhaar_number || '—'}</span>
              </div>
              <div>
                <span className="text-ink-subtle block text-[10px] uppercase font-semibold">GSTIN</span>
                <span className="font-mono font-medium text-ink text-sm">{contractor.gstNumber || contractor.gst_number || '—'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              Official Bank Account
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-ink-subtle block text-[10px] uppercase font-semibold">Holder Name</span>
                <span className="font-medium text-ink">{contractor.bankAccountHolder || contractor.bank_account_holder || '—'}</span>
              </div>
              <div>
                <span className="text-ink-subtle block text-[10px] uppercase font-semibold">Account Number</span>
                <span className="font-mono font-medium text-ink">{contractor.bankAccountNumber || contractor.bank_account_number || '—'}</span>
              </div>
              <div>
                <span className="text-ink-subtle block text-[10px] uppercase font-semibold">Bank & Branch</span>
                <span className="font-medium text-ink">
                  {contractor.bankName || contractor.bank_name ? `${contractor.bankName || contractor.bank_name}${contractor.bankBranch || contractor.bank_branch ? ` (${contractor.bankBranch || contractor.bank_branch})` : ''}` : '—'}
                </span>
              </div>
              <div>
                <span className="text-ink-subtle block text-[10px] uppercase font-semibold">IFSC Code</span>
                <span className="font-mono font-medium text-ink">{contractor.bankIfsc || contractor.bank_ifsc || '—'}</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

