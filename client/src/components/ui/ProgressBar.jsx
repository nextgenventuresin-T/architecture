/**
 * Progress track. Colour follows the project status rather than the number, so
 * a site that is 90% done but stalled does not read as healthy.
 */
const FILLS = {
  'on-track': 'bg-brand-600',
  completed: 'bg-brand-600',
  attention: 'bg-amber-500',
  delayed: 'bg-danger',
  'on-hold': 'bg-ink-subtle',
};

export default function ProgressBar({ value = 0, status = 'on-track', showLabel = false, className = '' }) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${FILLS[status] ?? FILLS['on-track']}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
          {percent}%
        </span>
      )}
    </div>
  );
}
