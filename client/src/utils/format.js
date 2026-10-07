/** Shared display formatting so numbers and dates look the same everywhere. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export const formatCurrency = (value) => inr.format(value ?? 0);

/** Large sums read better shortened on cards: 12,50,000 -> ₹12.5L */
export function formatCompactCurrency(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return inr.format(amount);
}

export const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(value ?? 0);

export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export const formatShortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

/** Date plus time — used where the exact moment matters, e.g. a login timestamp. */
export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

/** Days remaining until a date; negative means overdue. */
export function daysUntil(value) {
  if (!value) return null;
  const diff = new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}
