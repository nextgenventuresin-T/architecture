import { useState, useMemo } from 'react';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function GroupedVendorPayablesModal({ isOpen, onClose, group, onExportCSV, onRecordPayment }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const allBills = useMemo(() => {
    const list = group?.bills || [];
    // Non-zero values check as required by requirement 14
    return list.filter((b) => Number(b.totalAmount || 0) > 0 || Number(b.amountPaid || 0) > 0 || Number(b.amountDue || 0) > 0);
  }, [group]);

  const filteredBills = useMemo(() => {
    if (!searchTerm.trim()) return allBills;
    const q = searchTerm.toLowerCase();
    return allBills.filter((b) => {
      const inv = (b.invoiceBillNumber || '').toLowerCase();
      const mat = (b.material || '').toLowerCase();
      const proj = (b.projectName || '').toLowerCase();
      const site = (b.siteName || '').toLowerCase();
      return inv.includes(q) || mat.includes(q) || proj.includes(q) || site.includes(q);
    });
  }, [allBills, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / pageSize));
  const pagedBills = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBills.slice(start, start + pageSize);
  }, [filteredBills, page, pageSize]);

  const summary = useMemo(() => {
    let totPurch = 0;
    let totPaid = 0;
    let totDue = 0;
    allBills.forEach((b) => {
      totPurch += Number(b.totalAmount || 0);
      totPaid += Number(b.amountPaid || 0);
      totDue += Number(b.amountDue || 0);
    });
    return {
      totalPurchases: totPurch,
      totalPaid: totPaid,
      totalDue: totDue,
    };
  }, [allBills]);

  if (!isOpen || !group) return null;

  const handleExport = () => {
    if (onExportCSV) {
      onExportCSV(
        `Vendor_Payables_${group.vendorName || 'Vendor'}`,
        [
          'Bill / PO No',
          'Purchase Date',
          'Project',
          'Site',
          'Material / Item',
          'Quantity',
          'Cost / Unit',
          'Total Cost',
          'Amount Paid',
          'Balance Due',
          'Payment Status',
        ],
        filteredBills.map((b) => [
          b.invoiceBillNumber,
          b.purchaseDate ? String(b.purchaseDate).slice(0, 10) : '',
          b.projectName,
          b.siteName,
          b.material,
          b.quantity,
          b.costPerUnit,
          b.totalAmount,
          b.amountPaid,
          b.amountDue,
          b.paymentStatus,
        ])
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={`Vendor Payables & Itemized Bills: ${group.vendorName || 'Vendor'}`}
      description="Itemized purchases, bills, executed settlements, and outstanding balances."
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-600">
            Total Purchases: <strong>₹{summary.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> | Paid:{' '}
            <strong className="text-emerald-700">₹{summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> | Outstanding Due:{' '}
            <strong className="text-amber-700">₹{summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Total Purchases</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5 font-mono">
              ₹{summary.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
            <span className="text-[10px] text-emerald-600 font-medium uppercase">Total Settled / Paid</span>
            <p className="font-bold text-emerald-800 text-sm mt-0.5 font-mono">
              ₹{summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            <span className="text-[10px] text-amber-600 font-medium uppercase">Outstanding Balance Due</span>
            <p className="font-bold text-amber-800 text-sm mt-0.5 font-mono">
              ₹{summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search bill number, material, project..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full rounded border border-slate-300 bg-white pl-8 pr-3 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Export All ({filteredBills.length})
          </Button>
        </div>

        {/* Bills Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[50vh]">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Bill / PO #</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Project / Site</th>
                <th className="px-3 py-2 text-left">Material / Item</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Cost/Unit</th>
                <th className="px-3 py-2 text-right font-mono">Total Cost (₹)</th>
                <th className="px-3 py-2 text-right font-mono text-emerald-700">Paid (₹)</th>
                <th className="px-3 py-2 text-right font-mono text-amber-700">Balance Due (₹)</th>
                <th className="px-3 py-2 text-center">Status</th>
                {onRecordPayment && <th className="px-3 py-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {pagedBills.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                    No matching non-zero bill records found.
                  </td>
                </tr>
              ) : (
                pagedBills.map((b, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap font-medium">
                      {b.invoiceBillNumber || `PR-${b.id}`}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {b.purchaseDate ? String(b.purchaseDate).slice(0, 10) : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-800 whitespace-nowrap">
                      {b.projectName} <span className="text-slate-400">({b.siteName})</span>
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{b.material}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                      {b.quantity} {b.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                      ₹{b.costPerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      ₹{b.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                      ₹{b.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                      ₹{b.amountDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          b.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.paymentStatus === 'partially_paid'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.paymentStatus.replace('_', ' ')}
                      </span>
                    </td>
                    {onRecordPayment && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {b.amountDue > 0 && (
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                              onClose();
                              onRecordPayment(b);
                            }}
                          >
                            Pay
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="text-slate-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 hover:bg-slate-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 hover:bg-slate-50"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
