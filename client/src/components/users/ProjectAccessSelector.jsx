import { useEffect, useState } from 'react';
import { Check, FolderTree } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Skeleton from '../ui/Skeleton';
import { usersApi } from '../../api/usersApi';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';

/**
 * Project and site scope for one user.
 *
 * Granting nothing means unrestricted — the same rule the API applies, stated
 * plainly on screen so an admin is never guessing what an empty list does.
 * Sites are nested under their project and only offered once that project is
 * granted, matching the backend rule that a site cannot be reachable when its
 * project is not.
 */
export default function ProjectAccessSelector({ userId, projects, onSaved }) {
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [selectedSites, setSelectedSites] = useState(new Set());
  const [sitesByProject, setSitesByProject] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    usersApi
      .access(userId)
      .then((data) => {
        if (!active) return;
        setSelectedProjects(new Set(data.projects.map((p) => p.id)));
        setSelectedSites(new Set(data.sites.map((s) => s.id)));
      })
      .catch((caught) => active && setError(toApiError(caught)))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [userId]);

  // Sites are fetched per granted project, so the list only ever offers sites
  // the user could actually reach.
  useEffect(() => {
    const missing = [...selectedProjects].filter((id) => !sitesByProject[id]);
    if (missing.length === 0) return;
    let active = true;
    Promise.all(
      missing.map((id) =>
        projectsApi.detail(id).then((data) => [id, data.sites ?? []]).catch(() => [id, []])
      )
    ).then((entries) => {
      if (!active) return;
      setSitesByProject((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [selectedProjects, sitesByProject]);

  function toggleProject(id) {
    setSelectedProjects((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        // Dropping a project must drop its sites too, or they would be granted
        // inside a project the user can no longer open.
        setSelectedSites((sites) => {
          const kept = new Set(sites);
          (sitesByProject[id] ?? []).forEach((s) => kept.delete(s.id));
          return kept;
        });
      } else {
        next.add(id);
      }
      return next;
    });
    setDirty(true);
  }

  function toggleSite(id) {
    setSelectedSites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      // Projects first: the API rejects a site whose project is not yet granted.
      await usersApi.setProjectAccess(userId, [...selectedProjects]);
      await usersApi.setSiteAccess(userId, [...selectedSites]);
      setDirty(false);
      onSaved?.('Project and site access updated.');
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <Skeleton className="h-64" />;

  const box = (on) =>
    `inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-transparent'
    }`;

  return (
    <div>
      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      <Alert tone="info" className="mb-4">
        {selectedProjects.size === 0
          ? 'No projects selected — this user can currently reach every project and site. Select projects to restrict them.'
          : `Restricted to ${selectedProjects.size} project${selectedProjects.size === 1 ? '' : 's'}. Any other project is hidden from the API, not just the screen.`}
      </Alert>

      {projects.length === 0 ? (
        <p className="text-sm text-ink-muted">No projects exist yet.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => {
            const on = selectedProjects.has(project.id);
            const sites = sitesByProject[project.id] ?? [];
            return (
              <li key={project.id} className="rounded-xl border border-line bg-white px-4 py-3">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <span className={box(on)}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleProject(project.id)}
                    className="sr-only"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{project.name}</span>
                    <span className="block text-xs text-ink-subtle">{project.code}</span>
                  </span>
                </label>

                {on && (
                  <div className="mt-3 border-t border-line pt-3 pl-7">
                    <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-subtle">
                      <FolderTree className="h-3.5 w-3.5" aria-hidden="true" />
                      Sites
                    </p>
                    {sites.length === 0 ? (
                      <p className="text-xs text-ink-subtle">This project has no sites.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {sites.map((site) => {
                          const siteOn = selectedSites.has(site.id);
                          return (
                            <li key={site.id}>
                              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                                <span className={box(siteOn)}>
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                                <input
                                  type="checkbox"
                                  checked={siteOn}
                                  onChange={() => toggleSite(site.id)}
                                  className="sr-only"
                                />
                                <span className="text-ink-muted">{site.name}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
        {dirty && <span className="mr-auto text-sm text-ink-muted">You have unsaved access changes.</span>}
        <Button onClick={save} disabled={!dirty} isLoading={isSaving} loadingText="Saving…">
          Save access
        </Button>
      </div>
    </div>
  );
}
