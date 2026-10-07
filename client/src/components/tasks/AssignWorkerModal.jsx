import { useState, useEffect, useMemo } from 'react';
import { X, Search, User, ShieldCheck, HardHat, Calendar, DollarSign, Clock, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Alert from '../ui/Alert';
import hrApi from '../../api/hrApi';
import tasksApi from '../../api/tasksApi';
import { formatCurrency } from '../../utils/format';

function calcWorkingDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s) || isNaN(e) || s > e) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0) count++; // 6-day construction week, excluding Sundays
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function AssignWorkerModal({ taskId, task, isOpen, onClose, onAssigned, onOpenQuickAdd }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'daily_wage' | 'company_employee'
  const [workforce, setWorkforce] = useState([]);
  const [loadingWorkforce, setLoadingWorkforce] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);

  const [startDate, setStartDate] = useState(task?.startDate ? task.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(task?.endDate ? task.endDate.slice(0, 10) : '');
  const [expectedDays, setExpectedDays] = useState(0);
  const [dailyWage, setDailyWage] = useState(750);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingWorkforce(true);
    hrApi.labourDirectory
      .workforceLookup()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.workforce || data?.workers || []);
        setWorkforce(list);
      })
      .catch((err) => console.error('Failed to load workforce:', err))
      .finally(() => setLoadingWorkforce(false));
  }, [isOpen]);

  // Recalculate working days when dates change
  useEffect(() => {
    const days = calcWorkingDays(startDate, endDate);
    setExpectedDays(days);
  }, [startDate, endDate]);

  const filteredWorkforce = useMemo(() => {
    const list = Array.isArray(workforce) ? workforce : [];
    return list.filter((w) => {
      if (typeFilter === 'daily_wage' && w.workerType === 'company_employee') return false;
      if (typeFilter === 'company_employee' && w.workerType !== 'company_employee') return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (w.name || '').toLowerCase().includes(q);
        const matchTrade = (w.trade || '').toLowerCase().includes(q);
        const matchCode = (w.code || '').toLowerCase().includes(q);
        const matchPhone = (w.phone || '').toLowerCase().includes(q);
        const matchAadhaar = (w.aadhaarNumber || '').toLowerCase().includes(q);
        if (!matchName && !matchTrade && !matchCode && !matchPhone && !matchAadhaar) return false;
      }
      return true;
    });
  }, [workforce, typeFilter, searchTerm]);

  const handleSelectWorker = (w) => {
    setSelectedWorker(w);
    const isCompany = w.workerType === 'company_employee';
    setDailyWage(isCompany ? 0 : Number(w.dailyRate || 750));
    setError(null);
  };

  const isCompanyEmployee = selectedWorker?.workerType === 'company_employee';
  const plannedCost = isCompanyEmployee ? 0 : Number(expectedDays || 0) * Number(dailyWage || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedWorker) {
      setError('Please select a worker from the directory.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Please provide expected start and end dates.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await tasksApi.assignWorker(taskId, {
        worker_id: selectedWorker.workerId,
        worker_type: selectedWorker.workerType === 'company_employee' ? 'company_employee' : 'daily_wage',
        worker_name: selectedWorker.name,
        worker_code: selectedWorker.code,
        phone: selectedWorker.phone,
        aadhaar_number: selectedWorker.aadhaarNumber,
        trade: selectedWorker.trade,
        start_date: startDate,
        end_date: endDate,
        expected_days: expectedDays,
        daily_wage: isCompanyEmployee ? 0 : Number(dailyWage || 0),
        planned_cost: plannedCost,
        remarks: remarks.trim(),
      });

      onAssigned();
      onClose();
    } catch (err) {
      console.error('Failed to assign worker:', err);
      setError(err.response?.data?.error?.message || err.message || 'Failed to assign worker to task.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-ink">Assign Labour / Worker to Task</h3>
            <p className="text-xs text-ink-muted">
              Task: <strong className="text-ink">{task?.name || 'Task'}</strong>
            </p>
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          {/* Worker Selection Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                1. Select Labour / Person <span className="text-rose-500">*</span>
              </label>
              {onOpenQuickAdd && (
                <button
                  type="button"
                  onClick={onOpenQuickAdd}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 underline"
                >
                  + Add New Daily-Wage Worker
                </button>
              )}
            </div>

            {/* Selected Worker Preview */}
            {selectedWorker ? (
              <div className="flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50/50 p-3.5 mb-2">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${
                    isCompanyEmployee ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {isCompanyEmployee ? <ShieldCheck className="h-5 w-5" /> : <HardHat className="h-5 w-5" />}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm">{selectedWorker.name}</span>
                      <Badge tone={isCompanyEmployee ? 'neutral' : 'success'}>
                        {isCompanyEmployee ? 'Company Employee' : 'Daily Wage Worker'}
                      </Badge>
                    </div>
                    <div className="text-xs text-ink-muted flex flex-wrap items-center gap-2 mt-0.5">
                      <span>Trade: <strong className="text-ink">{selectedWorker.trade}</strong></span>
                      {selectedWorker.code && <span>ID: {selectedWorker.code}</span>}
                      {selectedWorker.phone && <span>Mobile: {selectedWorker.phone}</span>}
                      {selectedWorker.aadhaarNumber && <span>Aadhaar: {selectedWorker.aadhaarNumber}</span>}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="xs" type="button" onClick={() => setSelectedWorker(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-2">
                {/* Search & Filter pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                    <input
                      type="text"
                      placeholder="Type name, phone, Aadhaar, or trade to search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white pl-8 pr-3 py-1.5 text-xs text-ink focus:border-brand-500"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTypeFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        typeFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-white border border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      All ({workforce.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter('daily_wage')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        typeFilter === 'daily_wage' ? 'bg-brand-600 text-white' : 'bg-white border border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      Daily Wage
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter('company_employee')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        typeFilter === 'company_employee' ? 'bg-brand-600 text-white' : 'bg-white border border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      Company Staff
                    </button>
                  </div>
                </div>

                {/* Worker List Scrollable */}
                <div className="max-h-48 overflow-y-auto divide-y divide-line/60 rounded-lg border border-line bg-white">
                  {loadingWorkforce ? (
                    <p className="p-3 text-xs text-ink-muted text-center">Loading workforce catalogue…</p>
                  ) : filteredWorkforce.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-ink-muted">No matching workers found.</p>
                      {onOpenQuickAdd && (
                        <button
                          type="button"
                          onClick={onOpenQuickAdd}
                          className="mt-1 text-xs font-semibold text-brand-700 underline"
                        >
                          + Add new worker to Labour Directory
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredWorkforce.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleSelectWorker(w)}
                        className="w-full p-2.5 text-left hover:bg-canvas flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-ink">{w.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                              w.workerType === 'company_employee' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {w.workerType === 'company_employee' ? 'Staff' : 'Daily Wage'}
                            </span>
                            <span className="text-[11px] text-ink-muted">({w.trade})</span>
                          </div>
                          <div className="text-[11px] text-ink-subtle flex items-center gap-2 mt-0.5">
                            {w.code && <span>ID: {w.code}</span>}
                            {w.phone && <span>Mob: {w.phone}</span>}
                            {w.aadhaarNumber && <span>Aadhaar: {w.aadhaarNumber}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-ink">
                            {w.workerType === 'company_employee' ? '— (Staff)' : formatCurrency(w.dailyRate || 750) + '/day'}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dates & Calculation Area */}
          <div className="rounded-xl border border-line bg-white p-4 space-y-4">
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
              2. Assignment Schedule & Working Days
            </h4>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Expected Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Expected End Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 border-t border-line/60">
              <div className="rounded-lg bg-canvas p-3">
                <span className="text-[11px] font-medium text-ink-muted block">Expected Working Days</span>
                <span className="text-base font-bold text-brand-700 mt-0.5 block">
                  {expectedDays} Days
                </span>
                <span className="text-[10px] text-ink-subtle">Auto-calculated (excl. Sundays)</span>
              </div>

              <div className="rounded-lg bg-canvas p-3">
                <span className="text-[11px] font-medium text-ink-muted block">Daily Wage (₹)</span>
                {isCompanyEmployee ? (
                  <>
                    <span className="text-base font-bold text-ink-muted mt-0.5 block">— (₹0)</span>
                    <span className="text-[10px] text-ink-subtle">Company employee: wage = ₹0</span>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min="0"
                      value={dailyWage}
                      onChange={(e) => setDailyWage(Math.max(0, Number(e.target.value) || 0))}
                      className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1 text-xs font-bold text-ink focus:border-brand-500"
                    />
                    <span className="text-[10px] text-ink-subtle">Editable per task assignment</span>
                  </>
                )}
              </div>

              <div className="rounded-lg bg-canvas p-3">
                <span className="text-[11px] font-medium text-ink-muted block">Planned Labour Cost</span>
                <span className="text-base font-bold text-ink mt-0.5 block">
                  {isCompanyEmployee ? '₹0' : formatCurrency(plannedCost)}
                </span>
                <span className="text-[10px] text-ink-subtle">
                  {isCompanyEmployee ? 'No project wage expense' : `${expectedDays} d × ₹${dailyWage}`}
                </span>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Assignment Remarks (Optional)</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Lead mason for east foundation, shifts 8am - 5pm..."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={submitting || !selectedWorker}>
              {submitting ? 'Assigning Worker…' : 'Confirm Assignment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
