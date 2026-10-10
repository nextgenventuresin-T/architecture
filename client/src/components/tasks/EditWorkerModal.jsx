import { useState, useEffect } from 'react';
import { X, HardHat, Phone, CreditCard, DollarSign, Briefcase, FileText } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { hrApi } from '../../api/hrApi';

const DEFAULT_TRADES = [
  'General Labour',
  'Mason',
  'Carpenter',
  'Bar Bender',
  'Electrician',
  'Plumber',
  'Painter',
  'Welder',
  'Machine Operator',
  'Tile Layer',
  'Supervisor',
  'Helper',
];

export default function EditWorkerModal({
  isOpen,
  onClose,
  worker,
  contractors = [],
  onSaved,
}) {
  const [workerType, setWorkerType] = useState('daily_wage');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [skillCategory, setSkillCategory] = useState('General Labour');
  const [contractorId, setContractorId] = useState('');
  const [dailyRate, setDailyRate] = useState(0);
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && worker) {
      const isCompany =
        worker.workerType === 'company_labour' ||
        Boolean(worker.isCompanyLabour);

      setWorkerType(isCompany ? 'company_labour' : 'daily_wage');
      setFullName(worker.fullName || worker.name || '');
      setPhone(worker.phone || '');
      setAadhaarNumber(worker.aadhaarNumber || '');
      setSkillCategory(worker.skillCategory || worker.trade || 'General Labour');
      setContractorId(worker.contractorId ? String(worker.contractorId) : '');
      setDailyRate(isCompany ? 0 : Number(worker.dailyRate || 0));
      setStatus(worker.status || 'active');
      setNotes(worker.notes || '');
      setError(null);
    }
  }, [isOpen, worker]);

  if (!isOpen || !worker) return null;

  const targetWorkerId = worker.workerId || worker.id;

  const handleTypeChange = (newType) => {
    setWorkerType(newType);
    if (newType === 'company_labour') {
      setDailyRate(0);
      setContractorId('');
    } else if (dailyRate === 0) {
      setDailyRate(750);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter the worker\'s full name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const isCompany = workerType === 'company_labour';

    try {
      const payload = {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        aadhaarNumber: aadhaarNumber.trim() || null,
        skillCategory: skillCategory,
        workerType: isCompany ? 'company_labour' : 'daily_wage',
        isCompanyLabour: isCompany,
        contractorId: isCompany ? null : (Number(contractorId) || null),
        dailyRate: isCompany ? 0 : Number(dailyRate || 0),
        status: status,
        notes: notes.trim() || null,
      };

      const updated = await hrApi.labourDirectory.update(targetWorkerId, payload);
      if (onSaved) {
        onSaved(updated);
      }
      onClose();
    } catch (err) {
      console.error('Failed to update worker:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update worker.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                workerType === 'company_labour'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              <HardHat className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-ink">Edit Worker Details</h3>
              <p className="text-xs text-ink-muted">
                {worker.workerCode ? `Code: ${worker.workerCode}` : `ID: #${targetWorkerId}`} • {worker.fullName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-canvas hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          {/* Classification Selection */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Labour Classification
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('daily_wage')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                  workerType === 'daily_wage'
                    ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-xs'
                    : 'border-line bg-white text-ink-muted hover:bg-canvas'
                }`}
              >
                Daily-Wage Worker (Contractor)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('company_labour')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                  workerType === 'company_labour'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                    : 'border-line bg-white text-ink-muted hover:bg-canvas'
                }`}
              >
                Company Labour (₹0 Cost)
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              {workerType === 'company_labour'
                ? 'ℹ️ Company Labour is permanent in-house workforce. Their daily rate is locked to ₹0 to keep project costs accurate.'
                : 'ℹ️ Daily Wage Workers generate actual labour costs (Days Worked × Daily Wage) in Project & Site Finance.'}
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
            />
          </div>

          {/* Phone & Aadhaar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Mobile Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full rounded-lg border border-line bg-white pl-8 pr-3 py-2 text-xs text-ink focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Aadhaar Number</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                <input
                  type="text"
                  value={aadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value)}
                  placeholder="e.g. 1234 5678 9012"
                  className="w-full rounded-lg border border-line bg-white pl-8 pr-3 py-2 text-xs text-ink focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          {/* Trade / Skill Category */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Trade / Skill Category</label>
              <select
                value={skillCategory}
                onChange={(e) => setSkillCategory(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
              >
                {DEFAULT_TRADES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {!DEFAULT_TRADES.includes(skillCategory) && skillCategory && (
                  <option value={skillCategory}>{skillCategory}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Contractor (Daily Wage only) & Daily Rate */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Contractor {workerType === 'daily_wage' && <span className="text-ink-subtle">(Optional)</span>}
              </label>
              {workerType === 'company_labour' ? (
                <div className="w-full rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-700 font-semibold">
                  Company Labour (In-House)
                </div>
              ) : (
                <select
                  value={contractorId}
                  onChange={(e) => setContractorId(e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
                >
                  <option value="">Independent / No Contractor</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Daily Wage / Rate (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-ink-muted">₹</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={workerType === 'company_labour' ? 0 : dailyRate}
                  disabled={workerType === 'company_labour'}
                  onChange={(e) => setDailyRate(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-lg border border-line bg-white pl-7 pr-3 py-2 text-xs text-ink focus:border-brand-500 disabled:bg-canvas disabled:text-ink-muted"
                />
              </div>
              {workerType === 'company_labour' && (
                <span className="mt-1 block text-[10px] text-blue-700 font-semibold">
                  ₹0 — Fixed at ₹0 for Company Labour (Salary is company overhead)
                </span>
              )}
            </div>
          </div>

          {/* Notes / Remarks */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Notes / Address</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Experienced plasterer, lives near site..."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={submitting}>
              {submitting ? 'Saving Changes…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
