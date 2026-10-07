import { useState, useRef } from 'react';
import { FileText, Download, Trash2, UploadCloud, Eye, AlertCircle, File, Image, FileCode } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Alert from '../ui/Alert';
import { formatDate } from '../../utils/format';
import { projectsApi } from '../../api/projectsApi';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(type = '', name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext) || type.includes('image')) {
    return <Image className="h-4 w-4 text-emerald-600" />;
  }
  if (['dwg', 'dxf', 'cad'].includes(ext)) {
    return <FileCode className="h-4 w-4 text-purple-600" />;
  }
  if (ext === 'pdf' || type.includes('pdf')) {
    return <FileText className="h-4 w-4 text-rose-600" />;
  }
  return <File className="h-4 w-4 text-brand-600" />;
}

export default function DocumentsTab({ detail, onChanged }) {
  const { documents = [], project } = detail;
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [docType, setDocType] = useState('drawing');

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    const validFiles = [];
    let err = null;

    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        err = `File "${f.name}" exceeds the 25MB limit.`;
        break;
      }
      validFiles.push(f);
    }

    if (err) {
      setUploadError(err);
    } else {
      setUploadError(null);
      setSelectedFiles(validFiles);
    }
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('documents', file);
      });
      formData.append('document_type', docType);

      await projectsApi.uploadDocuments(project.id, formData);
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setUploadError(err.message || 'Failed to upload documents.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Are you sure you want to delete document "${doc.name || doc.fileName}"?`)) return;
    try {
      await projectsApi.deleteDocument(project.id, doc.id);
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
          title="Upload Project & Site Documents"
          description="Supports PDF, CAD/DWG, Images, Office Docs up to 25MB each"
        />
        <CardBody className="pt-0 space-y-4">
          {uploadError && <Alert tone="error">{uploadError}</Alert>}

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs font-medium text-ink mb-1.5">Select Files</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                onChange={handleFileSelect}
                className="block w-full text-xs text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
              />
            </div>

            <div className="w-48">
              <label className="block text-xs font-medium text-ink mb-1.5">Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
              >
                <option value="drawing">Architectural Drawing</option>
                <option value="permit">Government Permit</option>
                <option value="contract">Contract Agreement</option>
                <option value="specification">Technical Specification</option>
                <option value="site_report">Site Report</option>
                <option value="other">Other Document</option>
              </select>
            </div>

            <Button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || uploading}
            >
              <UploadCloud className="h-4 w-4" />
              {uploading ? 'Uploading...' : `Upload (${selectedFiles.length})`}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Documents List */}
      <Card>
        <CardHeader
          title="Document Register"
          description={`${documents.length} recorded document${documents.length === 1 ? '' : 's'}`}
        />
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents attached"
            description="Drawings, structural CAD plans, permits, and specifications uploaded to this project will be listed here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-canvas/60 text-ink-subtle">
                <tr>
                  <th className="px-5 py-3 font-medium">Document Name / File</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Uploaded Date</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {documents.map((doc) => {
                  const downloadHref = doc.downloadUrl || doc.file_path || `/api/projects/${project.id}/documents/${doc.id}/download`;

                  return (
                    <tr key={doc.id} className="hover:bg-canvas/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line">
                            {getFileIcon(doc.fileType || doc.file_type, doc.fileName || doc.file_name || doc.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-ink truncate max-w-md">{doc.name}</p>
                            {(doc.fileName || doc.file_name) && (
                              <p className="text-[11px] text-ink-subtle truncate max-w-md">
                                {doc.fileName || doc.file_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone="neutral">
                          {doc.documentType || doc.document_type || 'Document'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-ink-muted">
                        {formatFileSize(doc.fileSize || doc.file_size)}
                      </td>
                      <td className="px-5 py-3 text-ink-subtle">
                        {formatDate(doc.uploadedOn || doc.uploaded_on || doc.createdAt || doc.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={downloadHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-[11px] font-medium text-ink-muted hover:bg-canvas hover:text-ink transition-colors"
                            title="Download or View document"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDelete(doc)}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-[11px] font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors"
                            title="Delete document"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
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
      </Card>
    </div>
  );
}
