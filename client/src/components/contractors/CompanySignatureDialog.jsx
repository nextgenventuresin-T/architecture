import { useState } from 'react';
import SignaturePad from '../ui/SignaturePad';
import Alert from '../ui/Alert';
import { contractorPoApi } from '../../api/contractorPoApi';
import useAuth from '../../hooks/useAuth';

export default function CompanySignatureDialog({ po, isOpen, onClose, onSigned }) {
  if (!isOpen || !po) return null;

  const { user } = useAuth();
  const [designation, setDesignation] = useState('Project Director');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSign({ signatureData, signerName }) {
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        signature_data: signatureData,
        signer_name: signerName,
        designation: designation.trim() || 'Project Director',
      };

      const updated = await contractorPoApi.signCompany(po.id, payload);
      if (typeof onSigned === 'function') onSigned(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record company signature.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl">
        {error && <Alert tone="error" className="mb-4">{error}</Alert>}

        <div className="mb-3 rounded-xl border border-line bg-white p-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">
            Company Signatory Designation *
          </label>
          <input
            type="text"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="e.g. Project Director / Vice President - Operations"
            className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
          />
        </div>

        <SignaturePad
          title="Company Executive Signature & Seal"
          description={`Counter-signing Order ${po.poNumber} for ${po.contractor?.name}. This executes the final legally binding contract.`}
          signerName={user?.name || user?.fullName || 'Project Director'}
          submitLabel={isSubmitting ? 'Sealing Contract…' : 'Execute & Seal Contract'}
          onSign={handleSign}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
