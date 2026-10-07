import { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import { vendorApi } from '../../../api/vendorApi';

export default function VendorFormModal({ isOpen, onClose, onSaved, vendor = null }) {
  const isEdit = Boolean(vendor?.id);

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [address, setAddress] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (vendor) {
      setName(vendor.name || '');
      setContactPerson(vendor.contact_person || vendor.contactPerson || '');
      setPhone(vendor.phone || '');
      setEmail(vendor.email || '');
      setGstNumber(vendor.gst_number || vendor.gstNumber || '');
      setPanNumber(vendor.pan_number || vendor.panNumber || '');
      setAddress(vendor.address || '');
      setBillingAddress(vendor.billing_address || vendor.billingAddress || '');
      setBankName(vendor.bank_name || vendor.bankName || '');
      setBankAccountNumber(vendor.bank_account_number || vendor.bankAccountNumber || '');
      setBankIfsc(vendor.bank_ifsc || vendor.bankIfsc || '');
      setStatus(vendor.status || 'active');
      setNotes(vendor.notes || '');
    } else {
      setName('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setGstNumber('');
      setPanNumber('');
      setAddress('');
      setBillingAddress('');
      setBankName('');
      setBankAccountNumber('');
      setBankIfsc('');
      setStatus('active');
      setNotes('');
    }
    setError(null);
  }, [vendor, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError({ message: 'Vendor name is required.' });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      contact_person: contactPerson.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      gst_number: gstNumber.trim() || null,
      pan_number: panNumber.trim() || null,
      address: address.trim() || null,
      billing_address: billingAddress.trim() || null,
      bank_name: bankName.trim() || null,
      bank_account_number: bankAccountNumber.trim() || null,
      bank_ifsc: bankIfsc.trim() || null,
      status,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit) {
        await vendorApi.update(vendor.id, payload);
      } else {
        await vendorApi.create(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Vendor: ${vendor?.name}` : 'Add New Vendor'}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error.message || 'Failed to save vendor details.'}</Alert>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Company / Vendor Name */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-ink mb-1">Vendor / Company Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. UltraTech Cement Corp Ltd"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Contact Person */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Contact Person</label>
            <input
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Rakesh Sharma"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Phone / Mobile</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sales@ultratech.example.com"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Tax Information Header */}
          <div className="sm:col-span-2 pt-2 border-t border-line/60">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">
              Tax & Compliance Identifiers
            </h4>
          </div>

          {/* GST */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">GST Number</label>
            <input
              type="text"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              placeholder="03AABCA1234F1Z5"
              maxLength={15}
              className="w-full font-mono rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none uppercase"
            />
          </div>

          {/* PAN */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">PAN Number</label>
            <input
              type="text"
              value={panNumber}
              onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
              placeholder="AABCA1234F"
              maxLength={10}
              className="w-full font-mono rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none uppercase"
            />
          </div>

          {/* Banking Details Header */}
          <div className="sm:col-span-2 pt-2 border-t border-line/60">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">
              Bank Payment Details
            </h4>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Bank Name</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="HDFC Bank / SBI"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Account Number</label>
            <input
              type="text"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              placeholder="50200012345678"
              className="w-full font-mono rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Bank IFSC Code</label>
            <input
              type="text"
              value={bankIfsc}
              onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
              className="w-full font-mono rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none uppercase"
            />
          </div>

          {/* Addresses */}
          <div className="sm:col-span-2 pt-2 border-t border-line/60">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">
              Office & Billing Addresses
            </h4>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Dispatch / Factory Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Factory or dispatch yard address..."
              className="w-full rounded-lg border border-line bg-white p-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Registered Billing Address</label>
            <textarea
              rows={2}
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              placeholder="Official registered billing address..."
              className="w-full rounded-lg border border-line bg-white p-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-ink mb-1">Notes / Remarks</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Primary supplier for Central Warehouse grade 53 cement..."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEdit ? 'Update Vendor' : 'Add Vendor'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
