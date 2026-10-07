/** Surface used for every panel on the dashboard. */
export function Card({ children, className = '', ...props }) {
  return (
    <section
      className={`rounded-2xl border border-line bg-card shadow-card ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

/** Panel header with an optional action area on the right. */
export function CardHeader({ title, description, action, className = '' }) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 ${className}`}
    >
      <div className="min-w-0">
        <h2 className="font-display text-[1.05rem] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export default Card;
