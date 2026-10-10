import { useEffect, useState } from 'react';
import { X, ExternalLink, Calendar, Building, Layers } from 'lucide-react';
import { financeApi } from '../../api/financeApi';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';

export default function FinanceDrilldownModal({ isOpen, onClose, title, subtitle, params }) {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !params) {
      setRecords([]);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setError(null);

    financeApi
      .drilldownDetails(params)
      .then((data) => {
        if (isMounted) setRecords(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (isMounted) setError(err?.response?.data?.message || err?.message || 'Failed to load details');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, params]);

  if (!isOpen) return null;

  const totalAmount = records.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title={title || 'Transaction Drill-Down'}>
      <div className="p-4 space-y-4">
        {subtitle && (
          <div className="text-sm font-medium text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            {subtitle}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{error}</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
            No itemized transactions found for this selection.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[60vh]">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold">
                <tr>
                  <th className="px-3 py-2.5 text-left">Date</th>
                  <th className="px-3 py-2.5 text-left">Ref / Tx ID</th>
                  <th className="px-3 py-2.5 text-left">Type / Item</th>
                  <th className="px-3 py-2.5 text-right">Quantity</th>
                  <th className="px-3 py-2.5 text-right">Rate (₹)</th>
                  <th className="px-3 py-2.5 text-right">Amount (₹)</th>
                  <th className="px-3 py-2.5 text-left">Contractor / Party</th>
                  <th className="px-3 py-2.5 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {records.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {r.date ? String(r.date).slice(0, 10) : '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">
                      {r.source_reference || r.source_transaction || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-medium">
                      {r.item_name || r.transaction_type || '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
                      {r.quantity != null ? `${r.quantity} ${r.unit || ''}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
                      {r.rate != null ? `₹${Number(r.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                      ₹{Number(r.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.contractor_name || '-'}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-xs truncate" title={r.notes || ''}>
                      {r.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-300 sticky bottom-0">
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-right">Total Verified Amount:</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">
                    ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
