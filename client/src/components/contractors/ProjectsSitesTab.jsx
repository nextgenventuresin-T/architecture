import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, HardHat, FileText, Plus } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import { formatCompactCurrency, formatDate } from '../../utils/format';
import CreatePOModal from './CreatePOModal';

/** Every project and site currently assigned to this contractor, with direct PO generation. */
export default function ProjectsSitesTab({ projects = [], sites = [], contractor, onPoCreated }) {
  const [poProject, setPoProject] = useState(null);
  const [poSite, setPoSite] = useState(null);
  const [isCreatePoOpen, setIsCreatePoOpen] = useState(false);

  function handleOpenCreatePo(projectId, siteId = null) {
    setPoProject(projectId);
    setPoSite(siteId);
    setIsCreatePoOpen(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Assigned projects" description="Projects where this contractor is the project-level contractor." />
        {projects.length === 0 ? (
          <EmptyState icon={Building2} title="Not assigned to any project" description={'Use "Assign" from the contractor list to put this contractor on a project.'} />
        ) : (
          <ul className="divide-y divide-line">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link to={`/admin/projects/${project.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                    {project.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-subtle">{project.code} · {project.location} · due {formatDate(project.expected_completion)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-ink-muted">{formatCompactCurrency(project.estimated_budget)}</span>
                  <div className="w-28"><ProgressBar value={project.progress} status={project.status} showLabel /></div>
                  <StatusBadge status={project.status} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenCreatePo(project.id, null)}
                    className="gap-1.5 text-xs ml-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create PO
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Assigned sites" description="Individual sites this contractor is responsible for." />
        {sites.length === 0 ? (
          <EmptyState icon={HardHat} title="Not assigned to any site" description="Assign this contractor to a specific site from the contractor list." />
        ) : (
          <ul className="divide-y divide-line">
            {sites.map((site) => (
              <li key={site.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link to={`/admin/projects/${site.project_id}/sites/${site.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                    {site.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-subtle">{site.project_code} · {site.project_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-ink-muted">{site.labour_count} labour</span>
                  <div className="w-28"><ProgressBar value={site.progress} status={site.status} showLabel /></div>
                  <StatusBadge status={site.status} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenCreatePo(site.project_id, site.id)}
                    className="gap-1.5 text-xs ml-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create PO
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {contractor && (
        <CreatePOModal
          contractor={contractor}
          initialProjectId={poProject}
          initialSiteId={poSite}
          isOpen={isCreatePoOpen}
          onClose={() => {
            setIsCreatePoOpen(false);
            setPoProject(null);
            setPoSite(null);
          }}
          onSaved={() => {
            if (typeof onPoCreated === 'function') onPoCreated();
          }}
        />
      )}
    </div>
  );
}

