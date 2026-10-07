import { Search } from 'lucide-react';
import Select from '../ui/Select';
import { MATERIAL_STATUSES } from '../../utils/materialOptions';

/**
 * Material MASTER filters: search plus category and status. Stock-level,
 * project and site filters were removed — actual stock lives in Warehouse,
 * which is the single source of truth, not the material master.
 */
export default function MaterialFilters({ filters, onChange, categories = [] }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value, page: 1 });

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
          placeholder="Search name, code…"
          aria-label="Search materials"
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
      </div>

      <Select
        label="Filter by category"
        value={filters.category}
        onChange={set('category')}
        className="w-[175px]"
        options={[
          { value: 'all', label: 'All categories' },
          ...categories.map((c) => ({ value: c, label: c })),
        ]}
      />

      <Select
        label="Filter by status"
        value={filters.status}
        onChange={set('status')}
        className="w-[150px]"
        options={[{ value: 'all', label: 'All statuses' }, ...MATERIAL_STATUSES]}
      />
    </div>
  );
}
