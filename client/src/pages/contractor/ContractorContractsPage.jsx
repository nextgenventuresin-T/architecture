import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  CheckCircle2,
  XCircle,
  PenTool,
  Download,
  Eye,
  Clock,
  Building2,
  Calendar,
  AlertTriangle,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
  X,
  History,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Skeleton from '../../components/ui/Skeleton';
import SignaturePad from '../../components/ui/SignaturePad';
import DigitalPOPreviewModal from '../../components/contractors/DigitalPOPreviewModal';
import ContractorTimeline from '../../components/contractors/ContractorTimeline';
import { contractorPoApi } from '../../api/contractorPoApi';
import { formatCurrency, formatDate } from '../../utils/format';
import useAuth from '../../hooks/useAuth';

export default function ContractorContractsPage() {
  const { user } = useAuth();
  const [pos, setPos] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals state
  const [selectedPoForPreview, setSelectedPoForPreview] = useState(null);
  const [selectedPoForSign, setSelectedPoForSign] = useState(null);
  const [selectedPoForReject, setSelectedPoForReject] = useState(null);
  const [selectedPoForTimeline, setSelectedPoForTimeline] = useState(null);

  // Reject form state
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [rejectError, setRejectError] = useState(null);

  // Sign form state
  const [isSubmittingSign, setIsSubmittingSign] = useState(false);
  const [signError, setSignError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [posRes, summaryData] = await Promise.all([
        contractorPoApi.portalList(),
        contractorPoApi.portalSummary().catch(() => null),
      ]);
      const list = Array.isArray(posRes) ? posRes : (posRes?.pos || []);
      setPos(list);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message || 'Failed to load purchase orders and contracts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle PO Acceptance
  async function handleAccept(po) {
    if (!window.confirm(`Are you sure you want to accept Purchase Order ${po.poNumber}? You can sign the formal agreement in the next step.`)) {
      return;
    }
    try {
      const updated = await contractorPoApi.portalAccept(po.id);
      setNotification({ type: 'success', message: `Purchase Order ${po.poNumber} accepted successfully! You may now sign the agreement.` });
      // Update local state
      setPos((prev) => {
        const arr = Array.isArray(prev) ? prev : (prev?.pos || []);
        return arr.map((item) => (item.id === po.id ? { ...item, ...updated } : item));
      });
      loadData();
    } catch (err) {
      setNotification({ type: 'error', message: err.message || 'Failed to accept Purchase Order.' });
    }
  }

  // Handle PO Rejection
  async function submitReject(e) {
    e?.preventDefault();
    if (!rejectionReason.trim()) {
      setRejectError('Please specify the reason for rejecting this Purchase Order.');
      return;
    }
    setIsSubmittingReject(true);
    setRejectError(null);
    try {
      const updated = await contractorPoApi.portalReject(selectedPoForReject.id, rejectionReason.trim());
      setNotification({ type: 'info', message: `Purchase Order ${selectedPoForReject.poNumber} has been rejected.` });
      setPos((prev) => {
        const arr = Array.isArray(prev) ? prev : (prev?.pos || []);
        return arr.map((item) => (item.id === selectedPoForReject.id ? { ...item, ...updated } : item));
      });
      setSelectedPoForReject(null);
      setRejectionReason('');
      loadData();
    } catch (err) {
      setRejectError(err.message || 'Failed to reject Purchase Order.');
    } finally {
      setIsSubmittingReject(false);
    }
  }

  // Handle Contractor Digital Signature
  async function handleSignatureSubmit({ signatureData, signerName }) {
    if (!selectedPoForSign) return;
    setIsSubmittingSign(true);
    setSignError(null);
    try {
      const payload = {
        signature_data: signatureData,
        signer_name: signerName,
      };
      const updated = await contractorPoApi.portalSign(selectedPoForSign.id, payload);
      setNotification({
        type: 'success',
        message: `Agreement signed successfully for ${selectedPoForSign.poNumber}! Awaiting company executive counter-signature.`,
      });
      setPos((prev) => {
        const arr = Array.isArray(prev) ? prev : (prev?.pos || []);
        return arr.map((item) => (item.id === selectedPoForSign.id ? { ...item, ...updated } : item));
      });
      setSelectedPoForSign(null);
      loadData();
    } catch (err) {
      setSignError(err.message || 'Failed to submit signature.');
    } finally {
      setIsSubmittingSign(false);
    }
  }

  // Normalized POs list
  const posArray = Array.isArray(pos) ? pos : (pos?.pos || []);

  // Filtered POs
  const filteredPos = posArray.filter((po) => {
    // Status filter
    if (statusFilter === 'action_required') {
      if (!['sent', 'viewed', 'accepted'].includes(po.status)) return false;
    } else if (statusFilter === 'executed') {
      if (!['contractor_signed', 'company_signed', 'contract_signed'].includes(po.status)) return false;
    } else if (statusFilter === 'completed') {
      if (po.status !== 'completed') return false;
    } else if (statusFilter === 'rejected') {
      if (po.status !== 'rejected') return false;
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchPoNumber = po.poNumber?.toLowerCase().includes(q);
      const matchProject = po.project?.name?.toLowerCase().includes(q) || po.project?.code?.toLowerCase().includes(q);
      const matchSite = po.site?.name?.toLowerCase().includes(q);
      if (!matchPoNumber && !matchProject && !matchSite) return false;
    }

    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return <Badge tone="neutral">Draft</Badge>;
      case 'sent':
        return <Badge tone="brand">New Order Issued</Badge>;
      case 'viewed':
        return <Badge tone="brand">Under Review</Badge>;
      case 'accepted':
        return <Badge tone="info">Accepted (Sign Pending)</Badge>;
      case 'rejected':
        return <Badge tone="critical">Rejected</Badge>;
      case 'contractor_signed':
        return <Badge tone="warning">Awaiting Company Seal</Badge>;
      case 'company_signed':
      case 'contract_signed':
        return <Badge tone="positive">Contract Executed</Badge>;
      case 'completed':
        return <Badge tone="positive">Completed</Badge>;
      default:
        return <Badge tone="neutral">{status?.toUpperCase()}</Badge>;
    }
  };

  return (
    <>
      <PageHeader
        title="Purchase Orders & Contracts"
        description="Review work orders issued to you, sign legally binding agreements digitally, and monitor milestone payment statuses."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {notification && (
        <div className="mb-4">
          <Alert
            tone={notification.type === 'error' ? 'critical' : notification.type === 'info' ? 'neutral' : 'positive'}
            onClose={() => setNotification(null)}
          >
            {notification.message}
          </Alert>
        </div>
      )}

      {error && <Alert tone="critical" className="mb-6">{error}</Alert>}

      {/* Financial & Milestone Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Total Order Value</p>
                <p className="mt-1 text-xl font-bold text-ink">
                  {summary ? formatCurrency(summary.totalPoValue) : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                <FileText className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Across {posArray.length} work order{posArray.length === 1 ? '' : 's'}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Advance & Released</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {summary ? formatCurrency(Number(summary.totalAdvancePaid || 0) + Number(summary.totalReleased || 0)) : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Advance: {summary ? formatCurrency(summary.totalAdvancePaid) : '₹0'}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Pending Balance</p>
                <p className="mt-1 text-xl font-bold text-amber-700">
                  {summary ? formatCurrency(summary.totalPending) : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Due / Certified: {summary ? formatCurrency(summary.totalDue) : '₹0'}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Milestone Progress</p>
                <p className="mt-1 text-xl font-bold text-indigo-700">
                  {summary ? `${summary.completedMilestones || 0} / ${summary.totalMilestones || 0}` : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-canvas overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full"
                  style={{
                    width: summary && summary.totalMilestones > 0
                      ? `${Math.round(((summary.completedMilestones || 0) / summary.totalMilestones) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
              <span className="text-[11px] font-bold text-ink-subtle">
                {summary && summary.totalMilestones > 0
                  ? `${Math.round(((summary.completedMilestones || 0) / summary.totalMilestones) * 100)}%`
                  : '0%'}
              </span>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'action_required', label: 'Action Required' },
            { id: 'executed', label: 'Executed Contracts' },
            { id: 'completed', label: 'Completed' },
            { id: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === tab.id
                  ? 'bg-brand-700 text-white shadow-xs'
                  : 'bg-white text-ink-subtle border border-line hover:bg-canvas hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO#, Project, Site…"
            className="w-full rounded-xl border border-line bg-white pl-9 pr-3.5 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* PO Listing */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : filteredPos.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-canvas text-ink-subtle">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">No Purchase Orders Found</h3>
          <p className="mt-1 text-xs text-ink-subtle">
            {search || statusFilter !== 'all'
              ? 'No purchase orders matched your current filters.'
              : 'There are no purchase orders issued to your account yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPos.map((po) => {
            const isSigned = po.status === 'contract_signed' || Boolean(po.contractorSignedAt && po.companySignedAt);
            const totalMilestones = po.milestones?.length || 0;
            const completedMilestones = po.milestones?.filter((m) => m.status === 'completed').length || 0;
            const milestonePercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

            const canAcceptOrReject = ['sent', 'viewed'].includes(po.status);
            const canSign = po.status === 'accepted';

            return (
              <Card key={po.id} className="overflow-hidden transition-all hover:border-brand-300">
                <div className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Primary PO info */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-base font-bold text-ink">{po.poNumber}</span>
                        {getStatusBadge(po.status)}
                        <span className="text-xs text-ink-subtle flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Issued: {formatDate(po.poDate)}
                        </span>
                        {po.validityDate && (
                          <span className="text-xs text-ink-subtle">
                            · Target: <strong className="text-ink font-semibold">{formatDate(po.validityDate)}</strong>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted mt-1">
                        <span className="flex items-center gap-1.5 font-medium text-ink">
                          <Building2 className="h-3.5 w-3.5 text-brand-600" />
                          {po.project?.name} ({po.project?.code})
                        </span>
                        {po.site && (
                          <span>
                            Site: <strong className="text-ink">{po.site.name}</strong>
                          </span>
                        )}
                      </div>

                      {po.workDescription && (
                        <p className="text-xs text-ink-subtle line-clamp-1 mt-1 max-w-2xl">
                          {po.workDescription}
                        </p>
                      )}
                    </div>

                    {/* Financial Figures */}
                    <div className="flex flex-wrap items-center gap-6 rounded-xl border border-line/80 bg-canvas/40 px-4 py-2.5 text-right">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Order Total</div>
                        <div className="text-sm font-bold text-brand-800">{formatCurrency(po.totalAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Advance</div>
                        <div className="text-xs font-semibold text-ink">{formatCurrency(po.advanceAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Milestones</div>
                        <div className="text-xs font-semibold text-ink">
                          {completedMilestones} / {totalMilestones} ({milestonePercent}%)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rejection notice if rejected */}
                  {po.status === 'rejected' && po.rejectionReason && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/50 p-2.5 text-xs text-rose-800 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Rejection Note: </span>
                        {po.rejectionReason}
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line/70">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          try {
                            const res = await contractorPoApi.portalDetail(po.id);
                            setSelectedPoForPreview(res.po || res || po);
                            if (po.status === 'sent') {
                              setPos((prev) =>
                                prev.map((item) => (item.id === po.id ? { ...item, status: 'viewed' } : item))
                              );
                            }
                          } catch {
                            setSelectedPoForPreview(po);
                          }
                        }}
                        className="gap-1.5 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview Order & Terms
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPoForTimeline(po)}
                        className="gap-1.5 text-xs text-ink-subtle"
                      >
                        <History className="h-3.5 w-3.5" />
                        Lifecycle Timeline
                      </Button>

                      <a
                        href={contractorPoApi.getPortalPdfDownloadUrl(po.id, isSigned)}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-ink-subtle">
                          <Download className="h-3.5 w-3.5" />
                          {isSigned ? 'Signed Contract PDF' : 'PO PDF'}
                        </Button>
                      </a>
                    </div>

                    {/* Stage-based action buttons */}
                    <div className="flex items-center gap-2">
                      {canAcceptOrReject && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedPoForReject(po);
                              setRejectionReason('');
                              setRejectError(null);
                            }}
                            className="gap-1.5 text-xs text-rose-700 hover:bg-rose-50 border-rose-200"
                          >
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            Reject PO
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAccept(po)}
                            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Accept Purchase Order
                          </Button>
                        </>
                      )}

                      {canSign && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedPoForSign(po);
                            setSignError(null);
                          }}
                          className="gap-1.5 text-xs bg-brand-700 hover:bg-brand-800 text-white shadow-xs"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                          Sign Agreement Digitally
                        </Button>
                      )}

                      {po.status === 'contractor_signed' && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                          <Clock className="h-3.5 w-3.5" />
                          Signed by you · Awaiting Company Seal
                        </div>
                      )}

                      {isSigned && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                          <ShieldCheck className="h-4 w-4" />
                          Fully Executed Contract
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal 1: PO Document & Terms Preview */}
      <DigitalPOPreviewModal
        po={selectedPoForPreview}
        isOpen={Boolean(selectedPoForPreview)}
        onClose={() => setSelectedPoForPreview(null)}
        isContractorPortal={true}
      />

      {/* Modal 2: Rejection Dialog */}
      {selectedPoForReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-600" />
                Reject Purchase Order
              </h3>
              <button
                type="button"
                onClick={() => setSelectedPoForReject(null)}
                className="rounded-lg p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {rejectError && <Alert tone="critical" className="mt-3 mb-2">{rejectError}</Alert>}

            <form onSubmit={submitReject} className="mt-4 space-y-4">
              <p className="text-xs text-ink-muted">
                Please state the specific reason for rejecting <strong>{selectedPoForReject.poNumber}</strong> (e.g. rate disagreement, milestone feasibility, timeline conflict). The Admin will be notified immediately.
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Specify why you cannot accept this order or what changes are required..."
                  required
                  className="w-full rounded-xl border border-line bg-white p-3 text-sm text-ink focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedPoForReject(null)}
                  disabled={isSubmittingReject}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingReject}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {isSubmittingReject ? 'Submitting…' : 'Confirm Rejection'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Digital Signature Pad Modal */}
      {selectedPoForSign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl">
            {signError && <Alert tone="critical" className="mb-4">{signError}</Alert>}
            <SignaturePad
              title="Contractor Legal Signature"
              description={`Sign contract agreement for Work Order ${selectedPoForSign.poNumber} (${selectedPoForSign.project?.name}). This will be legally sealed into the final contract PDF.`}
              signerName={user?.name || user?.fullName || ''}
              submitLabel={isSubmittingSign ? 'Sealing Signature…' : 'Sign & Submit Agreement'}
              onSign={handleSignatureSubmit}
              onCancel={() => setSelectedPoForSign(null)}
            />
          </div>
        </div>
      )}

      {/* Modal 4: Lifecycle Timeline Modal */}
      {selectedPoForTimeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white p-6 shadow-2xl border border-line flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <History className="h-5 w-5 text-brand-700" />
                  Order Lifecycle & Audit Timeline
                </h3>
                <p className="text-xs text-ink-subtle mt-0.5">
                  PO: {selectedPoForTimeline.poNumber} · {selectedPoForTimeline.project?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPoForTimeline(null)}
                className="rounded-lg p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <ContractorTimeline
                contractor={selectedPoForTimeline.contractor || { name: user?.name }}
                pos={[selectedPoForTimeline]}
                poSummary={{}}
              />
            </div>

            <div className="pt-3 border-t border-line flex justify-end">
              <Button variant="secondary" onClick={() => setSelectedPoForTimeline(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
