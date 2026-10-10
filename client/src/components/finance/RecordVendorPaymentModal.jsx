import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { financeApi } from '../../api/financeApi';

export default function RecordVendorPaymentModal({ isOpen, onClose, request, onSuccess }) {
  const [amount, setAmount] = useState(request ? String(request.amountDue || '') : '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !request) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await financeApi.recordVendorPayment({
        procurementRequestId: request.id,
        vendorId: request.vendorId,
        amount: Number(amount),
        paymentDate,
        paymentReference: paymentReference || `VPAY-${Date.now()}`,
        paymentMethod,
        remarks,
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Vendor Payment">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Vendor:</span>
            <span className="font-semibold text-slate-800">{request.vendorName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Material/Item:</span>
            <span className="text-slate-800">{request.material} ({request.quantity} {request.unit})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Purchase:</span>
            <span className="text-slate-800">₹{Number(request.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Currently Paid:</span>
            <span className="text-slate-800">₹{Number(request.amountPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-amber-700">Amount Due:</span>
            <span className="text-amber-700 font-bold">₹{Number(request.amountDue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm border border-red-200">{error}</div>}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Payment Amount (₹) *
          </label>
          <Input
            type="number"
            step="0.01"
            max={request.amountDue || undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="e.g. 50000"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Payment Date *
          </label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Payment Method
          </label>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="bank_transfer">Bank Transfer / NEFT / RTGS</option>
            <option value="cheque">Cheque</option>
            <option value="upi">UPI / Online</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </Select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Reference / UTR / Cheque Number
          </label>
          <Input
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="e.g. UTR12345678 or CHQ-998811"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Remarks / Notes
          </label>
          <Input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional remarks"
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
