import { useState, useEffect } from 'react';
import { X, Save, Building2, UserCheck, MapPin, ShieldCheck, Check } from 'lucide-react';
import { InputField, TextAreaField, SelectField } from '../ui/Field';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { clientApi } from '../../api/clientApi';
import { toApiError } from '../../api/axiosClient';

const CLIENT_TYPE_OPTIONS = [
  { value: 'Company', label: 'Company' },
  { value: 'Individual', label: 'Individual' },
  { value: 'Partnership', label: 'Partnership' },
  { value: 'LLP', label: 'LLP' },
  { value: 'Government', label: 'Government' },
  { value: 'Other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function ClientModal({ client, isOpen, onClose, onSaved }) {
  if (!isOpen) return null;

  const isEdit = Boolean(client?.id);

  const [values, setValues] = useState({
    name: '',
    client_type: 'Company',
    pan: '',
    gstin: '',
    cin: '',
    website: '',
    status: 'active',

    contact_person: '',
    phone: '',
    alternate_phone: '',
    email: '',
    alternate_email: '',

    corporate_address: '',
    billing_address: '',
    same_as_corporate: false,

    efy: '',
    adherence: '',
    notes: '',
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (client) {
      const corpAddr = client.corporateAddress ?? client.corporate_address ?? client.address ?? '';
      const billAddr = client.billingAddress ?? client.billing_address ?? '';
      const isSame = Boolean(corpAddr && billAddr && corpAddr === billAddr);

      setValues({
        name: client.name ?? '',
        client_type: client.clientType ?? client.client_type ?? 'Company',
        pan: client.pan ?? '',
        gstin: client.gstin ?? '',
        cin: client.cin ?? '',
        website: client.website ?? '',
        status: client.status ?? 'active',

        contact_person: client.contactPerson ?? client.contact_person ?? '',
        phone: client.phone ?? '',
        alternate_phone: client.alternatePhone ?? client.alternate_phone ?? '',
        email: client.email ?? '',
        alternate_email: client.alternateEmail ?? client.alternate_email ?? '',

        corporate_address: corpAddr,
        billing_address: billAddr,
        same_as_corporate: isSame,

        efy: client.efy ?? '',
        adherence: client.adherence ?? '',
        notes: client.notes ?? '',
      });
    } else {
      setValues({
        name: '',
        client_type: 'Company',
        pan: '',
        gstin: '',
        cin: '',
        website: '',
        status: 'active',

        contact_person: '',
        phone: '',
        alternate_phone: '',
        email: '',
        alternate_email: '',

        corporate_address: '',
        billing_address: '',
        same_as_corporate: false,

        efy: '',
        adherence: '',
        notes: '',
      });
    }
    setFieldErrors({});
    setFormError(null);
  }, [client, isOpen]);

  const set = (key) => (e) => {
    const val = e.target.value;
    setValues((prev) => {
      const updated = { ...prev, [key]: val };
      if (key === 'corporate_address' && prev.same_as_corporate) {
        updated.billing_address = val;
      }
      return updated;
    });
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleCheckboxChange = (e) => {
    const checked = e.target.checked;
    setValues((prev) => ({
      ...prev,
      same_as_corporate: checked,
      billing_address: checked ? prev.corporate_address : prev.billing_address,
    }));
    if (checked) {
      setFieldErrors((prev) => ({ ...prev, billing_address: undefined }));
    }
  };

  function validate() {
    const errors = {};
    if (!values.name.trim()) {
      errors.name = 'Client name is required.';
    }

    if (values.pan.trim()) {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
      if (!panRegex.test(values.pan.trim())) {
        errors.pan = 'Enter a valid 10-character PAN (e.g. ABCDE1234F).';
      }
    }

    if (values.gstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
      if (!gstinRegex.test(values.gstin.trim())) {
        errors.gstin = 'Enter a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).';
      }
    }

    if (values.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(values.email.trim())) {
        errors.email = 'Enter a valid email address.';
      }
    }

    if (values.alternate_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(values.alternate_email.trim())) {
        errors.alternate_email = 'Enter a valid alternate email address.';
      }
    }

    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      name: values.name.trim(),
      client_type: values.client_type,
      pan: values.pan.trim().toUpperCase() || null,
      gstin: values.gstin.trim().toUpperCase() || null,
      cin: values.cin.trim().toUpperCase() || null,
      website: values.website.trim() || null,
      status: values.status,

      contact_person: values.contact_person.trim() || null,
      phone: values.phone.trim() || null,
      alternate_phone: values.alternate_phone.trim() || null,
      email: values.email.trim() || null,
      alternate_email: values.alternate_email.trim() || null,

      corporate_address: values.corporate_address.trim() || null,
      billing_address: (values.same_as_corporate ? values.corporate_address : values.billing_address).trim() || null,

      efy: values.efy.trim() || null,
      adherence: values.adherence.trim() || null,
      notes: values.notes.trim() || null,
    };

    try {
      const saved = isEdit
        ? await clientApi.update(client.id, payload)
        : await clientApi.create(payload);
      if (typeof onSaved === 'function') onSaved(saved);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-3xl flex-col max-h-[92vh] rounded-2xl bg-white shadow-2xl border border-line overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line bg-canvas px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-700" />
              {isEdit ? 'Edit Client' : 'Add New Client'}
            </h2>
            <p className="text-xs text-ink-subtle mt-0.5">
              Complete client registration, tax, contact, and compliance profile.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-white hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {formError && <Alert tone="error">{formError.message}</Alert>}

            {/* SECTION 1 — Basic Details */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-line/60 pb-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">
                  1
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Section 1 — Basic Details
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <InputField
                    label="Client Name"
                    required
                    placeholder="e.g. DLF Urban Private Limited / Mr. Rajesh Sharma"
                    value={values.name}
                    onChange={set('name')}
                    error={fieldErrors.name}
                  />
                </div>

                <SelectField
                  label="Client Type"
                  value={values.client_type}
                  onChange={set('client_type')}
                  options={CLIENT_TYPE_OPTIONS}
                  error={fieldErrors.client_type}
                />

                <SelectField
                  label="Status"
                  value={values.status}
                  onChange={set('status')}
                  options={STATUS_OPTIONS}
                  error={fieldErrors.status}
                />

                <InputField
                  label="PAN / Tax ID"
                  placeholder="e.g. ABCDE1234F"
                  value={values.pan}
                  onChange={set('pan')}
                  error={fieldErrors.pan}
                  maxLength={10}
                />

                <InputField
                  label="GSTIN"
                  placeholder="e.g. 07AAAAA0000A1Z5"
                  value={values.gstin}
                  onChange={set('gstin')}
                  error={fieldErrors.gstin}
                  maxLength={15}
                />

                <InputField
                  label="Company Registration / CIN"
                  placeholder="e.g. U74899DL2020PTC123456"
                  value={values.cin}
                  onChange={set('cin')}
                  error={fieldErrors.cin}
                />

                <InputField
                  label="Website"
                  placeholder="e.g. https://www.example.com"
                  value={values.website}
                  onChange={set('website')}
                  error={fieldErrors.website}
                />
              </div>
            </div>

            {/* SECTION 2 — Contact Details */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-line/60 pb-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">
                  2
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Section 2 — Contact Details
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <InputField
                    label="Contact Person"
                    placeholder="Primary point of contact / Representative"
                    value={values.contact_person}
                    onChange={set('contact_person')}
                    error={fieldErrors.contact_person}
                  />
                </div>

                <InputField
                  label="Phone Number"
                  placeholder="+91 98765 43210"
                  value={values.phone}
                  onChange={set('phone')}
                  error={fieldErrors.phone}
                />

                <InputField
                  label="Alternate Contact Number"
                  placeholder="+91 98123 45678"
                  value={values.alternate_phone}
                  onChange={set('alternate_phone')}
                  error={fieldErrors.alternate_phone}
                />

                <InputField
                  label="Email"
                  type="email"
                  placeholder="contact@clientdomain.com"
                  value={values.email}
                  onChange={set('email')}
                  error={fieldErrors.email}
                />

                <InputField
                  label="Alternate Email"
                  type="email"
                  placeholder="accounts@clientdomain.com"
                  value={values.alternate_email}
                  onChange={set('alternate_email')}
                  error={fieldErrors.alternate_email}
                />
              </div>
            </div>

            {/* SECTION 3 — Address Details */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-line/60 pb-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">
                  3
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Section 3 — Address Details
                </h3>
              </div>

              <div className="space-y-4">
                <TextAreaField
                  label="Corporate Office Address"
                  rows={2}
                  placeholder="Headquarters / Principal place of business address..."
                  value={values.corporate_address}
                  onChange={set('corporate_address')}
                  error={fieldErrors.corporate_address}
                />

                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="same_as_corporate"
                    checked={values.same_as_corporate}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <label htmlFor="same_as_corporate" className="text-xs font-medium text-ink cursor-pointer select-none">
                    Same as Corporate Office Address
                  </label>
                </div>

                <TextAreaField
                  label="Billing Address"
                  rows={2}
                  placeholder="Address to appear on invoices and payment claims..."
                  value={values.same_as_corporate ? values.corporate_address : values.billing_address}
                  onChange={set('billing_address')}
                  error={fieldErrors.billing_address}
                  disabled={values.same_as_corporate}
                  hint={values.same_as_corporate ? 'Billing address is mirrored from Corporate Office Address' : undefined}
                />
              </div>
            </div>

            {/* SECTION 4 — Compliance / Other */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-line/60 pb-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700 text-xs font-bold">
                  4
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Section 4 — Compliance / Other
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  label="EFY"
                  placeholder="e.g. FY 2025-26"
                  value={values.efy}
                  onChange={set('efy')}
                  error={fieldErrors.efy}
                  hint="Estimated / Applicable Financial Year"
                />

                <InputField
                  label="Adherence"
                  placeholder="e.g. ISO 9001 / Strict Quality / Standard"
                  value={values.adherence}
                  onChange={set('adherence')}
                  error={fieldErrors.adherence}
                  hint="Quality / safety standards adherence"
                />

                <div className="sm:col-span-2">
                  <TextAreaField
                    label="Client Notes / Remarks"
                    rows={2}
                    placeholder="Project preferences, billing cycles, special handling instructions..."
                    value={values.notes}
                    onChange={set('notes')}
                    error={fieldErrors.notes}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-line bg-canvas px-6 py-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving Client...' : isEdit ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
