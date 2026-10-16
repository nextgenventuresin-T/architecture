import { useId } from 'react';

/**
 * Type-in area field. Suggests the project's existing areas as you type; a new name
 * is created on save ("Ground Floor > Kitchen" still nests a room inside a floor).
 * The value is the typed text - send it to the API as `area_name`.
 */
export default function AreaInput({ label = 'Area', value, onChange, areas = [], className = '', compact = false }) {
  const listId = useId();

  return (
    <div className={className}>
      {label && <label className={`block font-medium text-ink ${compact ? 'mb-1 text-xs' : 'mb-1.5 text-sm'}`}>{label}</label>}
      <input
        type="text"
        list={listId}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Area"
        aria-label={label || 'Area'}
        autoComplete="off"
        className={`w-full border border-line bg-white px-3.5 text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none ${compact ? 'rounded-lg py-2 text-sm' : 'h-11 rounded-xl text-[0.95rem]'}`}
      />
      <datalist id={listId}>
        {areas.map((a) => <option key={a.id} value={a.label || a.name} />)}
      </datalist>
    </div>
  );
}
