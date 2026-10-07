import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { hrApi } from '../../api/hrApi';
import { toApiError } from '../../api/axiosClient';
import { LEAVE_TYPE_OPTIONS } from '../../utils/hrOptions';

const today = new Date().toISOString().slice(0, 10);

const EMPTY = {
  leaveType: 'casual',
  startDate: today,
  endDate: today,
  reason: '',
  isHalfDay: false,
};

/**
 * Employee-facing leave application form. Any authenticated user may submit.
 * Backend attaches the employee record from the auth token — no employee picker here.
 */
export default function LeaveFormModal({ isOpen, onClose, onCreated }) {
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(EMPTY);
    setError(null);
    setFieldErrors({});
  }, [isOpen]);

  function set(key) {
    return (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function setCheck(key) {
    return (e) => setValues((prev) => ({ ...prev, [key]: e.target.checked }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = {};
    if (!values.startDate) errors.startDate = 'Enter a start date.';
    if (!values.endDate) errors.endDate = 'Enter an end date.';
    if (values.startDate && values.endDate && values.endDate < values.startDate)
      errors.endDate = 'End date must be on or after start date.';
    if (!values.reason.trim()) errors.reason = 'Enter a reason for the leave.';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setIsSaving(true);
    try {
      const created = await hrApi.leave.create({
        leaveType: values.leaveType,
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason.trim(),
        isHalfDay: values.isHalfDay,
      });
      onCreated?.(created);
      onClose();
    } catch (caught) {
      const apiError = toApiError(caught);
      setError(apiError);
      if (apiError.details) setFieldErrors(apiError.details);
    } finally {
      setIsSaving(false);
    }
  }

  // Rough day count for the helper text
  const dayCount = (() => {
    if (!values.startDate || !values.endDate) return null;
    const diff = (new Date(values.endDate) - new Date(values.startDate)) / 86400000 + 1;
    if (diff < 1) return null;
    return values.isHalfDay ? 0.5 : diff;
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apply for leave"
      description="Submit a leave request. HR will review and approve or reject it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isSaving} loadingText="Submitting…">
            Submit leave request
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && (
          <Alert tone="error" title="Could not submit leave request">{error.message}</Alert>
        )}

        <SelectField
          label="Leave type"
          required
          value={values.leaveType}
          onChange={set('leaveType')}
          options={LEAVE_TYPE_OPTIONS}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="From"
            type="date"
            required
            value={values.startDate}
            onChange={set('startDate')}
            error={fieldErrors.startDate}
          />
          <InputField
            label="To"
            type="date"
            required
            value={values.endDate}
            onChange={set('endDate')}
            error={fieldErrors.endDate}
            hint={dayCount !== null ? `${dayCount} day${dayCount !== 1 ? 's' : ''}` : undefined}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
          <input
            type="checkbox"
            checked={values.isHalfDay}
            onChange={setCheck('isHalfDay')}
            className="h-4 w-4 rounded border-line text-brand-600 accent-brand-600"
          />
          Half day
        </label>

        <TextAreaField
          label="Reason"
          required
          value={values.reason}
          onChange={set('reason')}
          error={fieldErrors.reason}
          rows={3}
          placeholder="Briefly describe the reason for your leave…"
        />
      </form>
    </Modal>
  );
}
