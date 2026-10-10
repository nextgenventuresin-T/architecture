import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { financeApi } from '../../api/financeApi';

export default function RecordClientPaymentModal({ isOpen, onClose, project, onSuccess }) {
  const [amount, setAmount] = useState(project ? String(project.amountDue || project.clientDue || '') : '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceReference, setInvoiceReference] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !project) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await financeApi.recordClientPayment({
        clientId: project.clientId,
        projectId: project.projectId || project.id,
        amount: Number(amount),
        paymentDate,
        invoiceReference,
        paymentReference: paymentReference || `CPAY-${Date.now()}`,
        paymentMethod,
        notes,
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const due = Number(project.amountDue || project.clientDue || (Number(project.contractValue || 0) - Number(project.amountReceived || project.clientPaid || 0)));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Client Payment Received">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Client:</span>
            <span className="font-semibold text-slate-800">{project.clientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Project:</span>
            <span className="text-slate-800">{project.projectName || project.name} ({project.projectCode || project.code})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Contract Value:</span>
            <span className="text-slate-800">₹{Number(project.contractValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Already Received:</span>
            <span className="text-slate-800">₹{Number(project.amountReceived || project.clientPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-amber-700">Remaining Due:</span>
            <span className="text-amber-700 font-bold">₹{due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm border border-red-200">{error}</div>}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Amount Received (₹) *
          </label>
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="e.g. 100000"
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
            <option value="other">Other</option>
          </Select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Invoice / Bill Reference
          </label>
          <Input
            type="text"
            value={invoiceReference}
            onChange={(e) => setInvoiceReference(e.target.value)}
            placeholder="e.g. INV-2026-001"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            UTR / Transaction / Cheque Reference
          </label>
          <Input
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="e.g. UTR89127391 or CHQ-445522"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
            Notes / Remarks
          </label>
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Recording...' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
