import { Search } from 'lucide-react';
import Select from '../ui/Select';
import {
  APPROVAL_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  MODULE_LABELS,
} from '../../utils/approvalOptions';

/**
 * Search plus module / status / project / site / priority / date filters.
 *
 * The module, project and site lists come from `/approvals/lookups`, which is
 * already scoped to the signed-in user — an HR user is only offered "HR &
 * Labour", so the filter bar can never suggest a queue they cannot open.
 *
 * Sites are filtered client-side from the lookup rather than re-fetched per
 * project: the lookup already returns only the sites that appear in this
 * user's queue, which is a much smaller list than every site on a project.
 */
export default function ApprovalFilters({ filters, onChange, modules = [], projects = [], sites = [] }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value, page: 1 });

  /** Changing project clears any site chosen under the previous project. */
  const setProject = (event) =>
    onChange({ ...filters, projectId: event.target.value, siteId: 'all', page: 1 });

  const visibleSites =
    filters.projectId === 'all'
      ? sites
      : sites.filter((site) => String(site.projectId) === String(filters.projectId));

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
          placeholder="Search reference, request, requester…"
          aria-label="Search approvals"
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
      </div>

      {/* Only worth showing when the user can actually see more than one. */}
      {modules.length > 1 && (
        <Select
          label="Filter by module"
          value={filters.module}
          onChange={set('module')}
          className="w-[170px]"
          options={[
            { value: 'all', label: 'All modules' },
            ...modules.map((m) => ({ value: m.key, label: m.label ?? MODULE_LABELS[m.key] ?? m.key })),
          ]}
        />
      )}

      <Select
        label="Filter by status"
        value={filters.status}
        onChange={set('status')}
        className="w-[160px]"
        options={[{ value: 'all', label: 'All statuses' }, ...APPROVAL_STATUS_OPTIONS]}
      />

      <Select
        label="Filter by project"
        value={filters.projectId}
        onChange={setProject}
        className="w-[190px]"
        options={[
          { value: 'all', label: 'All projects' },
          ...projects.map((p) => ({ value: String(p.id), label: p.name })),
        ]}
      />

      <Select
        label="Filter by site"
        value={filters.siteId}
        onChange={set('siteId')}
        className="w-[165px]"
        options={[
          { value: 'all', label: filters.projectId === 'all' ? 'All sites' : 'All sites in project' },
          ...visibleSites.map((s) => ({ value: String(s.id), label: s.name })),
        ]}
      />

      <Select
        label="Filter by priority"
        value={filters.priority}
        onChange={set('priority')}
        className="w-[150px]"
        options={[{ value: 'all', label: 'All priorities' }, ...PRIORITY_OPTIONS]}
      />

      <div className="flex items-center gap-1.5">
        <label htmlFor="approvals-date-from" className="sr-only">
          Requested from
        </label>
        <input
          id="approvals-date-from"
          type="date"
          value={filters.dateFrom}
          onChange={set('dateFrom')}
          aria-label="Requested from"
          className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
        <span className="text-xs text-ink-subtle">to</span>
        <label htmlFor="approvals-date-to" className="sr-only">
          Requested to
        </label>
        <input
          id="approvals-date-to"
          type="date"
          value={filters.dateTo}
          onChange={set('dateTo')}
          aria-label="Requested to"
          className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
      </div>
    </div>
  );
}
