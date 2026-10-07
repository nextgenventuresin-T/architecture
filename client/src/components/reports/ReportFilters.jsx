import { Search } from 'lucide-react';
import Select from '../ui/Select';
import Button from '../ui/Button';

const dateInputClass =
  'h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none';

/**
 * Renders whichever of date/project/site/contractor/status controls a given
 * report actually supports (`fields`, from reportDefs), wired to the shared
 * `filters` state object the drill-down view owns. Options for project/site/
 * contractor come from `lookups`, loaded once per drill-down session from
 * the Reports API itself so every role sees only what it's already allowed
 * to see (see useReportLookups).
 */
export default function ReportFilters({ fields, values, onChange, onClear, lookups, hideContractor }) {
  const set = (key) => (event) => onChange(key, event.target.value);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
      {fields.map((field) => {
        if (field.type === 'search') {
          return (
            <div key="search" className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              <input
                type="search"
                value={values.search || ''}
                onChange={set('search')}
                placeholder="Search…"
                aria-label="Search"
                className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
              />
            </div>
          );
        }

        if (field.type === 'project') {
          return (
            <Select
              key="projectId"
              label="Filter by project"
              value={values.projectId || 'all'}
              onChange={set('projectId')}
              className="w-[180px]"
              options={[{ value: 'all', label: 'All projects' }, ...(lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))]}
            />
          );
        }

        if (field.type === 'site') {
          return (
            <Select
              key="siteId"
              label="Filter by site"
              value={values.siteId || 'all'}
              onChange={set('siteId')}
              className="w-[170px]"
              options={[{ value: 'all', label: 'All sites' }, ...(lookups.sites ?? []).map((s) => ({ value: String(s.id), label: s.name }))]}
            />
          );
        }

        if (field.type === 'contractor') {
          if (hideContractor || !lookups.contractors) return null;
          return (
            <Select
              key="contractorId"
              label="Filter by contractor"
              value={values.contractorId || 'all'}
              onChange={set('contractorId')}
              className="w-[190px]"
              options={[{ value: 'all', label: 'All contractors' }, ...(lookups.contractors ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
            />
          );
        }

        if (field.type === 'status') {
          return (
            <Select
              key="status"
              label="Filter by status"
              value={values.status || 'all'}
              onChange={set('status')}
              className="w-[170px]"
              options={[{ value: 'all', label: 'All statuses' }, ...field.options]}
            />
          );
        }

        if (field.type === 'select') {
          return (
            <Select
              key={field.key}
              label={field.label}
              value={values[field.key] || 'all'}
              onChange={set(field.key)}
              className="w-[170px]"
              options={[{ value: 'all', label: `All (${field.label.toLowerCase()})` }, ...field.options]}
            />
          );
        }

        if (field.type === 'date') {
          return (
            <div key="date-range" className="flex items-center gap-2">
              <input type="date" value={values.dateFrom || ''} onChange={set('dateFrom')} aria-label="From date" className={dateInputClass} />
              <span className="text-xs text-ink-subtle">to</span>
              <input type="date" value={values.dateTo || ''} onChange={set('dateTo')} aria-label="To date" className={dateInputClass} />
            </div>
          );
        }

        return null;
      })}

      <Button variant="secondary" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
