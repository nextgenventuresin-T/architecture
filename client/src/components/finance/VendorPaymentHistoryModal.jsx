import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import { financeApi } from '../../api/financeApi';

export default function VendorPaymentHistoryModal({ isOpen, onClose, procurementRequestId, vendorName }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !procurementRequestId) {
      setPayments([]);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setError(null);
    financeApi
      .vendorPaymentsHistory(procurementRequestId)
      .then((data) => {
        if (isMounted) setPayments(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (isMounted) setError(err?.message || 'Failed to load payment history');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, procurementRequestId]);

  if (!isOpen) return null;

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title={`Payment History - ${vendorName || 'Vendor'}`}>
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
        ) : payments.length === 0 ? (
          <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
            No payments recorded yet for this procurement request.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-slate-700 font-semibold">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-right">Amount (₹)</th>
                  <th className="px-3 py-2 text-left">Recorded By</th>
                  <th className="px-3 py-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(p.paymentDate).slice(0, 10)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">{p.paymentReference}</td>
                    <td className="px-3 py-2 text-slate-600 capitalize">{p.paymentMethod?.replace('_', ' ')}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      ₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.createdByName || '-'}</td>
                    <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{p.remarks || '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold text-slate-900 border-t border-slate-300">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right">Total Paid:</td>
                  <td className="px-3 py-2 text-right text-emerald-700 font-bold">
                    ₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
