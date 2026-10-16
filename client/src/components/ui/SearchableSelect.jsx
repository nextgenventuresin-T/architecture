import {
  Children, Fragment, forwardRef, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

/**
 * Drop-in replacement for a native <select> that can be searched by typing.
 *
 * It takes exactly what a <select> takes - value / defaultValue / onChange /
 * name / required / disabled / className and <option> / <optgroup> children -
 * so every existing form keeps working unchanged. onChange receives an
 * event-like object whose `target.value` / `target.name` match the native ones.
 *
 * Typing filters the list by partial words in any order: "gr flo kit" matches
 * "Ground Floor › Kitchen". A visually hidden native <select> is kept in sync so
 * `required` validation and plain form submission still behave natively.
 */

const textOf = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(node.props.children);
  return '';
};

/** Flattens <option>, <optgroup>, fragments and arrays into a flat option list. */
function collectOptions(children, group = null, out = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      collectOptions(child.props.children, group, out);
    } else if (child.type === 'optgroup') {
      collectOptions(child.props.children, child.props.label ?? group, out);
    } else if (child.type === 'option') {
      const label = textOf(child.props.children).trim();
      const value = child.props.value !== undefined && child.props.value !== null ? String(child.props.value) : label;
      out.push({ value, label, disabled: Boolean(child.props.disabled), group });
    }
  });
  return out;
}

const normalise = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

function matches(option, words) {
  if (!words.length) return true;
  const hay = normalise(`${option.label} ${option.group || ''}`);
  return words.every((w) => hay.includes(w));
}

/** Bolds the parts of `label` that match the typed words. */
function Highlight({ label, words }) {
  if (!words.length) return label;
  const lower = normalise(label);
  const marks = new Array(label.length).fill(false);
  for (const w of words) {
    let from = 0;
    while (w && (from = lower.indexOf(w, from)) !== -1) {
      for (let i = from; i < from + w.length && i < marks.length; i += 1) marks[i] = true;
      from += w.length;
    }
  }
  const parts = [];
  let i = 0;
  while (i < label.length) {
    const on = marks[i];
    let j = i;
    while (j < label.length && marks[j] === on) j += 1;
    parts.push(on ? <mark key={i} className="rounded-sm bg-brand-100 font-semibold text-ink">{label.slice(i, j)}</mark> : label.slice(i, j));
    i = j;
  }
  return parts;
}

const POPUP_MAX_HEIGHT = 288;

const SearchableSelect = forwardRef(function SearchableSelect(
  {
    value, defaultValue, onChange, onFocus, onBlur, children, className = '', style, id, name, required, disabled,
    placeholder, 'aria-label': ariaLabel, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy,
    title, multiple, searchPlaceholder = 'Type to search…', ...rest
  },
  ref
) {
  const autoId = useId();
  const triggerId = id || `ss-${autoId}`;
  const listId = `${triggerId}-list`;
  const options = useMemo(() => collectOptions(children), [children]);

  const isControlled = value !== undefined;
  const [inner, setInner] = useState(() => (defaultValue !== undefined ? String(defaultValue) : (options[0]?.value ?? '')));
  const current = isControlled ? (value === null ? '' : String(value)) : inner;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const words = useMemo(() => normalise(query).split(/\s+/).filter(Boolean), [query]);
  const filtered = useMemo(() => options.filter((o) => matches(o, words)), [options, words]);

  // Like a native select: an unmatched value shows the first option.
  const selected = options.find((o) => o.value === current) || (current === '' ? options.find((o) => o.value === '') : null) || options[0];
  const isPlaceholder = !selected || selected.value === '';

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 240), vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const flip = below < Math.min(POPUP_MAX_HEIGHT, 200) && above > below;
    setPos(flip
      ? { left, width, bottom: vh - r.top + 4, maxHeight: Math.min(POPUP_MAX_HEIGHT + 56, above) }
      : { left, width, top: r.bottom + 4, maxHeight: Math.min(POPUP_MAX_HEIGHT + 56, below) });
  }, []);

  const openList = useCallback((seed = '') => {
    if (disabled) return;
    setQuery(seed);
    const idx = Math.max(0, options.findIndex((o) => o.value === current));
    setActive(seed ? 0 : idx);
    place();
    setOpen(true);
  }, [disabled, options, current, place]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  const choose = useCallback((option) => {
    if (!option || option.disabled) return;
    if (!isControlled) setInner(option.value);
    if (option.value !== current && onChange) {
      const target = { value: option.value, name, id: triggerId, type: 'select-one' };
      onChange({ target, currentTarget: target, type: 'change', preventDefault() {}, stopPropagation() {}, persist() {} });
    }
    close();
  }, [isControlled, current, onChange, name, triggerId, close]);

  useLayoutEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popupRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      close(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => { setActive(0); }, [query]);

  const move = (delta) => {
    if (!filtered.length) return;
    let next = active;
    for (let step = 0; step < filtered.length; step += 1) {
      next = (next + delta + filtered.length) % filtered.length;
      if (!filtered[next].disabled) break;
    }
    setActive(next);
  };

  const onTriggerKey = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'F4'].includes(e.key)) {
      e.preventDefault();
      openList();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openList(e.key);
    }
  };

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { close(false); }
  };

  // A native multi-select is rare and has different semantics - keep it native.
  if (multiple) {
    return (
      <select ref={ref} id={id} name={name} value={value} defaultValue={defaultValue} onChange={onChange} multiple
        required={required} disabled={disabled} className={className} style={style} aria-label={ariaLabel} {...rest}>
        {children}
      </select>
    );
  }

  // The visible control keeps the select's own classes, so it looks the same everywhere.
  const tokens = className.split(/\s+/).filter((c) => c && c !== 'block');
  const hasExternalChevron = tokens.includes('appearance-none');
  const hasWidth = tokens.some((c) => /^(w-|min-w-|flex-1|flex-auto|grow)/.test(c));
  const longest = options.reduce((m, o) => Math.max(m, o.label.length), 4);
  const triggerStyle = hasWidth ? style : { minWidth: `${Math.min(longest, 28) + 5}ch`, ...style };

  let lastGroup = null;

  return (
    <>
      <button
        {...rest}
        ref={triggerRef}
        type="button"
        id={triggerId}
        title={title || selected?.label}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`inline-flex items-center gap-2 text-left disabled:cursor-not-allowed ${tokens.join(' ')}`}
        style={triggerStyle}
      >
        <span className={`min-w-0 flex-1 truncate ${isPlaceholder ? 'text-ink-subtle' : ''}`}>
          {selected?.label || placeholder || ' '}
        </span>
        {!hasExternalChevron && <ChevronDown className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />}
      </button>

      {/* Keeps native `required` validation and form submission working. */}
      <select
        ref={ref}
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        required={required}
        disabled={disabled}
        value={current}
        onChange={() => {}}
        onInvalid={() => triggerRef.current?.focus()}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', margin: 0, padding: 0, border: 0 }}
      >
        {options.map((o) => <option key={`${o.group ?? ''}|${o.value}`} value={o.value}>{o.label}</option>)}
      </select>

      {open && pos && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[1000] flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-xl"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              aria-label={`Search ${ariaLabel || 'options'}`}
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              className="h-7 w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
              autoComplete="off"
            />
            {query && <span className="shrink-0 text-xs text-ink-subtle">{filtered.length}</span>}
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-subtle">No matches for “{query}”</li>
            )}
            {filtered.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              const isSel = o.value === selected?.value;
              return (
                <Fragment key={`${o.group ?? ''}|${o.value}|${i}`}>
                  {header && <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{header}</li>}
                  <li
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                      o.disabled ? 'cursor-not-allowed text-ink-subtle opacity-60' : 'text-ink'
                    } ${i === active && !o.disabled ? 'bg-brand-50' : ''}`}
                  >
                    <span className={`min-w-0 flex-1 ${o.value === '' ? 'text-ink-subtle' : ''}`}>
                      <Highlight label={o.label || ' '} words={words} />
                    </span>
                    {isSel && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>,
        document.body
      )}
    </>
  );
});

export default SearchableSelect;
