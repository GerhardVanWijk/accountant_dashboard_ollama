import type { ImportCellValue, RowMessage } from './types';

/** Trims a cell to a plain string, or `undefined` for blank/missing. Never coerces a number/Date to string silently losing precision — callers that expect text should only apply this to a field typed `'string'`. */
export function asString(value: ImportCellValue): string | undefined {
  if (value === undefined) return undefined;
  const s = typeof value === 'string' ? value : String(value);
  const trimmed = s.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Parses a numeric cell — a spreadsheet library already hands back a real `number` for a numeric cell; a CSV cell is text, so this also strips currency symbols/thousands separators ("R 1 234,56", "$1,234.56") the way `statementParsers.ts`'s `parseAmount` does. Returns `undefined` (not 0) when the cell is blank or truly unparseable, so a required-number check can tell "missing" from "zero". */
export function asNumber(value: ImportCellValue): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (value instanceof Date) return undefined;
  const cleaned = String(value).trim().replace(/[^0-9.,-]/g, '');
  if (cleaned === '') return undefined;
  // South African convention "1 234,56" vs international "1,234.56" — a
  // comma followed by exactly two trailing digits is treated as the
  // decimal separator; every other comma is a thousands separator.
  const normalized = /,\d{2}$/.test(cleaned) && !cleaned.includes('.') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const TRUE_TOKENS = new Set(['true', '1', 'yes', 'y', 'active']);
const FALSE_TOKENS = new Set(['false', '0', 'no', 'n', 'inactive']);

/** Parses a boolean cell from either a real boolean, a number (0/1), or common text tokens (yes/no, true/false, active/inactive). */
export function asBoolean(value: ImportCellValue): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const token = String(value).trim().toLowerCase();
  if (TRUE_TOKENS.has(token)) return true;
  if (FALSE_TOKENS.has(token)) return false;
  return undefined;
}

/** Parses a date cell — a spreadsheet library already hands back a real `Date` for a date-formatted cell (see `spreadsheetParser.ts`'s `cellDates: true`); CSV text is parsed the same DD/MM/YYYY-first way `statementParsers.ts`'s `normalizeDate` uses, since that's this codebase's established South African convention. Returns an ISO date string (`YYYY-MM-DD`), never a full timestamp — every import target here (opening stock, stock take) stores a plain date. */
export function asISODate(value: ImportCellValue): string | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (raw === '') return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  }
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3) {
    const [d, m] = parts;
    let y = parts[2];
    if (y.length === 2) y = `20${y}`;
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback.toISOString().slice(0, 10);
}

/** Pushes a required-field-missing error onto `messages` and returns `true` when `value` is missing — the common "bail out of this row" check every adapter's `normalizeRow()` starts with per required field. */
export function requireField(value: unknown, field: string, label: string, messages: RowMessage[]): boolean {
  if (value === undefined || value === '') {
    messages.push({ field, message: `${label} is required.`, severity: 'error' });
    return true;
  }
  return false;
}
