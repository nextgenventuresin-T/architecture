import { Printer, Download, Send, CheckCircle2, X, FileText, Building2, ShieldCheck, PenTool } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { formatCurrency, formatDate } from '../../utils/format';
import { contractorPoApi } from '../../api/contractorPoApi';

export default function DigitalPOPreviewModal({
  po,
  isOpen,
  onClose,
  onSend,
  onSign,
  isContractorPortal = false,
}) {
  if (!isOpen || !po) return null;

  const isSigned = po.status === 'contract_signed' || Boolean(po.contractorSignedAt && po.companySignedAt);
  const downloadUrl = isContractorPortal
    ? contractorPoApi.getPortalPdfDownloadUrl(po.id, isSigned)
    : contractorPoApi.getPdfDownloadUrl(po.id, isSigned);

  function handlePrint() {
    window.print();
  }

  let termsList = [];
  if (Array.isArray(po.termsConditions)) {
    termsList = po.termsConditions;
  } else if (typeof po.termsConditions === 'string') {
    try {
      const parsed = JSON.parse(po.termsConditions);
      if (Array.isArray(parsed)) termsList = parsed;
      else termsList = po.termsConditions.split('\n').filter(Boolean);
    } catch {
      termsList = po.termsConditions.split('\n').filter(Boolean);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-4xl flex-col max-h-[94vh] rounded-2xl bg-white shadow-2xl border border-line overflow-hidden">
        {/* Modal Controls Bar (Hidden in print) */}
        <div className="print:hidden flex items-center justify-between border-b border-line bg-canvas px-6 py-3.5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-700" />
            <span className="font-bold text-ink text-sm">
              {isSigned ? 'Executed Contract Agreement' : 'Purchase / Work Order Preview'} — {po.poNumber}
            </span>
            <Badge tone={isSigned ? 'positive' : po.status === 'sent' ? 'brand' : 'neutral'}>
              {po.status?.toUpperCase().replace(/_/g, ' ')}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </Button>
            <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </a>
            {!isContractorPortal && ['draft', 'rejected'].includes(po.status) && onSend && (
              <Button size="sm" onClick={() => onSend(po)} className="gap-1.5">
                <Send className="h-4 w-4" />
                Send to Contractor
              </Button>
            )}
            {!isContractorPortal && po.status === 'contractor_signed' && onSign && (
              <Button size="sm" onClick={() => onSign(po)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <PenTool className="h-4 w-4" />
                Sign Company Side
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-subtle hover:bg-white hover:text-ink transition-colors ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Body */}
        <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible bg-white text-ink">
          {/* Document Header */}
          <div className="rounded-xl border border-line bg-canvas-subtle p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-brand-700" />
                  ARCHITECTURE & CONSTRUCTION ERP
                </h1>
                <p className="text-xs text-ink-muted mt-1">
                  Corporate Office: Sector 62, Noida, NCR, India · Tel: +91 120 456 7890 · contracts@architecture-erp.local
                </p>
                <p className="text-xs text-ink-subtle">
                  GSTIN: 07AAAAA0000A1Z5 · PAN: AAAAA0000A · CIN: U74899DL2020PTC123456
                </p>
              </div>
              <div className="sm:text-right">
                <div className="inline-block rounded-lg bg-white px-4 py-2 border border-line shadow-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Order Reference</div>
                  <div className="font-mono text-base font-bold text-ink">{po.poNumber}</div>
                  <div className="text-xs text-ink-muted">Date: {formatDate(po.poDate)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Document Banner */}
          <div className="mb-6 border-b-2 border-brand-700 pb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-ink tracking-wide uppercase">
              {isSigned ? 'OFFICIAL EXECUTED CONTRACT AGREEMENT' : 'WORK / PURCHASE ORDER'}
            </h2>
            <div className="text-xs text-ink-subtle">
              Validity / Target: <strong className="text-ink">{formatDate(po.validityDate)}</strong>
            </div>
          </div>

          {/* Cards Grid: Contractor & Project Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Contractor Box */}
            <div className="rounded-xl border border-line bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">Contractor Details</div>
              <div className="text-sm font-bold text-ink">{po.contractor?.name}</div>
              <div className="text-xs text-ink-muted mt-1 space-y-0.5">
                <div>Contact: {po.contractor?.contactPerson || '—'}</div>
                <div>Phone: {po.contractor?.phone || '—'} · Email: {po.contractor?.email || '—'}</div>
                <div>Address: {po.contractor?.address || '—'}</div>
              </div>
            </div>

            {/* Project & Site Box */}
            <div className="rounded-xl border border-line bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">Project & Site Details</div>
              <div className="text-sm font-bold text-ink">{po.project?.name}</div>
              <div className="text-xs text-ink-muted mt-1 space-y-0.5">
                <div>Project Code: <span className="font-mono font-semibold">{po.project?.code}</span></div>
                <div>Site: {po.site?.name || 'All Project Sites'}</div>
                <div>Location: {po.site?.address || po.project?.location || 'Project Site Ground'}</div>
              </div>
            </div>
          </div>

          {/* Financial Breakdown Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-line bg-brand-50/40 p-4 mb-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Total Order Value</div>
              <div className="text-base font-bold text-brand-800">{formatCurrency(po.totalAmount)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Advance Amount</div>
              <div className="text-base font-bold text-ink">{formatCurrency(po.advanceAmount)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Material Portion</div>
              <div className="text-base font-bold text-ink">{formatCurrency(po.materialAmount)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Labour Portion</div>
              <div className="text-base font-bold text-ink">{formatCurrency(po.labourAmount)}</div>
            </div>
          </div>

          {/* Scope of Work */}
          {po.workDescription && (
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-1.5">Scope of Work</h3>
              <p className="rounded-xl border border-line/60 bg-canvas/30 p-3.5 text-xs leading-relaxed text-ink whitespace-pre-line">
                {po.workDescription}
              </p>
            </div>
          )}

          {/* Payment Terms */}
          {po.paymentTerms && (
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-1.5">Payment Terms</h3>
              <p className="rounded-xl border border-line/60 bg-canvas/30 p-3 text-xs text-ink-muted">
                {po.paymentTerms}
              </p>
            </div>
          )}

          {/* Milestones Table */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">
              Payment & Work Milestones Schedule ({po.milestones?.length || 0})
            </h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas-subtle border-b border-line font-semibold text-ink-subtle uppercase">
                  <tr>
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Milestone Name</th>
                    <th className="px-4 py-2.5">Trigger Condition</th>
                    <th className="px-4 py-2.5 text-right">%</th>
                    <th className="px-4 py-2.5 text-right">Amount (₹)</th>
                    <th className="px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {po.milestones?.map((m, idx) => (
                    <tr key={m.id || idx}>
                      <td className="px-4 py-2.5 font-medium">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-ink">{m.milestoneName}</td>
                      <td className="px-4 py-2.5 text-ink-muted">{m.conditionTrigger || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{m.percentage}%</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink">{formatCurrency(m.amount)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge tone={m.status === 'completed' ? 'positive' : 'warning'}>
                          {m.status?.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Terms & Conditions */}
          {termsList.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">Terms & Conditions</h3>
              <div className="rounded-xl border border-line bg-canvas/20 p-4 space-y-1.5 text-xs text-ink-muted">
                {termsList.map((clause, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {clause}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signatures Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t-2 border-line">
            {/* Contractor Signature Box */}
            <div className="rounded-xl border border-line bg-canvas/30 p-4 flex flex-col justify-between min-h-[130px]">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-1">
                  Contractor Acceptance & Signature
                </div>
                {po.contractorSignedAt ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Digitally Verified & Signed
                    </div>
                    <div className="text-xs font-semibold text-ink">{po.contractorSignedName}</div>
                    <div className="text-[11px] text-ink-subtle">Timestamp: {formatDate(po.contractorSignedAt)}</div>
                  </div>
                ) : (
                  <div className="mt-4 text-xs italic text-ink-subtle">[ Pending Contractor Acceptance & Signature ]</div>
                )}
              </div>
              <div className="mt-4 border-t border-line/60 pt-2 text-[11px] text-ink-subtle">
                Authorized Signatory for {po.contractor?.name}
              </div>
            </div>

            {/* Company Signature Box */}
            <div className="rounded-xl border border-line bg-canvas/30 p-4 flex flex-col justify-between min-h-[130px]">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-1">
                  For Architecture & Construction ERP
                </div>
                {po.companySignedAt ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <ShieldCheck className="h-4 w-4" />
                      Authorized & Sealed
                    </div>
                    <div className="text-xs font-semibold text-ink">{po.companySignedName}</div>
                    <div className="text-[11px] text-ink-subtle">
                      {po.companySignedDesignation || 'Project Director'} · {formatDate(po.companySignedAt)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-xs italic text-ink-subtle">[ Pending Company Counter-Signature ]</div>
                )}
              </div>
              <div className="mt-4 border-t border-line/60 pt-2 text-[11px] text-ink-subtle">
                Authorized Executive Representative
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
