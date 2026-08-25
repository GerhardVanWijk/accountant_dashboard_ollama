/**
 * Ported verbatim from accounting-v0-frontend/lib/app/format.ts.
 * Presentation-only formatting helpers for the ported v0 shell/components.
 * Deliberately separate from this app's own src/utils/formatCurrency.ts
 * (which takes a currency code + locale, per this app's multi-currency
 * accounting engine) — this module is v0's own ZAR-only, shell-scoped
 * formatter, used only by ported v0 UI until each module's real page
 * replaces it with this app's existing formatting utilities.
 */

const zar = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const zarCompact = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const plain = new Intl.NumberFormat('en-ZA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "R 12 500,00" */
export function formatCurrency(value: number): string {
  return zar.format(value);
}

/** "R 12,5k" — for chart axes and tight KPI spaces. */
export function formatCurrencyCompact(value: number): string {
  return zarCompact.format(value);
}

/** "12 500,00" — for table columns that carry a currency in the header. */
export function formatAmount(value: number): string {
  return plain.format(value);
}

/** Renders a debit/credit cell, leaving zero values blank as ledgers do. */
export function formatLedgerAmount(value: number): string {
  return value === 0 ? '' : plain.format(value);
}

/** Wraps negatives in brackets, the accounting convention for statements. */
export function formatStatementAmount(value: number): string {
  if (value < 0) return `(${plain.format(Math.abs(value))})`;
  return plain.format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatSignedPercent(value: number, fractionDigits = 1): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

/**
 * Percentage movement between two figures. Returns null when there is no
 * comparable base, so callers can render an em dash instead of "Infinity%".
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const longDateFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "24 Aug 2026" */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** "24 August 2026" */
export function formatLongDate(iso: string): string {
  return longDateFormatter.format(new Date(iso));
}

/** "24 Aug 2026, 14:32" */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** Coarse relative time for activity feeds and notifications. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return formatDate(iso);
}

/** Whole days from today until the given date. Negative means overdue. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  return Math.round((then.getTime() - now.getTime()) / 86_400_000);
}

/** Human wording for a deadline, e.g. "Due in 12 days" / "14 days overdue". */
export function formatDueLabel(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 0) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

export function formatFileSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Turns a name into initials for avatars. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * These two are placeholders pending real FinancialYear/AccountingPeriod
 * data (src/features/admin) being wired into the ported shell footer — a
 * later phase, not M0. Deliberately NOT anchored to a fixed mock date the
 * way v0's own TODAY constant was, since this app has real period data to
 * eventually read instead.
 */
export const CURRENT_FINANCIAL_YEAR = 'FY2026/27';
export const CURRENT_PERIOD_LABEL = new Intl.DateTimeFormat('en-ZA', {
  month: 'long',
  year: 'numeric',
}).format(new Date());
