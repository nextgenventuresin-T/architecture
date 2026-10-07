import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Save, X } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import useAsync from '../../../hooks/useAsync';
import { materialsApi } from '../../../api/materialsApi';
import { toApiError } from '../../../api/axiosClient';
import {
  MATERIAL_CATEGORIES,
  MATERIAL_STATUSES,
  MATERIAL_UNITS,
} from '../../../utils/materialOptions';

const EMPTY = {
  code: '',
  name: '',
  category: '',
  unit: '',
  min_stock: '0',
  default_supplier: '',
  default_rate: '0',
  status: 'active',
  notes: '',
};

/** Serves both /materials/new and /materials/:id/edit — same fields, same rules. */
export default function MaterialFormPage({ mode = 'create' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [options, setOptions] = useState({ categories: MATERIAL_CATEGORIES, units: MATERIAL_UNITS });

  const { data: existing, isLoading: loadingMaterial, error: loadError } = useAsync(
    () => (isEdit ? materialsApi.detail(id) : Promise.resolve(null)),
    [isEdit, id]
  );

  // Merge server-known categories/units with the built-in lists, so existing
  // catalogue values (Masonry, Finishing, …) remain selectable when editing.
  useEffect(() => {
    materialsApi
      .lookups()
      .then((data) =>
        setOptions({
          categories: Array.from(new Set([...MATERIAL_CATEGORIES, ...(data.categories ?? [])])),
          units: Array.from(new Set([...MATERIAL_UNITS, ...(data.units ?? [])])),
        })
      )
      .catch(() => setOptions({ categories: MATERIAL_CATEGORIES, units: MATERIAL_UNITS }));
  }, []);

  useEffect(() => {
    if (!existing?.material) return;
    const m = existing.material;
    setValues({
      code: m.code ?? '',
      name: m.name ?? '',
      category: m.category ?? '',
      unit: m.unit ?? '',
      min_stock: String(m.minStock ?? 0),
      default_supplier: m.supplier ?? '',
      default_rate: String(m.purchaseRate ?? 0),
      status: m.status ?? 'active',
      notes: m.notes ?? '',
    });
  }, [existing]);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  /** Client-side checks mirror the API rules so mistakes surface immediately. */
  function validate() {
    const errors = {};
    if (!values.name.trim()) errors.name = 'Enter the material name.';
    if (!values.category.trim()) errors.category = 'Choose a category.';
    if (!values.unit.trim()) errors.unit = 'Choose a unit.';
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      ...values,
      min_stock: Number(values.min_stock),
      default_rate: Number(values.default_rate),
      code: values.code.trim() || null,
      default_supplier: values.default_supplier.trim() || null,
      notes: values.notes.trim() || null,
    };

    try {
      const saved = isEdit
        ? await materialsApi.update(id, payload)
        : await materialsApi.create(payload);
      navigate(`/admin/materials/${saved.id}`, {
        replace: true,
        state: { flash: isEdit ? 'Material updated.' : 'Material added.' },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
      setIsSaving(false);
    }
  }

  const isLoading = isEdit && loadingMaterial;
  const cancelTo = isEdit ? `/admin/materials/${id}` : '/admin/materials';

  if (loadError) {
    return (
      <>
        <PageHeader
          title="Edit material"
          breadcrumbs={[
            { label: 'Dashboard', to: '/admin' },
            { label: 'Materials', to: '/admin/materials' },
            { label: 'Edit' },
          ]}
          showBack
        />
        <Alert tone="error" title="Could not load this material">{loadError.message}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit material' : 'Add material'}
        description={
          isEdit ? 'Update this material\u2019s details and reorder level.' : 'Add a material to the catalogue.'
        }
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Materials', to: '/admin/materials' },
          ...(isEdit
            ? [{ label: existing?.material?.name ?? 'Material', to: `/admin/materials/${id}` }]
            : []),
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        showBack
      />

      {formError && <Alert tone="error" title="Could not save" className="mb-4">{formError.message}</Alert>}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Card>
            <CardHeader title="Material details" description="What it is and how it is measured." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <InputField
                label="Material name"
                required
                value={values.name}
                onChange={set('name')}
                error={fieldErrors.name}
                placeholder="Cement (OPC 53)"
                className="sm:col-span-2"
              />
              <InputField
                label="Material code"
                value={values.code}
                onChange={set('code')}
                error={fieldErrors.code}
                placeholder="MAT-0016"
                hint={isEdit ? undefined : 'Leave blank and one will be generated.'}
              />
              <SelectField
                label="Category"
                required
                value={values.category}
                onChange={set('category')}
                error={fieldErrors.category}
                placeholder="Select a category"
                options={options.categories.map((c) => ({ value: c, label: c }))}
              />
              <SelectField
                label="Unit"
                required
                value={values.unit}
                onChange={set('unit')}
                error={fieldErrors.unit}
                placeholder="Select a unit"
                options={options.units.map((u) => ({ value: u, label: u }))}
                hint="How this material is counted."
              />
              <SelectField
                label="Status"
                value={values.status}
                onChange={set('status')}
                options={MATERIAL_STATUSES}
                error={fieldErrors.status}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Reference details"
              description="Optional notes to help identify or handle this material."
            />
            <CardBody className="grid grid-cols-1 gap-5">
              <TextAreaField
                label="Notes"
                value={values.notes}
                onChange={set('notes')}
                rows={4}
                placeholder="Grade, storage requirements, handling notes…"
              />
            </CardBody>
          </Card>

          <p className="text-sm text-ink-subtle">
            This is the material master (identity only). Stock quantities are held in Warehouse and change
            only through warehouse receipts, issues and transfers — they are never set here.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg" isLoading={isSaving} loadingText="Saving…">
              <Save className="h-4 w-4" aria-hidden="true" />
              {isEdit ? 'Save changes' : 'Add material'}
            </Button>
            <Link to={cancelTo}>
              <Button type="button" variant="secondary" size="lg">
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
