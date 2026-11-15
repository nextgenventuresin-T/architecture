import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { AREA_UNIT_OPTIONS, DEFAULT_AREA_UNIT } from '../../utils/areaUnits';

export { DEFAULT_AREA_UNIT };

/**
 * Area measurement: a numeric value with its unit chosen beside it
 * (Feet / Metres / Square Feet / Square Metres).
 */
export default function AreaMeasureField({ label = 'Area', value, unit, onValueChange, onUnitChange, error, hint, disabled, className = '' }) {
  const id = useId();
  const box = `h-11 rounded-xl border bg-white text-[0.95rem] text-ink transition-colors focus:outline-none disabled:bg-canvas-subtle ${
    error ? 'border-danger' : 'border-line hover:border-brand-200 focus:border-brand-500 focus:shadow-focus'
  }`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={onValueChange}
          disabled={disabled}
          placeholder="e.g. 2400"
          aria-invalid={Boolean(error) || undefined}
          className={`${box} min-w-0 flex-1 px-3.5`}
        />
        <div className="relative w-52 shrink-0">
          <select
            aria-label={`${label} unit`}
            value={unit || DEFAULT_AREA_UNIT}
            onChange={onUnitChange}
            disabled={disabled}
            className={`${box} w-full appearance-none pl-3 pr-8 text-sm`}
          >
            {AREA_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
        </div>
      </div>
      {error ? <p role="alert" className="mt-1.5 text-sm text-danger">{error}</p>
        : hint ? <p className="mt-1.5 text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}
