import { useState, useRef } from 'react';
import { FileText, Download, Trash2, UploadCloud, Eye, Image, FileCode, File, AlertCircle, Plus } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { formatDate } from '../../utils/format';
import { contractorsApi } from '../../api/contractorsApi';

const DOC_TYPES = [
  { value: 'gst', label: 'GST / Tax Document' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'registration', label: 'Registration / Trade License' },
  { value: 'address_proof', label: 'Address Proof' },
  { value: 'company_docs', label: 'Company Documents' },
  { value: 'bank_details', label: 'Bank Details / Cancelled Cheque' },
  { value: 'agreement', label: 'Previous Agreement / Contract' },
  { value: 'other', label: 'Other Supporting Document' },
];

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(fileName = '', mime = '') {
  const ext = fileName.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || mime.includes('image')) {
    return <Image className="h-4 w-4 text-emerald-600" />;
  }
  if (ext === 'pdf' || mime.includes('pdf')) {
    return <FileText className="h-4 w-4 text-rose-600" />;
  }
  return <File className="h-4 w-4 text-brand-600" />;
}

export default function ContractorDocumentsTab({ contractor, documents = [], onChanged }) {
  const fileInputRef = useRef(null);
  const [docType, setDocType] = useState('other');
  const [docTitle, setDocTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    const valid = [];
    let err = null;

    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        err = `File "${f.name}" exceeds the 25MB limit.`;
        break;
      }
      valid.push(f);
    }

    if (err) setError(err);
    else {
      setError(null);
      setSelectedFiles(valid);
      if (valid.length === 1 && !docTitle) {
        setDocTitle(valid[0].name.replace(/\.[^/.]+$/, ''));
      }
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setError('Please select at least one document to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('documents', file));
      formData.append('document_type', docType);
      if (docTitle) formData.append('name', docTitle.trim());

      await contractorsApi.uploadDocuments(contractor.id, formData);
      setSelectedFiles([]);
      setDocTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setError(err.message || 'Failed to upload document(s).');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Are you sure you want to remove document "${doc.name || doc.file_name}"?`)) return;
    try {
      await contractorsApi.deleteDocument(contractor.id, doc.id);
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      alert(err.message || 'Could not delete document.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Box */}
      <Card>
        <CardHeader
          title="Upload Contractor Documents"
          description="Upload tax certificates, registration proofs, bank records, and compliance files. Previous files remain intact."
        />
        <CardBody>
          {error && <Alert tone="error" className="mb-4">{error}</Alert>}

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                  Document Type *
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                  Document Title / Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. GST Certificate 2026 / HDFC Bank Cancelled Cheque"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-canvas/30 px-6 py-8 text-center transition-colors hover:border-brand-400 hover:bg-canvas"
            >
              <UploadCloud className="mb-2 h-9 w-9 text-brand-600" />
              <p className="text-sm font-semibold text-ink">
                Click to browse or drag & drop files here
              </p>
              <p className="mt-1 text-xs text-ink-subtle">
                PDF, PNG, JPG, Word, Excel documents up to 25MB each. Multiple files supported.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Selected files preview */}
            {selectedFiles.length > 0 && (
              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="mb-2 text-xs font-semibold text-ink">Selected files ({selectedFiles.length}):</p>
                <div className="space-y-1.5">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs text-ink-muted bg-white p-2 rounded-lg border border-line">
                      <span className="truncate max-w-sm font-medium">{file.name}</span>
                      <span className="font-mono text-ink-subtle">{formatFileSize(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={isUploading || selectedFiles.length === 0} className="gap-2">
                <UploadCloud className="h-4 w-4" />
                {isUploading ? 'Uploading Files…' : 'Upload Documents'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Uploaded Documents List */}
      <Card>
        <CardHeader
          title="Document Repository"
          description={`Total: ${documents.length} verified documents on file for ${contractor.name}`}
        />
        <CardBody className="p-0">
          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents uploaded yet"
              description="Upload GST, PAN, trade registrations, or bank documents to establish the contractor compliance file."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas-subtle text-xs font-semibold uppercase text-ink-subtle">
                  <tr>
                    <th className="px-5 py-3">Document Title</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">File Name & Size</th>
                    <th className="px-5 py-3">Upload Date</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {documents.map((doc) => {
                    const typeLabel = DOC_TYPES.find((t) => t.value === doc.document_type)?.label || doc.document_type;
                    return (
                      <tr key={doc.id} className="hover:bg-canvas">
                        <td className="px-5 py-3.5 font-medium text-ink flex items-center gap-2.5">
                          {getFileIcon(doc.file_name, doc.file_type)}
                          <span className="font-semibold text-ink">{doc.name || doc.file_name}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-block rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                            {typeLabel}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-ink-muted">
                          <span className="font-mono">{doc.file_name}</span>
                          <span className="ml-2 text-ink-subtle">({formatFileSize(doc.file_size)})</span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-ink-subtle">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <a
                              href={`/api/contractors/${contractor.id}/documents/${doc.id}/download`}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-ink-subtle hover:bg-canvas-subtle hover:text-brand-600 transition-colors"
                              title="Download document"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc)}
                              className="rounded-lg p-1.5 text-ink-subtle hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete document"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
