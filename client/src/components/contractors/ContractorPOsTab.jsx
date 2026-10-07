import { useState } from 'react';
import {
  Plus,
  Eye,
  Send,
  PenTool,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Building2,
  Calendar,
  Layers,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import Alert from '../ui/Alert';
import { formatCurrency, formatDate } from '../../utils/format';
import { contractorPoApi } from '../../api/contractorPoApi';
import CreatePOModal from './CreatePOModal';
import DigitalPOPreviewModal from './DigitalPOPreviewModal';
import CompanySignatureDialog from './CompanySignatureDialog';

export default function ContractorPOsTab({ contractor, pos = [], poSummary = {}, onChanged }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [poToEdit, setPoToEdit] = useState(null);
  const [selectedPo, setSelectedPo] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSignOpen, setIsSignOpen] = useState(false);
  const [loadingPoId, setLoadingPoId] = useState(null);
  const [expandedPoId, setExpandedPoId] = useState(null);

  // Certify milestone modal state
  const [certifyingMilestone, setCertifyingMilestone] = useState(null); // { poId, milestone }
  const [certifyRemarks, setCertifyRemarks] = useState('');
  const [isCertifying, setIsCertifying] = useState(false);

  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Send PO to contractor
  async function handleSend(po) {
    const poNum = po.po_number || po.poNumber;
    if (!window.confirm(`Send Purchase Order "${poNum}" to ${contractor.name}?`)) return;
    setError(null);
    try {
      await contractorPoApi.send(po.id);
      setActionSuccess(`Purchase Order ${poNum} transmitted to ${contractor.name} for review & acceptance.`);
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to send PO.');
    }
  }

  // Delete draft or rejected PO
  async function handleDelete(po) {
    const poNum = po.po_number || po.poNumber;
    if (!window.confirm(`Are you sure you want to permanently delete PO "${poNum}"?`)) return;
    setError(null);
    try {
      await contractorPoApi.remove(po.id);
      setActionSuccess(`Purchase Order ${poNum} deleted.`);
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to delete PO.');
    }
  }

  // Open Preview with full detail
  async function handleOpenPreview(po) {
    setLoadingPoId(po.id);
    setError(null);
    try {
      const fullPo = await contractorPoApi.detail(po.id);
      setSelectedPo(fullPo);
      setIsPreviewOpen(true);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to load PO details for preview.');
    } finally {
      setLoadingPoId(null);
    }
  }

  // Open Edit modal
  async function handleOpenEdit(po) {
    setLoadingPoId(po.id);
    setError(null);
    try {
      const fullPo = await contractorPoApi.detail(po.id);
      setPoToEdit(fullPo);
      setIsCreateOpen(true);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to load PO for editing.');
    } finally {
      setLoadingPoId(null);
    }
  }

  // Open Company Sign modal
  async function handleOpenCompanySign(po) {
    setLoadingPoId(po.id);
    setError(null);
    try {
      const fullPo = await contractorPoApi.detail(po.id);
      setSelectedPo(fullPo);
      setIsSignOpen(true);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to open company signature dialog.');
    } finally {
      setLoadingPoId(null);
    }
  }

  // Submit Milestone Certification
  async function submitMilestoneCertification(e) {
    e?.preventDefault();
    if (!certifyingMilestone) return;
    setIsCertifying(true);
    setError(null);
    try {
      const { poId, milestone } = certifyingMilestone;
      await contractorPoApi.completeMilestone(poId, milestone.id, {
        remarks: certifyRemarks.trim() || undefined,
      });
      setActionSuccess(`Milestone "${milestone.milestoneName || milestone.milestone_name}" marked as certified & completed! Amount ₹${milestone.amount} is now due.`);
      setCertifyingMilestone(null);
      setCertifyRemarks('');
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to certify milestone.');
    } finally {
      setIsCertifying(false);
    }
  }

  const {
    totalPoValue = 0,
    advancePaid = 0,
    releasedAmount = 0,
    pendingAmount = 0,
    amountDue = 0,
    paymentProgress = 0,
    totalMilestones = 0,
    milestonesCompleted = 0,
    milestonesPending = 0,
  } = poSummary;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return <Badge tone="neutral">Draft</Badge>;
      case 'sent':
        return <Badge tone="brand">Sent to Contractor</Badge>;
      case 'viewed':
        return <Badge tone="brand">Viewed by Contractor</Badge>;
      case 'accepted':
        return <Badge tone="positive">Accepted by Contractor</Badge>;
      case 'rejected':
        return <Badge tone="danger">Rejected by Contractor</Badge>;
      case 'contractor_signed':
        return <Badge tone="warning">Contractor Signed · Awaiting Seal</Badge>;
      case 'company_signed':
      case 'contract_signed':
        return <Badge tone="positive">Contract Executed & Sealed</Badge>;
      case 'completed':
        return <Badge tone="positive">Completed</Badge>;
      default:
        return <Badge tone="neutral">{status?.toUpperCase()?.replace(/_/g, ' ')}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert tone="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {actionSuccess && (
        <Alert tone="success" onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}

      {/* SECTION 1: Payment / PO Graphic View Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: PO Value */}
        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Total Order Value</span>
          <div className="mt-1 text-2xl font-bold tracking-tight text-ink">
            {formatCurrency(totalPoValue)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">{pos.length} total work order{pos.length === 1 ? '' : 's'}</p>
        </div>

        {/* Card 2: Advance Paid */}
        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Advance Paid</span>
          <div className="mt-1 text-2xl font-bold tracking-tight text-brand-700">
            {formatCurrency(advancePaid)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">Agreed advance settled</p>
        </div>

        {/* Card 3: Released Amount */}
        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Released</span>
          <div className="mt-1 text-2xl font-bold tracking-tight text-emerald-600">
            {formatCurrency(releasedAmount)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">Actual ledger settlements</p>
        </div>

        {/* Card 4: Pending Amount */}
        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">Pending Balance</span>
          <div className="mt-1 text-2xl font-bold tracking-tight text-amber-600">
            {formatCurrency(pendingAmount)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">Due: {formatCurrency(amountDue)}</p>
        </div>
      </div>

      {/* SECTION 2: Payment Progress Bar & Milestone Status Visualization */}
      <Card>
        <CardBody className="space-y-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-ink">Payment Progress</span>
              <span className="font-mono text-sm font-bold text-ink">{paymentProgress}% Released</span>
            </div>
            <div className="h-3 w-full rounded-full bg-canvas-subtle border border-line overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, paymentProgress))}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-ink-subtle">
              <span>₹0</span>
              <span>Due / Certified: <strong>{formatCurrency(amountDue)}</strong></span>
              <span>Total PO Value: {formatCurrency(totalPoValue)}</span>
            </div>
          </div>

          {/* Milestones Summary checklist */}
          <div className="border-t border-line pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">Milestone Progress Visualization</h4>
              <span className="text-xs text-ink-subtle">
                {milestonesCompleted} Completed · {milestonesPending} Pending
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/30 px-3.5 py-2.5 text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-semibold text-ink">{milestonesCompleted} Milestones</div>
                  <div className="text-[11px] text-ink-subtle">Certified Complete</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/30 px-3.5 py-2.5 text-xs">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <div className="font-semibold text-ink">{milestonesPending} Milestones</div>
                  <div className="text-[11px] text-ink-subtle">Work in Progress</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/30 px-3.5 py-2.5 text-xs">
                <FileText className="h-4 w-4 text-brand-600 shrink-0" />
                <div>
                  <div className="font-semibold text-ink">{poSummary.signedContractsCount || 0} Contracts</div>
                  <div className="text-[11px] text-ink-subtle">Dual-Signed & Sealed</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/30 px-3.5 py-2.5 text-xs">
                <AlertCircle className="h-4 w-4 text-purple-600 shrink-0" />
                <div>
                  <div className="font-semibold text-ink">{poSummary.contractorSignedPos || 0} Awaiting Seal</div>
                  <div className="text-[11px] text-ink-subtle">Signed by Contractor</div>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* SECTION 3: Interactive Purchase & Work Orders List */}
      <Card>
        <CardHeader
          title="Purchase & Work Orders"
          description={`Review, issue, certify milestones, and track execution for ${contractor.name}`}
          actions={
            <Button
              onClick={() => {
                setPoToEdit(null);
                setIsCreateOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create PO
            </Button>
          }
        />
        <CardBody className="p-0">
          {(() => {
            const posList = Array.isArray(pos) ? pos : (pos?.pos || []);
            if (posList.length === 0) {
              return (
                <EmptyState
                  icon={FileText}
                  title="No Purchase Orders created yet"
                  description={'Click "Create PO" to create an order linked to a project/site assignment with milestone budgeting and terms.'}
                />
              );
            }
            return (
              <div className="divide-y divide-line">
                {posList.map((po) => {
                const poNum = po.po_number || po.poNumber;
                const poId = po.id;
                const isDraft = po.status === 'draft';
                const isRejected = po.status === 'rejected';
                const isContractorSigned = po.status === 'contractor_signed';
                const isContractSigned = po.status === 'contract_signed' || Boolean(po.companySignedAt || po.company_signed_at);
                const isExpanded = expandedPoId === poId;

                const poMilestones = po.milestones || [];
                const totalMilestonesCount = poMilestones.length;
                const completedMilestonesCount = poMilestones.filter((m) => m.status === 'completed').length;
                const milestoneRatio = totalMilestonesCount > 0 ? Math.round((completedMilestonesCount / totalMilestonesCount) * 100) : 0;

                const canSend = ['draft', 'rejected', 'viewed'].includes(po.status);
                const canEdit = ['draft', 'rejected'].includes(po.status);
                const canDelete = ['draft', 'rejected'].includes(po.status);

                return (
                  <div key={poId} className="p-5 transition-colors hover:bg-canvas/30">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      {/* Left: PO Header & Metadata */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-base font-bold text-brand-800">{poNum}</span>
                          {getStatusBadge(po.status)}
                          <span className="text-xs text-ink-subtle flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-ink-subtle" />
                            Issued: {formatDate(po.po_date || po.poDate)}
                          </span>
                          {(po.validity_date || po.validityDate) && (
                            <span className="text-xs text-ink-subtle">
                              · Target: <strong className="text-ink">{formatDate(po.validity_date || po.validityDate)}</strong>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                          <span className="flex items-center gap-1.5 font-medium text-ink">
                            <Building2 className="h-3.5 w-3.5 text-brand-600" />
                            {po.project_name || po.project?.name} ({po.project_code || po.project?.code})
                          </span>
                          <span>
                            Site: <strong className="text-ink">{po.site_name || po.site?.name || 'All Sites / Whole Project'}</strong>
                          </span>
                        </div>

                        {(po.work_description || po.workDescription) && (
                          <p className="text-xs text-ink-subtle line-clamp-1 max-w-2xl">
                            {po.work_description || po.workDescription}
                          </p>
                        )}
                      </div>

                      {/* Right: Financial Numbers */}
                      <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-canvas/40 px-4 py-2.5 text-right shrink-0">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">PO Total</div>
                          <div className="text-sm font-bold text-brand-800">{formatCurrency(po.total_amount || po.totalAmount)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Advance</div>
                          <div className="text-xs font-semibold text-ink">{formatCurrency(po.advance_amount || po.advanceAmount)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Milestones</div>
                          <div className="text-xs font-semibold text-ink">
                            {completedMilestonesCount} / {totalMilestonesCount} ({milestoneRatio}%)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Rejection Notice Banner if rejected */}
                    {isRejected && (po.rejection_reason || po.rejectionReason) && (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Contractor Rejection Note: </span>
                            {po.rejection_reason || po.rejectionReason}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenEdit(po)}
                            className="text-xs py-1 px-2.5 border-rose-300 hover:bg-rose-100"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit & Revise
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSend(po)}
                            className="text-xs py-1 px-2.5 bg-rose-700 hover:bg-rose-800 text-white"
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Re-send
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Action Controls Bar */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line/70">
                      <div className="flex items-center gap-2">
                        {/* Preview / Detail Modal */}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenPreview(po)}
                          disabled={loadingPoId === poId}
                          className="gap-1.5 text-xs"
                          title="Preview full Digital PO and Terms"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview Document
                        </Button>

                        {/* Expand / Collapse Milestones */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedPoId(isExpanded ? null : poId)}
                          className="gap-1.5 text-xs text-ink-subtle hover:text-ink"
                        >
                          <Layers className="h-3.5 w-3.5 text-brand-600" />
                          {totalMilestonesCount} Milestones
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 ml-0.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5" />}
                        </Button>

                        {/* Download PDF */}
                        <a
                          href={contractorPoApi.getPdfDownloadUrl(poId, isContractSigned)}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-ink-subtle">
                            <Download className="h-3.5 w-3.5" />
                            {isContractSigned ? 'Signed Contract PDF' : 'PO PDF'}
                          </Button>
                        </a>
                      </div>

                      {/* Right: State Action Buttons */}
                      <div className="flex items-center gap-2">
                        {/* Edit button */}
                        {canEdit && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenEdit(po)}
                            disabled={loadingPoId === poId}
                            className="gap-1.5 text-xs"
                            title="Edit purchase order parameters and milestones"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        )}

                        {/* Send / Resend button */}
                        {canSend && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSend(po)}
                            className="gap-1.5 text-xs text-brand-700 border-brand-200 hover:bg-brand-50"
                            title="Send order to contractor for acceptance"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {isRejected ? 'Re-send PO' : 'Send to Contractor'}
                          </Button>
                        )}

                        {/* Sign Company Side button */}
                        {isContractorSigned && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenCompanySign(po)}
                            disabled={loadingPoId === poId}
                            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            title="Counter-sign and execute binding contract"
                          >
                            <PenTool className="h-3.5 w-3.5" />
                            Sign Company Side
                          </Button>
                        )}

                        {/* Delete button */}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(po)}
                            className="rounded-lg p-1.5 text-ink-subtle hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            title="Delete draft or rejected PO"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Milestones Schedule Panel when expanded */}
                    {isExpanded && (
                      <div className="mt-4 rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-line pb-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
                            <Layers className="h-4 w-4 text-brand-700" />
                            Milestone Schedule & Certification ({totalMilestonesCount})
                          </h4>
                          <span className="text-xs text-ink-subtle">
                            {completedMilestonesCount} Completed · {totalMilestonesCount - completedMilestonesCount} Pending
                          </span>
                        </div>

                        {poMilestones.length === 0 ? (
                          <p className="py-3 text-xs text-ink-subtle italic">No milestones defined for this order.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-line bg-white">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-canvas-subtle border-b border-line font-semibold text-ink-subtle uppercase">
                                <tr>
                                  <th className="px-3.5 py-2.5">#</th>
                                  <th className="px-3.5 py-2.5">Milestone Name</th>
                                  <th className="px-3.5 py-2.5">Trigger Condition</th>
                                  <th className="px-3.5 py-2.5 text-right">%</th>
                                  <th className="px-3.5 py-2.5 text-right">Amount (₹)</th>
                                  <th className="px-3.5 py-2.5 text-right">Status</th>
                                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {poMilestones.map((m, idx) => {
                                  const isCompleted = m.status === 'completed';
                                  const name = m.milestoneName || m.milestone_name;
                                  const trigger = m.conditionTrigger || m.condition_trigger || '—';

                                  return (
                                    <tr key={m.id || idx} className="hover:bg-canvas/50">
                                      <td className="px-3.5 py-2.5 font-medium">{idx + 1}</td>
                                      <td className="px-3.5 py-2.5 font-semibold text-ink">{name}</td>
                                      <td className="px-3.5 py-2.5 text-ink-muted">{trigger}</td>
                                      <td className="px-3.5 py-2.5 text-right font-mono">{m.percentage}%</td>
                                      <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-ink">
                                        {formatCurrency(m.amount)}
                                      </td>
                                      <td className="px-3.5 py-2.5 text-right">
                                        <Badge tone={isCompleted ? 'positive' : 'warning'}>
                                          {isCompleted ? 'Certified' : 'Pending'}
                                        </Badge>
                                      </td>
                                      <td className="px-3.5 py-2.5 text-right">
                                        {isCompleted ? (
                                          <span className="text-[11px] text-emerald-700 font-medium">
                                            {m.completedAt || m.completed_at ? formatDate(m.completedAt || m.completed_at) : 'Certified'}
                                          </span>
                                        ) : (
                                          <Button
                                            size="sm"
                                            onClick={() => {
                                              setCertifyingMilestone({ poId, milestone: m });
                                              setCertifyRemarks('');
                                            }}
                                            className="text-xs py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                            title="Certify completed milestone and make payment due"
                                          >
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Certify
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}
        </CardBody>
      </Card>

      {/* Modal 1: Create / Edit PO Modal */}
      <CreatePOModal
        contractor={contractor}
        poToEdit={poToEdit}
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setPoToEdit(null);
        }}
        onSaved={() => {
          setActionSuccess(poToEdit ? 'Purchase order updated successfully.' : 'Purchase order created successfully.');
          setPoToEdit(null);
          if (typeof onChanged === 'function') onChanged();
        }}
      />

      {/* Modal 2: Digital PO Preview Modal */}
      {selectedPo && (
        <DigitalPOPreviewModal
          po={selectedPo}
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setSelectedPo(null);
          }}
          onSend={(p) => {
            setIsPreviewOpen(false);
            handleSend(p);
          }}
          onSign={(p) => {
            setIsPreviewOpen(false);
            handleOpenCompanySign(p);
          }}
          onCertifyMilestone={async (pId, m) => {
            setIsPreviewOpen(false);
            setCertifyingMilestone({ poId: pId, milestone: m });
            setCertifyRemarks('');
          }}
        />
      )}

      {/* Modal 3: Company Counter-Signature Dialog */}
      {selectedPo && (
        <CompanySignatureDialog
          po={selectedPo}
          isOpen={isSignOpen}
          onClose={() => setIsSignOpen(false)}
          onSigned={() => {
            setActionSuccess('Contract countersigned and legally executed.');
            if (typeof onChanged === 'function') onChanged();
          }}
        />
      )}

      {/* Modal 4: Certify Milestone Dialog */}
      {certifyingMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Certify Completed Milestone
              </h3>
              <button
                type="button"
                onClick={() => setCertifyingMilestone(null)}
                className="rounded-lg p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitMilestoneCertification} className="mt-4 space-y-4">
              <div className="rounded-xl border border-line bg-canvas/40 p-3.5 text-xs space-y-1">
                <div className="font-semibold text-ink text-sm">
                  {certifyingMilestone.milestone.milestoneName || certifyingMilestone.milestone.milestone_name}
                </div>
                <div className="text-ink-muted">
                  Amount: <strong className="text-ink">{formatCurrency(certifyingMilestone.milestone.amount)}</strong> ({certifyingMilestone.milestone.percentage}%)
                </div>
                {certifyingMilestone.milestone.conditionTrigger && (
                  <div className="text-ink-subtle">
                    Condition: {certifyingMilestone.milestone.conditionTrigger}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                  Inspection Remarks / Certification Note
                </label>
                <textarea
                  rows={3}
                  value={certifyRemarks}
                  onChange={(e) => setCertifyRemarks(e.target.value)}
                  placeholder="e.g. Work inspected on site and conforms to structural engineering specs..."
                  className="w-full rounded-xl border border-line bg-white p-3 text-xs text-ink focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCertifyingMilestone(null)}
                  disabled={isCertifying}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCertifying}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isCertifying ? 'Certifying…' : 'Confirm Certification'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
