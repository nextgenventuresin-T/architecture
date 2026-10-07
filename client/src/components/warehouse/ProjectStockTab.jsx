import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin } from 'lucide-react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import useAsync from '../../hooks/useAsync';
import { warehouseApi } from '../../api/warehouseApi';
import { formatNumber } from '../../utils/format';

/**
 * Stock as the site team sees it: Project -> Site -> Material -> quantity.
 * Projects and sites are the Interface 3 records, joined by the API — nothing
 * is re-declared here.
 */
export default function ProjectStockTab({ lookups }) {
  const [projectId, setProjectId] = useState('all');

  const load = useCallback(
    () => warehouseApi.projectSiteStock({ projectId: projectId !== 'all' ? projectId : undefined }),
    [projectId]
  );

  const { data, isLoading } = useAsync(load, [load]);
  const projects = data?.projects ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <Select
          label="Filter by project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="w-[220px]"
          options={[
            { value: 'all', label: 'All projects' },
            ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
          ]}
        />
        {projectId !== 'all' && (
          <Button variant="secondary" onClick={() => setProjectId('all')}>Clear filter</Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No project stock yet"
          description="Stock appears here once material is received against a project or site."
        />
      ) : (
        <div className="divide-y divide-line">
          {projects.map((project) => (
            <div key={project.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  to={`/admin/projects/${project.id}`}
                  className="font-display text-[1.02rem] font-semibold text-ink hover:text-brand-700"
                >
                  {project.name}
                </Link>
                <span className="text-sm tabular-nums text-ink-muted">
                  {formatNumber(project.totalQuantity)} units held
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-subtle">{project.code}</p>

              <div className="mt-3 space-y-3">
                {project.sites.map((site) => (
                  <div key={site.id ?? 'unassigned'} className="rounded-xl border border-line bg-canvas/50 px-4 py-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <MapPin className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
                      {site.name}
                    </p>

                    <ul className="mt-2.5 space-y-1.5">
                      {site.materials.map((material) => (
                        <li key={material.id} className="flex items-start justify-between gap-3 text-sm">
                          <span className="min-w-0 text-ink-muted">
                            {material.name}
                            <span className="ml-1.5 text-xs text-ink-subtle">{material.code}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-ink">
                            {formatNumber(material.quantity)}{' '}
                            <span className="text-xs text-ink-subtle">{material.unit}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
