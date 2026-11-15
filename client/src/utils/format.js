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

const pad2 = (n) => String(n).padStart(2, '0');

/** A Date for a value, reading plain "YYYY-MM-DD" as that LOCAL calendar day. */
function toLocalDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Every date in the app is shown as DD-MM-YYYY. */
export const formatDate = (value) => {
  const d = toLocalDate(value);
  return d ? `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}` : '—';
};

/** Day and month only (DD-MM), for compact chart labels and chips. */
export const formatShortDate = (value) => {
  const d = toLocalDate(value);
  return d ? `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}` : '—';
};

/** Date plus time (DD-MM-YYYY HH:MM) — used where the exact moment matters, e.g. a login timestamp. */
export const formatDateTime = (value) => {
  const d = toLocalDate(value);
  return d ? `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '—';
};

/** ISO "YYYY-MM-DD" (or any date value) -> "DD-MM-YYYY" for a text input; '' when empty. */
export function isoToDmy(value) {
  if (!value) return '';
  const iso = toDateInputValue(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** "DD-MM-YYYY" (also DD/MM/YYYY or DD.MM.YYYY) -> ISO "YYYY-MM-DD", or null when not a real date. */
export function dmyToIso(text) {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(String(text || '').trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (year < 1900 || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Today's local date as ISO "YYYY-MM-DD" (not the UTC date, which is yesterday before 05:30 IST). */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ISO date `days` days after an ISO date (local calendar), e.g. a default end date. */
export function addDaysIso(iso, days) {
  const d = toLocalDate(iso) || new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Days remaining until a date; negative means overdue. */
export function daysUntil(value) {
  if (!value) return null;
  const diff = new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

/**
 * Value for an <input type="date">. DATE columns reach the browser as UTC ISO
 * timestamps of local midnight (e.g. 2026-10-01 in IST -> "2026-09-30T18:30:00.000Z"),
 * so slicing the string shows - and re-saves - the previous day. Plain
 * "YYYY-MM-DD" values pass through unchanged.
 */
export function toDateInputValue(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
