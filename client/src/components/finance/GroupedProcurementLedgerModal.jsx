import { useState, useMemo } from 'react';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function GroupedProcurementLedgerModal({ isOpen, onClose, group, onExportCSV }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const allRows = useMemo(() => {
    const list = group?.rows || [];
    // Filter non-zero values as specified in requirement 13
    return list.filter((r) => {
      const debit = Number(r.debit?.amount || 0);
      const credit = Number(r.credit?.amount || 0);
      const total = Number(r.totalAmount || 0);
      return debit > 0 || credit > 0 || total > 0;
    });
  }, [group]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return allRows;
    const q = searchTerm.toLowerCase();
    return allRows.filter((r) => {
      const mat = (r.material || '').toLowerCase();
      const ref = (r.referenceNumber || '').toLowerCase();
      const src = (r.source || '').toLowerCase();
      const dst = (r.destination || '').toLowerCase();
      const vend = (r.vendor || r.contractor || '').toLowerCase();
      return mat.includes(q) || ref.includes(q) || src.includes(q) || dst.includes(q) || vend.includes(q);
    });
  }, [allRows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const summary = useMemo(() => {
    let totDebit = 0;
    let totCredit = 0;
    allRows.forEach((r) => {
      totDebit += Number(r.debit?.amount || 0);
      totCredit += Number(r.credit?.amount || 0);
    });
    return {
      totalDebit: totDebit,
      totalCredit: totCredit,
      netBalance: totCredit - totDebit,
    };
  }, [allRows]);

  if (!isOpen || !group) return null;

  const handleExport = () => {
    if (onExportCSV) {
      onExportCSV(
        `Procurement_Ledger_${group.siteName || 'Site'}_${group.projectName || 'Project'}`,
        [
          'Date',
          'Ref Number',
          'Project',
          'Site',
          'Material/Item',
          'Quantity',
          'Unit',
          'Actual Cost/Unit',
          'DEBIT (Out)',
          'CREDIT (In)',
          'Source -> Destination',
          'Vendor / Contractor',
          'Status',
        ],
        filteredRows.map((r) => [
          r.date ? String(r.date).slice(0, 10) : '',
          r.referenceNumber,
          r.projectName,
          r.siteName,
          r.material,
          r.quantity,
          r.unit,
          r.costPerUnit,
          r.debit?.amount || 0,
          r.credit?.amount || 0,
          `${r.source} -> ${r.destination}`,
          r.vendor !== '-' ? r.vendor : r.contractor,
          r.status,
        ])
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={`Procurement Ledger (Debit/Credit): ${group.siteName || 'Site'} (${group.projectName || 'Project'})`}
      description="Itemized debit/credit procurement movements, central warehouse supplies, and material intake."
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-600">
            Total Debit (Out): <strong className="text-red-700">₹{summary.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> | Total Credit (In):{' '}
            <strong className="text-emerald-700">₹{summary.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> | Net Balance:{' '}
            <strong className="text-slate-900">₹{summary.netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
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
          <div className="bg-red-50 p-2.5 rounded-lg border border-red-200">
            <span className="text-[10px] text-red-600 font-medium uppercase">Total Debit (Outflow / Incurred)</span>
            <p className="font-bold text-red-800 text-sm mt-0.5 font-mono">
              ₹{summary.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
            <span className="text-[10px] text-emerald-600 font-medium uppercase">Total Credit (Inflow / Capitalized)</span>
            <p className="font-bold text-emerald-800 text-sm mt-0.5 font-mono">
              ₹{summary.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Net Material Balance</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5 font-mono">
              ₹{summary.netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search reference, material, vendor..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full rounded border border-slate-300 bg-white pl-8 pr-3 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Export All ({filteredRows.length})
          </Button>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[50vh]">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Ref Number</th>
                <th className="px-3 py-2 text-left">Material / Item</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Cost/Unit</th>
                <th className="px-3 py-2 text-right font-mono bg-red-50 text-red-900">DEBIT (Out)</th>
                <th className="px-3 py-2 text-right font-mono bg-emerald-50 text-emerald-900">CREDIT (In)</th>
                <th className="px-3 py-2 text-left">Source &rarr; Destination</th>
                <th className="px-3 py-2 text-left">Vendor / Contractor</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                    No matching non-zero ledger entries found.
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {r.date ? String(r.date).slice(0, 10) : '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">
                      {r.referenceNumber}
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{r.material}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                      {r.quantity} {r.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                      ₹{r.costPerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-red-700 bg-red-50/40 whitespace-nowrap">
                      ₹{r.debit?.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/40 whitespace-nowrap">
                      ₹{r.credit?.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{r.source}</span> &rarr;{' '}
                      <span className="font-semibold text-slate-800">{r.destination}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {r.vendor !== '-' ? r.vendor : r.contractor}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {r.status}
                      </span>
                    </td>
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
