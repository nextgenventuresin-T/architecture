import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import { warehouseApi } from '../../../api/warehouseApi';
import { toApiError } from '../../../api/axiosClient';
import { WAREHOUSE_STATUS_OPTIONS } from '../../../utils/warehouseOptions';

const EMPTY = { code: '', name: '', location: '', description: '', status: 'active' };

/** Add and edit share one form — the fields are identical, only the call differs. */
export default function WarehouseFormPage({ mode = 'create' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setIsLoading(true);
    warehouseApi
      .detail(id)
      .then((data) => {
        if (!active) return;
        const w = data.warehouse;
        setValues({
          code: w.code ?? '',
          name: w.name ?? '',
          location: w.location ?? '',
          description: w.description ?? '',
          status: w.status ?? 'active',
        });
      })
      .catch((caught) => active && setError(toApiError(caught)))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  function validate() {
    const errors = {};
    if (!values.name.trim()) errors.name = 'Enter a warehouse name.';
    if (!values.location.trim()) errors.location = 'Enter a location.';
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
    setError(null);
    try {
      const payload = {
        name: values.name.trim(),
        location: values.location.trim(),
        description: values.description.trim() || null,
        status: values.status,
        // Blank code on create means "generate one" — don't send an empty string.
        ...(values.code.trim() ? { code: values.code.trim() } : {}),
      };

      const warehouse = isEdit
        ? await warehouseApi.update(id, payload)
        : await warehouseApi.create(payload);

      navigate(`/admin/warehouse/${warehouse.id}`, {
        state: { flash: isEdit ? 'Warehouse updated.' : 'Warehouse created.' },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  }

  const title = isEdit ? 'Edit warehouse' : 'Add warehouse';

  if (isLoading) {
    return (
      <>
        <PageHeader
          title="Loading warehouse…"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Warehouse', to: '/admin/warehouse' }]}
          showBack
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={
          isEdit
            ? 'Update this warehouse’s details. Stock and movement history are not affected.'
            : 'Warehouses hold physical material stock. Leave the code blank to generate one.'
        }
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Warehouse', to: '/admin/warehouse' },
          { label: title },
        ]}
        showBack
      />

      {error && !error.details && (
        <Alert tone="error" title="Could not save this warehouse" className="mb-4">{error.message}</Alert>
      )}

      <Card className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="Warehouse code"
                value={values.code}
                onChange={set('code')}
                error={fieldErrors.code}
                placeholder="WH-002"
                hint={isEdit ? undefined : 'Leave blank to generate automatically.'}
              />

              <InputField
                label="Warehouse name"
                required
                value={values.name}
                onChange={set('name')}
                error={fieldErrors.name}
                placeholder="Main Store"
              />

              <InputField
                label="Location"
                required
                value={values.location}
                onChange={set('location')}
                error={fieldErrors.location}
                placeholder="Patiala"
              />

              <SelectField
                label="Status"
                value={values.status}
                onChange={set('status')}
                options={WAREHOUSE_STATUS_OPTIONS}
                error={fieldErrors.status}
                hint="Inactive warehouses cannot receive or issue stock."
              />

              <TextAreaField
                label="Description"
                value={values.description}
                onChange={set('description')}
                rows={3}
                className="sm:col-span-2"
                placeholder="What this warehouse is used for, access notes…"
              />
            </div>
          </CardBody>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <Link to={isEdit ? `/admin/warehouse/${id}` : '/admin/warehouse'}>
              <Button variant="secondary" type="button">Cancel</Button>
            </Link>
            <Button type="submit" isLoading={isSaving} loadingText="Saving…">
              {isEdit ? 'Save changes' : 'Create warehouse'}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
