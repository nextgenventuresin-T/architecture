import { SearchX } from 'lucide-react';

/** Shown when filters exclude everything. An empty screen should say what to do next. */
export default function EmptyState({ icon: Icon = SearchX, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
