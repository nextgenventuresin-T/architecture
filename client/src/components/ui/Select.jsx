import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

/** Compact filter dropdown used across dashboard sections. */
export default function Select({ label, value, onChange, options = [], children, className = '', ...props }) {
  const id = useId();

  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={onChange}
          aria-label={label}
          className="h-9 w-full appearance-none rounded-lg border border-line bg-white pl-3 pr-8 text-sm text-ink transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          {...props}
        >
          {children
            ? children
            : (options || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
