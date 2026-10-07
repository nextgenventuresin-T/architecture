import { KPI_DEFS } from '../../utils/reportOptions';

/**
 * Every KPI the caller's role was actually given a number for (see
 * reportService.getDashboard — sections the caller can't view are never
 * even computed, so `pick(kpis)` naturally returns `undefined` for them and
 * the card is skipped rather than shown zeroed-out). Every card that does
 * render is a button: clicking it opens that KPI's drill-down with the
 * matching filters already applied.
 */
export default function KpiGrid({ kpis, activeReportId, activeFilters, onSelect }) {
  const cards = KPI_DEFS.map((def) => ({ def, value: def.pick(kpis) })).filter(
    ({ value }) => value !== undefined && value !== null
  );

  if (cards.length === 0) return null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {cards.map(({ def, value }) => {
        const isActive =
          activeReportId === def.reportId &&
          JSON.stringify(activeFilters ?? {}) === JSON.stringify(def.filters ?? {});
        const hint = def.hint ? def.hint(value) : undefined;

        return (
          <button
            key={def.key}
            type="button"
            onClick={() => onSelect(def.reportId, def.filters ?? {}, def.label)}
            aria-pressed={isActive}
            className={`card-interactive rounded-xl border bg-white px-4 py-3.5 text-left ${
              isActive ? 'border-brand-400 ring-1 ring-brand-400' : 'border-line'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${def.tone}`}>
                <def.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold tabular-nums leading-tight text-ink">{def.format(value)}</p>
                <p className="truncate text-xs text-ink-subtle">{def.label}</p>
              </div>
            </div>
            {hint && <p className="mt-2 truncate text-[0.7rem] text-ink-subtle">{hint}</p>}
          </button>
        );
      })}
    </div>
  );
}
