const TONES = {
  neutral: 'bg-canvas text-ink-muted border-line',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-danger-soft text-danger border-danger/25',
};

/** Small status pill. Tone carries the meaning, the label carries the detail. */
export default function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone] ?? TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

/** Maps domain statuses onto a tone and a readable label. */
export const STATUS_META = {
  'on-track': { tone: 'positive', label: 'On track' },
  delayed: { tone: 'danger', label: 'Delayed' },
  attention: { tone: 'warning', label: 'Needs attention' },
  'on-hold': { tone: 'neutral', label: 'On hold' },
  completed: { tone: 'brand', label: 'Completed' },
  pending: { tone: 'warning', label: 'Pending' },
  approved: { tone: 'positive', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  cleared: { tone: 'positive', label: 'Cleared' },
  overdue: { tone: 'danger', label: 'Overdue' },
};

export function StatusBadge({ status, className = '' }) {
  const meta = STATUS_META[status] ?? { tone: 'neutral', label: status };
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
