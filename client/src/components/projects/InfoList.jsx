/** Label/value pairs used across the overview panels. */
export default function InfoList({ items, columns = 1 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-3.5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-ink-subtle">{label}</dt>
          <dd className="mt-0.5 text-sm text-ink">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
