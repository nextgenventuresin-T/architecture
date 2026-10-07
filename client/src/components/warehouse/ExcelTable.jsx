import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';

/**
 * Compact, spreadsheet-style table used by the Warehouse "Table / Excel" view.
 * Columns are shared with the normal DataTable view; each column may carry:
 *   key, header, align            — as in DataTable
 *   render(row) -> node           — cell display (falls back to value)
 *   value(row)  -> string|number  — used for search + sorting
 *   sortable (default true when a value() is present)
 *
 * Search and sort run client-side over the rows already fetched, which is what
 * makes it feel like a spreadsheet without another round-trip.
 */
export default function ExcelTable({ columns, rows, initialSort = null, searchPlaceholder = 'Search…' }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort); // { key, dir: 'asc'|'desc' }

  const valueOf = (col, row) => (typeof col.value === 'function' ? col.value(row) : '');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((col) => String(valueOf(col, row) ?? '').toLowerCase().includes(needle))
    );
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || typeof col.value !== 'function') return filtered;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
    });
  }, [filtered, columns, sort]);

  const toggleSort = (col) => {
    if (typeof col.value !== 'function' || col.sortable === false) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return null;
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search table"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
        </div>
        <span className="ml-auto text-xs text-ink-subtle">{sorted.length} rows</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas">
              {columns.map((col) => {
                const canSort = typeof col.value === 'function' && col.sortable !== false;
                const isSorted = sort?.key === col.key;
                const Icon = !isSorted ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={`inline-flex items-center gap-1 hover:text-ink ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
                      >
                        {col.header}
                        <Icon className={`h-3.5 w-3.5 ${isSorted ? 'text-brand-600' : 'text-ink-subtle/60'}`} aria-hidden="true" />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-ink-subtle">
                  No rows to show.
                </td>
              </tr>
            ) : (
              sorted.map((row, idx) => (
                <tr key={row.id ?? idx} className="border-b border-line/70 last:border-0 hover:bg-canvas/60">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-3 py-2 align-middle ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                    >
                      {typeof col.render === 'function' ? col.render(row) : valueOf(col, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
