/** Placeholder block shown while dashboard data loads. */
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-brand-100/70 ${className}`} />;
}
