import { Search } from 'lucide-react';
import Select from '../ui/Select';
import { PROJECT_STATUSES } from '../../utils/projectOptions';

/** Search plus status/contractor/client filters for the project list. */
export default function ProjectFilters({ filters, onChange, lookups }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value, page: 1 });

  const contractorOptions = [
    { value: 'all', label: 'All contractors' },
    ...(lookups?.contractors ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const clientOptions = [
    { value: 'all', label: 'All clients' },
    ...(lookups?.clients ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
        <input
          type="search"
          value={filters.search}
          onChange={set('search')}
          placeholder="Search projects, clients, locations…"
          aria-label="Search projects"
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
      </div>
      <Select label="Filter by status" value={filters.status} onChange={set('status')} className="w-[150px]"
        options={[{ value: 'all', label: 'All statuses' }, ...PROJECT_STATUSES]} />
      <Select label="Filter by contractor" value={filters.contractorId} onChange={set('contractorId')} className="w-[165px]" options={contractorOptions} />
      <Select label="Filter by client" value={filters.clientId} onChange={set('clientId')} className="w-[155px]" options={clientOptions} />
    </div>
  );
}
