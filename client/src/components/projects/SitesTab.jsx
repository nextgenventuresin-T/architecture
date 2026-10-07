import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRight, ShieldCheck, Users, AlertTriangle, Plus, Trash2, Building, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge, { StatusBadge } from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import TextField from '../ui/TextField';
import Select from '../ui/Select';
import Alert from '../ui/Alert';
import { projectsApi, sitesApi } from '../../api/projectsApi';
import { SAFETY_TONE, labelFor } from '../../utils/projectOptions';

const SAFETY_LABEL = { safe: 'Safe', caution: 'Caution', incident: 'Incident' };

/** Sites belonging to a project, each linking into its own detail screen. */
export default function SitesTab({ detail, projectId, lookups, onChanged }) {
  const { sites = [], project = {} } = detail || {};

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(null); // site id being deleted
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Add Site Form state
  const [formData, setFormData] = useState({
    name: '',
    address: project?.location || '',
    site_engineer_id: project?.site_engineer_id || '',
    contractor_id: project?.contractor_id || '',
    labour_count: 0,
    progress: 0,
    safety_status: 'safe',
    status: 'on-track',
  });

  const engineers = lookups?.engineers || lookups?.employees || [];
  const contractors = lookups?.contractors || [];

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      address: project?.location || '',
      site_engineer_id: project?.site_engineer_id || '',
      contractor_id: project?.contractor_id || '',
      labour_count: 0,
      progress: 0,
      safety_status: 'safe',
      status: 'on-track',
    });
    setError(null);
    setIsAddOpen(true);
  };

  const handleQuickAddDefault = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await projectsApi.addSite(projectId, {
        name: `${project.name || 'Project'} - Site 1`,
        address: project.location || 'Main Project Site',
        site_engineer_id: project.site_engineer_id || undefined,
        contractor_id: project.contractor_id || undefined,
        labour_count: 10,
        progress: 0,
        safety_status: 'safe',
        status: 'on-track',
      });
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create default site');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSite = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Please enter a site name.');
      return;
    }
    if (!formData.address.trim()) {
      setError('Please enter a site address.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await projectsApi.addSite(projectId, {
        ...formData,
        site_engineer_id: formData.site_engineer_id ? Number(formData.site_engineer_id) : undefined,
        contractor_id: formData.contractor_id ? Number(formData.contractor_id) : undefined,
        labour_count: Number(formData.labour_count || 0),
        progress: Number(formData.progress || 0),
      });
      setIsAddOpen(false);
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create site');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSite = async (siteId) => {
    if (!window.confirm('Are you sure you want to remove this site? Associated activities will also be affected.')) {
      return;
    }
    try {
      setIsDeleting(siteId);
      await sitesApi.remove(siteId);
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to delete site');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      <Card>
        <CardHeader
          title="Sites"
          description={`${sites.length} site${sites.length === 1 ? '' : 's'} registered under this project`}
          action={
            <Button size="sm" onClick={handleOpenAdd} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Site
            </Button>
          }
        />

        {sites.length === 0 ? (
          <CardBody className="py-8">
            <EmptyState
              icon={MapPin}
              title="No sites on this project yet"
              description="Add a site to start recording daily activity, tracking labour attendance, and allocating warehouse materials."
            />
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button onClick={handleOpenAdd} className="gap-2">
                <Plus className="h-4 w-4" />
                Add New Site
              </Button>
              <Button variant="secondary" onClick={handleQuickAddDefault} disabled={submitting} className="gap-2">
                <Sparkles className="h-4 w-4 text-brand-600" />
                {submitting ? 'Creating Site 1…' : 'Quick Add "Site 1"'}
              </Button>
            </div>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {sites.map((site) => (
              <li key={site.id} className="px-5 py-4 transition-colors hover:bg-canvas/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/admin/projects/${projectId}/sites/${site.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline flex items-center gap-2">
                      <Building className="h-4 w-4 text-brand-600" />
                      {site.name}
                    </Link>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
                      {site.address || 'Project Location'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusBadge status={site.status} />
                    <Badge tone={SAFETY_TONE[site.safety_status] ?? 'neutral'}>
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      {labelFor(SAFETY_LABEL, site.safety_status)}
                    </Badge>
                  </div>
                </div>

                <ProgressBar value={site.progress} status={site.status} showLabel className="mt-3" />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    {site.labour_count || 0} workers
                  </Badge>
                  <Badge tone="neutral">{site.today_attendance || 0} present today</Badge>
                  {site.open_issues > 0 && (
                    <Badge tone="warning">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {site.open_issues} open issue{site.open_issues === 1 ? '' : 's'}
                    </Badge>
                  )}
                  <span className="text-xs text-ink-subtle">
                    {site.site_engineer_name ? `Eng: ${site.site_engineer_name}` : 'No engineer'} · {site.contractor_name ? `Contractor: ${site.contractor_name}` : 'No contractor'}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteSite(site.id)}
                      disabled={isDeleting === site.id}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white px-2 text-xs font-medium text-ink-subtle transition-colors hover:border-danger hover:text-danger"
                      title="Delete site"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <Link
                      to={`/admin/projects/${projectId}/sites/${site.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
                    >
                      Open site
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Add Site Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Site"
        description={`Create a site under ${project.name || 'this project'} to organize activities and labour.`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSite} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Site'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSite} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <TextField
            label="Site Name *"
            placeholder="e.g. Tower A, Sector 4 Block, Main Site"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <TextField
            label="Site Address / Location *"
            placeholder="e.g. Plot 12, Phase 1, Zirakpur"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Site Engineer"
              value={formData.site_engineer_id}
              onChange={(e) => setFormData({ ...formData, site_engineer_id: e.target.value })}
              options={[
                { value: '', label: 'Select Site Engineer…' },
                ...engineers.map((eng) => ({
                  value: eng.id,
                  label: eng.full_name || eng.name,
                })),
              ]}
            />

            <Select
              label="Assigned Contractor"
              value={formData.contractor_id}
              onChange={(e) => setFormData({ ...formData, contractor_id: e.target.value })}
              options={[
                { value: '', label: 'Select Contractor…' },
                ...contractors.map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              label="Labour Allocated"
              type="number"
              min="0"
              value={formData.labour_count}
              onChange={(e) => setFormData({ ...formData, labour_count: e.target.value })}
            />

            <Select
              label="Safety Status"
              value={formData.safety_status}
              onChange={(e) => setFormData({ ...formData, safety_status: e.target.value })}
              options={[
                { value: 'safe', label: 'Safe' },
                { value: 'caution', label: 'Caution' },
                { value: 'incident', label: 'Incident' },
              ]}
            />

            <Select
              label="Site Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'on-track', label: 'On Track' },
                { value: 'attention', label: 'Needs Attention' },
                { value: 'delayed', label: 'Delayed' },
                { value: 'on-hold', label: 'On Hold' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
