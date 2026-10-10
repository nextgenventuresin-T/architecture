import { useState, useMemo } from 'react';
import { Search, Download, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function GroupedActualExpensesModal({ isOpen, onClose, group, onExportCSV }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const allRows = useMemo(() => group?.rows || [], [group]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (categoryFilter !== 'all') {
        const cat = (r.categoryType || r.category || '').toLowerCase();
        if (!cat.includes(categoryFilter.toLowerCase())) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mat = (r.material || '').toLowerCase();
        const task = (r.taskName || '').toLowerCase();
        const user = (r.updatedBy || '').toLowerCase();
        const tx = (r.sourceTransaction || '').toLowerCase();
        const lab = (r.labour || '').toLowerCase();
        const mach = (r.machinesTools || '').toLowerCase();
        const misc = (r.miscellaneous || '').toLowerCase();
        if (
          !mat.includes(q) &&
          !task.includes(q) &&
          !user.includes(q) &&
          !tx.includes(q) &&
          !lab.includes(q) &&
          !mach.includes(q) &&
          !misc.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allRows, searchTerm, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const totalFilteredAmount = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [filteredRows]);

  if (!isOpen || !group) return null;

  const handleExport = () => {
    if (onExportCSV) {
      onExportCSV(
        `Actual_Expenses_${group.siteName || 'Site'}_${group.projectName || 'Project'}`,
        [
          'Date',
          'Project',
          'Site',
          'Task',
          'Category',
          'Material/Item',
          'Quantity',
          'Cost/Unit',
          'Labour Details',
          'Machines/Tools',
          'Miscellaneous',
          'Amount (INR)',
          'Updated By',
          'Source Transaction',
        ],
        filteredRows.map((r) => [
          r.date ? String(r.date).slice(0, 10) : '',
          r.projectName,
          r.siteName,
          r.taskName,
          r.category,
          r.material,
          r.quantity,
          r.costPerUnit,
          r.labour,
          r.machinesTools,
          r.miscellaneous,
          r.amount,
          r.updatedBy,
          r.sourceTransaction,
        ])
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={`Actual Expenses Ledger: ${group.siteName || 'Site'} (${group.projectName || 'Project'})`}
      description={`Itemized site transactions, operational consumption, and material/labour expenses.`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs font-semibold text-slate-700">
            Showing {filteredRows.length} of {allRows.length} total entries | Total:{' '}
            <span className="text-emerald-700 font-bold">
              ₹{totalFilteredAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
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
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
          <div className="flex items-center space-x-1.5 flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search material, task, worker, transaction ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-slate-600">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="material">Material</option>
              <option value="labour">Labour</option>
              <option value="machines_tools">Machines / Tools</option>
              <option value="miscellaneous">Miscellaneous</option>
            </select>
          </div>

          <Button variant="secondary" size="sm" onClick={handleExport} className="ml-auto">
            <Download className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Export All ({filteredRows.length})
          </Button>
        </div>

        {/* Itemized Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[50vh]">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Task</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Material / Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate (₹)</th>
                <th className="px-3 py-2 text-left">Labour Details</th>
                <th className="px-3 py-2 text-left">Machines/Tools</th>
                <th className="px-3 py-2 text-left">Misc</th>
                <th className="px-3 py-2 text-right font-bold bg-slate-200">Amount (₹)</th>
                <th className="px-3 py-2 text-left">Updated By</th>
                <th className="px-3 py-2 text-left">Source Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {r.date ? String(r.date).slice(0, 10) : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-800 font-medium whitespace-nowrap">{r.taskName || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.categoryType === 'material'
                            ? 'bg-blue-100 text-blue-800'
                            : r.categoryType === 'labour'
                            ? 'bg-amber-100 text-amber-800'
                            : r.categoryType === 'machines_tools'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {r.category || 'General'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{r.material || '-'}</td>
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap font-mono">
                      {r.quantity != null ? `${r.quantity} ${r.unit || ''}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap font-mono">
                      {r.costPerUnit != null ? `₹${Number(r.costPerUnit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate" title={r.labour || ''}>
                      {r.labour || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate" title={r.machinesTools || ''}>
                      {r.machinesTools || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate" title={r.miscellaneous || ''}>
                      {r.miscellaneous || '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold font-mono text-slate-900 bg-slate-50 whitespace-nowrap">
                      ₹{Number(r.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.updatedBy || '-'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-blue-600 whitespace-nowrap">
                      {r.sourceTransaction || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
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
