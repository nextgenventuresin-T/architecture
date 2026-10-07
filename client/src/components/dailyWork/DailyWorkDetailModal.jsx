import { useEffect, useState } from 'react';
import {
  X,
  Calendar,
  Building2,
  MapPin,
  CheckCircle2,
  Clock,
  Users,
  Package,
  Receipt,
  Camera,
  AlertTriangle,
  UserCheck,
  UserX,
  ExternalLink,
} from 'lucide-react';
import Badge from '../ui/Badge';
import Skeleton from '../ui/Skeleton';
import Alert from '../ui/Alert';
import { dailyWorkApi } from '../../api/dailyWorkApi';
import { formatDate, formatNumber, formatCurrency } from '../../utils/format';

export default function DailyWorkDetailModal({ updateId, isOpen, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    if (!isOpen || !updateId) {
      setDetail(null);
      return;
    }

    setLoading(true);
    setError(null);
    dailyWorkApi
      .detail(updateId)
      .then((data) => setDetail(data))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [isOpen, updateId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-line flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line bg-canvas/40 px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-brand-700 uppercase tracking-wide">
                Daily Work Record #{updateId}
              </span>
              <span className="text-line">·</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                <Calendar className="h-3.5 w-3.5 text-ink-muted" />
                {detail ? formatDate(detail.workDate) : 'Loading...'}
              </span>
              {detail && (
                <Badge tone={detail.workStatus === 'completed' ? 'success' : 'warning'}>
                  {detail.workStatus === 'completed' ? 'Completed' : 'In Progress'}
                </Badge>
              )}
            </div>
            <h2 className="mt-1 text-lg font-bold text-ink flex items-center gap-2">
              <span>{detail?.taskName || detail?.phaseTitle || 'Task Details'}</span>
              {detail?.progressPercentage != null && (
                <span className="text-sm font-semibold text-brand-600">
                  ({detail.progressPercentage}% done)
                </span>
              )}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
              <span className="flex items-center gap-1 font-medium text-ink">
                <Building2 className="h-3.5 w-3.5 text-brand-600" />
                {detail?.projectName} ({detail?.projectCode})
              </span>
              {detail?.siteName && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-ink-subtle" />
                  {detail.siteName}
                </span>
              )}
              {detail?.contractorName && (
                <span className="text-ink-subtle">
                  Contractor: <strong className="text-ink">{detail.contractorName}</strong>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-canvas hover:text-ink transition-colors"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="space-y-4 py-8">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {error && <Alert tone="error">{error.message || 'Failed to load update details.'}</Alert>}

          {detail && (
            <>
              {/* Progress & Work Done Section */}
              <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                    Work Completed Today
                  </span>
                  <div className="flex items-center gap-2 text-xs font-bold text-brand-700">
                    <span>Task Progress: {detail.progressPercentage}%</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-line/80">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, detail.progressPercentage || 0)}%` }}
                  />
                </div>

                <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed pt-1">
                  {detail.workDone || 'No description provided.'}
                </p>

                {detail.remarks && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-900">
                    <span className="font-semibold">Site Remarks / Constraints:</span> {detail.remarks}
                  </div>
                )}
              </div>

              {/* Expected vs Actual Labour Comparison */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-brand-600" />
                    Labour Attendance & Work Details
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                      <UserCheck className="h-3 w-3" />
                      {detail.labourComparison?.totalWorkedToday || detail.workedLabour?.length || 0} Worked Today
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                      Assigned: {detail.labourComparison?.totalAssigned || detail.assignedLabour?.length || 0}
                    </span>
                    {(detail.labourComparison?.totalAbsent || detail.absentLabour?.length) > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
                        <UserX className="h-3 w-3" />
                        {detail.labourComparison?.totalAbsent || detail.absentLabour?.length} Absent
                      </span>
                    )}
                  </div>
                </div>

                {/* Table of Workers who worked today */}
                {detail.workedLabour && detail.workedLabour.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-canvas border-b border-line text-[11px] font-semibold text-ink-muted">
                        <tr>
                          <th className="px-3.5 py-2.5">Worker Name</th>
                          <th className="px-3 py-2.5">Type</th>
                          <th className="px-3 py-2.5">Trade / Skill</th>
                          <th className="px-3 py-2.5 text-right">Hours</th>
                          <th className="px-3 py-2.5 text-right">Daily Wage</th>
                          <th className="px-3.5 py-2.5">Work Performed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/70">
                        {detail.workedLabour.map((w, idx) => {
                          const isEmployee =
                            w.workerType === 'company_employee' ||
                            (w.labourType || '').toLowerCase().includes('company');
                          return (
                            <tr key={w.id || idx} className="hover:bg-canvas/40">
                              <td className="px-3.5 py-2.5 font-medium text-ink">
                                <div>{w.workerName}</div>
                                {w.workerCode && (
                                  <span className="font-mono text-[10px] text-ink-subtle">
                                    {w.workerCode}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <Badge tone={isEmployee ? 'info' : 'neutral'}>
                                  {isEmployee ? 'Company Employee' : 'Labour'}
                                </Badge>
                              </td>
                              <td className="px-3 py-2.5 text-ink-muted">
                                {w.labourType || 'General Labour'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium text-ink">
                                {w.hoursWorked || 8} hrs
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-ink tabular-nums">
                                {isEmployee ? '—' : formatCurrency(w.dailyWage || 0)}
                              </td>
                              <td className="px-3.5 py-2.5 text-ink-muted">
                                {w.workPerformed || <span className="text-ink-subtle italic">Standard task duties</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-canvas/60 border-t border-line font-semibold text-xs">
                        <tr>
                          <td colSpan={4} className="px-3.5 py-2 text-ink-muted">
                            Total Labour Cost for this update:
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-800">
                            {formatCurrency(
                              detail.workedLabour.reduce(
                                (sum, w) =>
                                  sum +
                                  (Number(w.dailyWage || 0) * (Number(w.hoursWorked || 8) / 8)),
                                0
                              )
                            )}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-line bg-canvas/30 p-3 text-center text-xs text-ink-subtle">
                    No specific individual worker logs recorded for this update.
                  </p>
                )}

                {/* Absent Assigned Labourers Notice */}
                {detail.absentLabour && detail.absentLabour.length > 0 && (
                  <div className="rounded-lg border border-rose-200/80 bg-rose-50/40 p-3">
                    <p className="text-[11px] font-semibold text-rose-800 mb-1.5 flex items-center gap-1">
                      <UserX className="h-3.5 w-3.5" />
                      Assigned to Task but Not Logged Today ({detail.absentLabour.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.absentLabour.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-rose-900 border border-rose-200"
                        >
                          {a.name} ({a.trade})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Material Usage, Miscellaneous Expenses & Linked Finance Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Miscellaneous Expense */}
                <div className="rounded-xl border border-line bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
                    <Receipt className="h-4 w-4 text-amber-600" />
                    Miscellaneous Expense
                  </div>
                  {detail.miscAmount && Number(detail.miscAmount) > 0 ? (
                    <div className="space-y-1.5 pt-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Description:</span>
                        <span className="font-semibold text-ink">{detail.miscDescription || 'Site Expense'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Amount:</span>
                        <span className="font-bold text-amber-800">{formatCurrency(detail.miscAmount)}</span>
                      </div>
                      {detail.miscRemarks && (
                        <div className="text-[11px] text-ink-subtle italic pt-1 border-t border-line/60">
                          {detail.miscRemarks}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="pt-2 text-xs text-ink-subtle italic">No miscellaneous operational expenses logged.</p>
                  )}
                </div>
                {/* Material Used */}
                <div className="rounded-xl border border-line bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
                    <Package className="h-4 w-4 text-amber-700" />
                    Material / Tool Consumption
                  </div>
                  {detail.materialName || detail.materialId ? (
                    <div className="space-y-1.5 pt-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Material:</span>
                        <span className="font-semibold text-ink">
                          {detail.materialName} ({detail.materialCode || '—'})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Quantity Consumed:</span>
                        <span className="font-bold text-amber-900">
                          {formatNumber(detail.quantityUsed)} {detail.unit}
                        </span>
                      </div>
                      {detail.transactionNumber && (
                        <div className="flex justify-between text-[11px] text-ink-subtle">
                          <span>Warehouse Stock Ref:</span>
                          <span className="font-mono font-medium">{detail.transactionNumber}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="pt-2 text-xs text-ink-subtle italic">
                      No material consumption deducted for this day.
                    </p>
                  )}
                </div>

                {/* Linked Expense */}
                <div className="rounded-xl border border-line bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
                    <Receipt className="h-4 w-4 text-emerald-700" />
                    Linked Finance Expense
                  </div>
                  {detail.linkedExpense ? (
                    <div className="space-y-1.5 pt-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Expense Ref:</span>
                        <span className="font-mono font-semibold text-ink">
                          {detail.linkedExpense.expenseNumber}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Category:</span>
                        <span className="font-medium text-ink capitalize">
                          {detail.linkedExpense.category}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Amount:</span>
                        <span className="font-bold text-emerald-800">
                          {formatCurrency(detail.linkedExpense.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Status:</span>
                        <Badge tone={detail.linkedExpense.status === 'approved' ? 'success' : 'warning'}>
                          {detail.linkedExpense.status}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="pt-2 text-xs text-ink-subtle italic">
                      No external finance expense linked to this record.
                    </p>
                  )}
                </div>
              </div>

              {/* Photos Gallery */}
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                  <Camera className="h-4 w-4 text-brand-600" />
                  Site Progress Photos ({detail.photos?.length || 0})
                </h3>

                {detail.photos && detail.photos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {detail.photos.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setLightboxPhoto(photo)}
                        className="group relative aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-canvas shadow-2xs hover:border-brand-400 transition-all"
                      >
                        <img
                          src={photo.url}
                          alt={photo.fileName}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <ExternalLink className="h-5 w-5" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-line bg-canvas/30 p-4 text-center text-xs text-ink-subtle">
                    No camera or site photos attached to this update.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-line bg-canvas/60 px-6 py-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink shadow-2xs hover:bg-canvas transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.fileName}
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            <p className="mt-2 text-center text-xs text-white/70">{lightboxPhoto.fileName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
