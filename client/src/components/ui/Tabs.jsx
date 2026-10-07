/**
 * Horizontal tab strip. Scrolls sideways on narrow screens rather than
 * wrapping into a tall block that pushes content down.
 */
export default function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`border-b border-line ${className}`}>
      <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto pb-px">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={[
                'whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors',
                isActive
                  ? 'border-brand-600 font-medium text-brand-700'
                  : 'border-transparent text-ink-muted hover:border-line hover:text-ink',
              ].join(' ')}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[0.7rem] ${isActive ? 'bg-brand-100 text-brand-700' : 'bg-canvas text-ink-subtle'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
