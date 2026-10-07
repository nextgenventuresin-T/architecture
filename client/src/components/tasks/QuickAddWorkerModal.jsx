import { useState } from 'react';
import { X, HardHat, Phone, CreditCard, DollarSign, Wrench } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import tasksApi from '../../api/tasksApi';

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
];

export default function QuickAddWorkerModal({ isOpen, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [skillCategory, setSkillCategory] = useState('General Labour');
  const [dailyRate, setDailyRate] = useState(750);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter the worker full name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await tasksApi.quickCreateWorker({
        full_name: fullName.trim(),
        phone: phone.trim(),
        aadhaar_number: aadhaarNumber.trim(),
        skill_category: skillCategory,
        daily_rate: Number(dailyRate || 750),
        notes: notes.trim(),
      });

      onCreated(created);
      onClose();
    } catch (err) {
      console.error('Failed to create worker:', err);
      setError(err.response?.data?.error?.message || err.message || 'Failed to create worker.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <HardHat className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-ink">Add New Daily-Wage Worker</h3>
              <p className="text-xs text-ink-muted">Adds directly to Labour Directory & assigns on site</p>
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Raj Kumar, Amit Singh..."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
            />
          </div>

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
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Daily Wage / Rate (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-ink-muted">₹</span>
                <input
                  type="number"
                  min="0"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-lg border border-line bg-white pl-7 pr-3 py-2 text-xs text-ink focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Notes / Address</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Experienced mason, Patiala local..."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={submitting}>
              {submitting ? 'Creating Worker…' : 'Save & Make Available'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
