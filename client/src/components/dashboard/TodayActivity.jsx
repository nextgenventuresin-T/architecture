import { Card, CardHeader, CardBody } from '../ui/Card';
import Skeleton from '../ui/Skeleton';

const DOTS = {
  positive: 'bg-emerald-500',
  alert: 'bg-amber-500',
  neutral: 'bg-brand-300',
};

/** Chronological log of what happened on site today. */
export default function TodayActivity({ entries = [], isLoading }) {
  return (
    <Card>
      <CardHeader
        title="Today's site activity"
        description={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      />
      <CardBody>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : (
          <ol className="space-y-4">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[entry.tone] ?? DOTS.neutral}`} />
                  <span className="mt-1 w-px flex-1 bg-line last:hidden" />
                </div>
                <div className="min-w-0 pb-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-ink">{entry.site}</span>
                    <span className="text-xs tabular-nums text-ink-subtle">{entry.time}</span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{entry.note}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
