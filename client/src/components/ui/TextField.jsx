import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Labelled input with inline validation messaging. Passing `type="password"`
 * adds the show/hide toggle automatically.
 */
const TextField = forwardRef(function TextField(
  { label, error, hint, icon: Icon, type = 'text', className = '', ...props },
  ref
) {
  const id = useId();
  const [isRevealed, setIsRevealed] = useState(false);

  const isPassword = type === 'password';
  const resolvedType = isPassword && isRevealed ? 'text' : type;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>

      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
        )}

        <input
          ref={ref}
          id={id}
          type={resolvedType}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={[
            'h-11 w-full rounded-xl border bg-white text-[0.95rem] text-ink',
            'placeholder:text-ink-subtle transition-colors duration-150',
            Icon ? 'pl-11' : 'pl-3.5',
            isPassword ? 'pr-11' : 'pr-3.5',
            error
              ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(179,36,36,0.14)]'
              : 'border-line hover:border-brand-200 focus:border-brand-500 focus:shadow-focus',
            'focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
          ].join(' ')}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setIsRevealed((value) => !value)}
            aria-label={isRevealed ? 'Hide password' : 'Show password'}
            aria-pressed={isRevealed}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            {isRevealed ? (
              <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default TextField;
