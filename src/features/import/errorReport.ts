import type { ImportRowOutcome } from './types';

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Builds the downloadable error-report CSV (spec §20) — row number and
 * message for every row that failed. This is an import-RESULT file, not
 * the Phase-7 reporting/export system; it never includes the raw
 * spreadsheet content the row came from (spec §17's "avoid storing the
 * full uploaded file" applies equally to what leaves the browser here).
 */
export function buildErrorReportCSV(rows: ImportRowOutcome[]): string {
  const header = ['Row', 'Message'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([String(row.rowNumber), csvEscape(row.message ?? '')].join(','));
  }
  return lines.join('\r\n');
}

/** Triggers a browser download of the error report for `sourceFileName`'s import run. */
export function downloadErrorReportCSV(sourceFileName: string, rows: ImportRowOutcome[]): void {
  const csv = buildErrorReportCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const baseName = sourceFileName.replace(/\.[^.]+$/, '');
  link.href = url;
  link.download = `${baseName}-import-errors.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
