import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Labelled form controls used across the create/edit forms. Keeping select,
 * textarea and input in one place is what makes every form look identical.
 */
const baseInput =
  'w-full rounded-xl border bg-white text-[0.95rem] text-ink placeholder:text-ink-subtle transition-colors focus:outline-none disabled:bg-canvas-subtle disabled:text-ink-subtle disabled:cursor-not-allowed';

const stateClasses = (error) =>
  error
    ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(179,36,36,0.14)]'
    : 'border-line hover:border-brand-200 focus:border-brand-500 focus:shadow-focus';

function Shell({ id, label, error, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function InputField({ label, error, hint, required, className, ...props }) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <input
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${baseInput} ${stateClasses(error)} h-11 px-3.5`}
        {...props}
      />
    </Shell>
  );
}

export function TextAreaField({ label, error, hint, required, rows = 3, className, ...props }) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${baseInput} ${stateClasses(error)} resize-y px-3.5 py-2.5`}
        {...props}
      />
    </Shell>
  );
}

export function SelectField({ label, error, hint, required, options = [], placeholder, className, children, ...props }) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${baseInput} ${stateClasses(error)} h-11 appearance-none pl-3.5 pr-9`}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {children}
          {Array.isArray(options) && options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
      </div>
    </Shell>
  );
}
