import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Select from '../ui/Select';
import { projectsApi } from '../../api/projectsApi';
import { employeesApi } from '../../api/employeesApi';
import { EMPLOYEE_STATUSES, EMPLOYEE_TYPES } from '../../utils/employeeOptions';

/**
 * Search plus status / type / designation / project / site filters.
 * The site list is loaded from the chosen project, so it can only ever offer
 * sites that actually belong to it.
 */
export default function EmployeeFilters({ filters, onChange }) {
  const [designations, setDesignations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);

  useEffect(() => {
    let active = true;
    employeesApi
      .lookups()
      .then((data) => {
        if (!active) return;
        setDesignations(data.designations ?? []);
        setProjects(data.projects ?? []);
      })
      .catch(() => {
        // Filters are an enhancement — a lookup failure must not break the list.
        if (active) {
          setDesignations([]);
          setProjects([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
  const setProject = (event) =>
    onChange({ ...filters, projectId: event.target.value, siteId: 'all', page: 1 });

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
          placeholder="Search name, employee ID, phone…"
          aria-label="Search employees"
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
      </div>

      <Select
        label="Filter by status"
        value={filters.status}
        onChange={set('status')}
        className="w-[145px]"
        options={[{ value: 'all', label: 'All statuses' }, ...EMPLOYEE_STATUSES]}
      />

      <Select
        label="Filter by designation"
        value={filters.designation}
        onChange={set('designation')}
        className="w-[170px]"
        options={[
          { value: 'all', label: 'All designations' },
          ...designations.map((d) => ({ value: d, label: d })),
        ]}
      />

      <Select
        label="Filter by employee type"
        value={filters.type}
        onChange={set('type')}
        className="w-[150px]"
        options={[{ value: 'all', label: 'All types' }, ...EMPLOYEE_TYPES]}
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
    </div>
  );
}
