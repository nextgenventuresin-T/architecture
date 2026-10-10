import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'bg-white text-ink border border-line hover:bg-brand-50 hover:border-brand-200 disabled:text-ink-subtle',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 disabled:text-ink-subtle',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-[0.95rem]',
};

/** Shared button. `isLoading` swaps in a spinner and blocks repeat submits. */
export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  fullWidth = false,
  loadingText,
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
        'transition-colors duration-150 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {/* inline-flex keeps an icon beside its label instead of on its own line */}
      <span className="inline-flex items-center gap-1.5">{isLoading && loadingText ? loadingText : children}</span>
    </button>
  );
}
