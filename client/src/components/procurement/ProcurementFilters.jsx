import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Select from '../ui/Select';
import { projectsApi } from '../../api/projectsApi';
import { tasksApi } from '../../api/tasksApi';
import MultiCheckSelect from '../ui/MultiCheckSelect';
import { PROCUREMENT_STATUS_OPTIONS, PRIORITIES } from '../../utils/procurementOptions';

/**
 * Search plus status / priority / project / site / supplier filters. The
 * site list is loaded from whichever project is chosen, the same dependent
 * pattern MaterialFilters uses.
 */
export default function ProcurementFilters({ filters, onChange, projects = [], suppliers = [] }) {
  const [sites, setSites] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Tasks of the chosen project / site (all tasks when no project is chosen).
  useEffect(() => {
    let active = true;
    const params = {};
    if (filters.projectId && filters.projectId !== 'all') params.projectId = filters.projectId;
    if (filters.siteId && filters.siteId !== 'all') params.siteId = filters.siteId;
    tasksApi.list(params)
      .then((list) => active && setTasks(list ?? []))
      .catch(() => active && setTasks([]));
    return () => { active = false; };
  }, [filters.projectId, filters.siteId]);

  useEffect(() => {
    if (!filters.projectId || filters.projectId === 'all') {
      setSites([]);
      return undefined;
    }
    let active = true;
    projectsApi
      .detail(filters.projectId)
      .then((data) => active && setSites(data.sites ?? []))
      .catch(() => active && setSites([]));
    return () => {
      active = false;
    };
  }, [filters.projectId]);

  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value, page: 1 });

  /** Changing project clears any site chosen under the previous project. */
  const setProject = (event) => onChange({ ...filters, projectId: event.target.value, siteId: 'all', taskIds: [], page: 1 });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          value={filters.search}
          onChange={set('search')}
          placeholder="Search request #, PO #, material, supplier…"
          aria-label="Search procurement requests"
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
      </div>

      <Select
        label="Filter by status"
        value={filters.status}
        onChange={set('status')}
        className="w-[175px]"
        options={[{ value: 'all', label: 'All statuses' }, ...PROCUREMENT_STATUS_OPTIONS]}
      />

      <Select
        label="Filter by priority"
        value={filters.priority}
        onChange={set('priority')}
        className="w-[150px]"
        options={[{ value: 'all', label: 'All priorities' }, ...PRIORITIES]}
      />

      <Select
        label="Filter by project"
        value={filters.projectId}
        onChange={setProject}
        className="w-[190px]"
        options={[
          { value: 'all', label: 'All projects' },
          ...projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
        ]}
      />

      <Select
        label="Filter by site"
        value={filters.siteId}
        onChange={set('siteId')}
        className="w-[165px]"
        options={[
          { value: 'all', label: filters.projectId === 'all' ? 'All sites' : 'All sites in project' },
          ...sites.map((s) => ({ value: String(s.id), label: s.name })),
        ]}
      />

      <MultiCheckSelect
        label="Filter by tasks"
        allLabel="All tasks"
        noun="tasks"
        className="w-[190px]"
        value={filters.taskIds || []}
        onChange={(taskIds) => onChange({ ...filters, taskIds, page: 1 })}
        options={tasks.map((t) => ({
          value: String(t.id),
          label: filters.projectId && filters.projectId !== 'all'
            ? `${t.name}${t.siteName ? ` · ${t.siteName}` : ''}`
            : `${t.name}${t.projectName ? ` · ${t.projectName}` : ''}`,
        }))}
      />

      <Select
        label="Filter by supplier"
        value={filters.supplier}
        onChange={set('supplier')}
        className="w-[175px]"
        options={[
          { value: 'all', label: 'All suppliers' },
          ...suppliers.map((s) => ({ value: s, label: s })),
        ]}
      />
    </div>
  );
}
