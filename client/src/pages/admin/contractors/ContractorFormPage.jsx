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
import { contractorsApi } from '../../../api/contractorsApi';
import { toApiError } from '../../../api/axiosClient';
import { CONTRACTOR_STATUSES, CONTRACTOR_TYPES } from '../../../utils/contractorOptions';

const EMPTY = {
  name: '', contact_person: '', phone: '', email: '', address: '',
  type: 'other', status: 'active', notes: '', user_id: '',
  pan_number: '', aadhaar_number: '', gst_number: '',
  bank_account_holder: '', bank_account_number: '', bank_name: '', bank_ifsc: '', bank_branch: '',
};

/** Serves both /contractors/new and /contractors/:id/edit — same fields, same rules. */
export default function ContractorFormPage({ mode = 'create' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: existing, isLoading: loadingContractor, error: loadError } = useAsync(
    () => (isEdit ? contractorsApi.detail(id) : Promise.resolve(null)),
    [isEdit, id]
  );

  // CONTRACTOR-role accounts eligible to link. In edit mode this includes
  // whoever is currently linked to this contractor even though they are
  // "taken", so the current selection still renders.
  const { data: eligibleUsers, isLoading: loadingUsers } = useAsync(
    () => contractorsApi.eligibleUsers(isEdit ? id : undefined),
    [isEdit, id]
  );

  useEffect(() => {
    if (!existing?.contractor) return;
    const c = existing.contractor;
    setValues({
      name: c.name ?? '',
      contact_person: c.contactPerson ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      type: c.type ?? 'other',
      status: c.status ?? 'active',
      notes: c.notes ?? '',
      user_id: c.linkedUser?.id ? String(c.linkedUser.id) : '',
      pan_number: c.panNumber ?? c.pan_number ?? '',
      aadhaar_number: c.aadhaarNumber ?? c.aadhaar_number ?? '',
      gst_number: c.gstNumber ?? c.gst_number ?? '',
      bank_account_holder: c.bankAccountHolder ?? c.bank_account_holder ?? '',
      bank_account_number: c.bankAccountNumber ?? c.bank_account_number ?? '',
      bank_name: c.bankName ?? c.bank_name ?? '',
      bank_ifsc: c.bankIfsc ?? c.bank_ifsc ?? '',
      bank_branch: c.bankBranch ?? c.bank_branch ?? '',
    });
  }, [existing]);

  const userOptions = (eligibleUsers ?? []).map((u) => ({
    value: String(u.id),
    label: `${u.fullName} (${u.email})${u.isActive ? '' : ' — inactive'}`,
  }));

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  /** Client-side checks mirror the API rules so mistakes surface immediately. */
  function validate() {
    const errors = {};
    if (!values.name.trim()) errors.name = 'Enter the contractor name.';
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
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

    const payload = { ...values };
    for (const key of [
      'contact_person', 'phone', 'email', 'address', 'notes',
      'pan_number', 'aadhaar_number', 'gst_number',
      'bank_account_holder', 'bank_account_number', 'bank_name', 'bank_ifsc', 'bank_branch'
    ]) {
      if (payload[key] === '') payload[key] = null;
    }
    // '' means "not linked" — send null so the API clears/omits the link
    // rather than trying to parse an empty string as a user id.
    payload.user_id = payload.user_id === '' ? null : Number(payload.user_id);

    try {
      const saved = isEdit
        ? await contractorsApi.update(id, payload)
        : await contractorsApi.create(payload);
      navigate(`/admin/contractors/${saved.id}`, { replace: true, state: { flash: isEdit ? 'Contractor updated.' : 'Contractor added.' } });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
      setIsSaving(false);
    }
  }

  const isLoading = isEdit && loadingContractor;
  const cancelTo = isEdit ? `/admin/contractors/${id}` : '/admin/contractors';

  if (loadError) {
    return (
      <>
        <PageHeader title="Edit contractor" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Contractors', to: '/admin/contractors' }, { label: 'Edit' }]} showBack />
        <Alert tone="error" title="Could not load this contractor">{loadError.message}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit contractor' : 'Add contractor'}
        description={isEdit ? 'Update this contractor’s details and status.' : 'Add a contractor to the directory.'}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Contractors', to: '/admin/contractors' },
          ...(isEdit ? [{ label: existing?.contractor?.name ?? 'Contractor', to: `/admin/contractors/${id}` }] : []),
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
            <CardHeader title="Contractor details" description="Who they are and how to reach them." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <InputField label="Name" required value={values.name} onChange={set('name')} error={fieldErrors.name} placeholder="Gurmeet Constructions" className="sm:col-span-2" />
              <InputField label="Contact person" value={values.contact_person} onChange={set('contact_person')} error={fieldErrors.contact_person} placeholder="Gurmeet Sandhu" />
              <InputField label="Phone" type="tel" value={values.phone} onChange={set('phone')} error={fieldErrors.phone} placeholder="+91 98140 22011" />
              <InputField label="Email" type="email" value={values.email} onChange={set('email')} error={fieldErrors.email} placeholder="contact@contractor.in" />
              <InputField label="Address" value={values.address} onChange={set('address')} error={fieldErrors.address} placeholder="Rajpura Road, Patiala" />
              <SelectField label="Type" value={values.type} onChange={set('type')} options={CONTRACTOR_TYPES} error={fieldErrors.type} />
              <SelectField label="Status" value={values.status} onChange={set('status')} options={CONTRACTOR_STATUSES} error={fieldErrors.status}
                hint="Blacklisted or inactive contractors drop out of project team pickers." />
              <TextAreaField label="Notes" value={values.notes} onChange={set('notes')} rows={4} className="sm:col-span-2" placeholder="Internal notes about this contractor…" />
            </CardBody>
          </Card>

          {/* Statutory & Tax Details */}
          <Card>
            <CardHeader
              title="Statutory & Tax Information"
              description="PAN, Aadhaar and GST registration numbers for official records and billing."
            />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <InputField
                label="PAN Card Number"
                value={values.pan_number}
                onChange={set('pan_number')}
                error={fieldErrors.pan_number}
                placeholder="e.g. ABCDE1234F"
              />
              <InputField
                label="Aadhaar Card Number"
                value={values.aadhaar_number}
                onChange={set('aadhaar_number')}
                error={fieldErrors.aadhaar_number}
                placeholder="e.g. 1234 5678 9012"
              />
              <InputField
                label="GST Number (GSTIN)"
                value={values.gst_number}
                onChange={set('gst_number')}
                error={fieldErrors.gst_number}
                placeholder="e.g. 07AAAAA0000A1Z5"
              />
            </CardBody>
          </Card>

          {/* Banking Details */}
          <Card>
            <CardHeader
              title="Bank Account Information"
              description="Official bank credentials for milestone releases and digital disbursements."
            />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <InputField
                label="Bank Account Holder Name"
                value={values.bank_account_holder}
                onChange={set('bank_account_holder')}
                error={fieldErrors.bank_account_holder}
                placeholder="e.g. Gurmeet Constructions Pvt Ltd"
                className="sm:col-span-2"
              />
              <InputField
                label="Bank Account Number"
                value={values.bank_account_number}
                onChange={set('bank_account_number')}
                error={fieldErrors.bank_account_number}
                placeholder="e.g. 9876543210123"
              />
              <InputField
                label="Bank Name"
                value={values.bank_name}
                onChange={set('bank_name')}
                error={fieldErrors.bank_name}
                placeholder="e.g. State Bank of India / HDFC Bank"
              />
              <InputField
                label="IFSC Code"
                value={values.bank_ifsc}
                onChange={set('bank_ifsc')}
                error={fieldErrors.bank_ifsc}
                placeholder="e.g. SBIN0001234"
              />
              <InputField
                label="Branch Name"
                value={values.bank_branch}
                onChange={set('bank_branch')}
                error={fieldErrors.bank_branch}
                placeholder="e.g. Mall Road, Patiala"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Portal access"
              description="Link a Contractor login so this contractor can sign in and see only their own projects, procurement requests and warehouse data."
            />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SelectField
                label="Linked user account"
                value={values.user_id}
                onChange={set('user_id')}
                options={userOptions}
                placeholder={loadingUsers ? 'Loading accounts…' : 'Not linked'}
                error={fieldErrors.user_id}
                hint="Only accounts with the Contractor role, not already linked to another contractor, are listed."
                disabled={loadingUsers}
                className="sm:col-span-2"
              />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg" isLoading={isSaving} loadingText="Saving…">
              <Save className="h-4 w-4" aria-hidden="true" />
              {isEdit ? 'Save changes' : 'Add contractor'}
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
