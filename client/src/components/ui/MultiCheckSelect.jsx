import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/**
 * A dropdown where several options can be ticked, with an "All" choice on top.
 * `value` is an array of selected option values ([] = All).
 *
 *   <MultiCheckSelect label="Tasks" allLabel="All tasks" options={[{ value, label }]}
 *     value={ids} onChange={setIds} />
 */
export default function MultiCheckSelect({
  label, allLabel = 'All', options = [], value = [], onChange, className = '', placeholder, disabled = false, noun = 'selected',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const selected = useMemo(() => new Set((value || []).map(String)), [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = options.filter((o) => words.every((w) => String(o.label).toLowerCase().includes(w)));
  const toggle = (v) => {
    const key = String(v);
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange([...next]);
  };
  const summary = selected.size === 0
    ? (placeholder || allLabel)
    : selected.size === 1
      ? (options.find((o) => selected.has(String(o.value)))?.label || `1 ${noun}`)
      : `${selected.size} ${noun}`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-left text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none disabled:bg-canvas-subtle"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-72 max-w-[90vw] rounded-lg border border-line bg-white shadow-lg">
          {options.length > 8 && (
            <div className="relative border-b border-line p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded-md border border-line pl-7 pr-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          )}
          <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1 text-sm">
            <li>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 font-medium hover:bg-canvas">
                <input type="checkbox" checked={selected.size === 0} onChange={() => onChange([])} />
                {allLabel}
              </label>
            </li>
            {shown.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-canvas">
                  <input type="checkbox" checked={selected.has(String(o.value))} onChange={() => toggle(o.value)} />
                  <span className="min-w-0 truncate">{o.label}</span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-3 py-2 text-xs text-ink-subtle">Nothing matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
