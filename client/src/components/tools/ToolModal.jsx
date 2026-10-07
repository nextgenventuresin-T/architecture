import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { toolApi } from '../../api/toolApi';
import { toApiError } from '../../api/axiosClient';

const TOOL_TYPES = [
  { value: 'Heavy Machinery', label: 'Heavy Machinery' },
  { value: 'Power Tool', label: 'Power Tool' },
  { value: 'Hand Tool', label: 'Hand Tool' },
  { value: 'Measuring Equipment', label: 'Measuring Equipment' },
  { value: 'Safety & Scaffolding', label: 'Safety & Scaffolding' },
  { value: 'General Equipment', label: 'General Equipment' },
];

export default function ToolModal({ tool, isOpen, onClose, onSaved }) {
  if (!isOpen) return null;

  const isEdit = Boolean(tool?.id);
  const [values, setValues] = useState({
    name: tool?.name ?? '',
    type: tool?.type ?? 'Heavy Machinery',
    description: tool?.description ?? '',
    status: tool?.status ?? 'active',
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const set = (k) => (e) => {
    setValues((prev) => ({ ...prev, [k]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.name.trim()) {
      setFieldErrors({ name: 'Tool name is required.' });
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const saved = isEdit
        ? await toolApi.update(tool.id, values)
        : await toolApi.create(values);
      onSaved(saved);
      onClose();
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-ink">{isEdit ? 'Edit Machine / Tool' : 'Add Machine / Tool'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-ink-subtle hover:bg-canvas">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 p-6">
            {formError && <Alert tone="error">{formError.message}</Alert>}

            <InputField
              label="Tool / Machine Name"
              required
              placeholder="e.g. Concrete Mixer / Tower Crane"
              value={values.name}
              onChange={set('name')}
              error={fieldErrors.name}
            />

            <SelectField
              label="Type / Classification"
              required
              options={TOOL_TYPES}
              value={values.type}
              onChange={set('type')}
              error={fieldErrors.type}
            />

            <TextAreaField
              label="Description"
              rows={3}
              placeholder="Specifications, capacity, model..."
              value={values.description}
              onChange={set('description')}
              error={fieldErrors.description}
            />

            <SelectField
              label="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              value={values.status}
              onChange={set('status')}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              <Save className="mr-1.5 h-4 w-4" />
              {isEdit ? 'Save Changes' : 'Create Tool'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
