import type { ExportCellValue, ExportDataset } from './types';

const UTF8_BOM = '﻿';

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** ISO date, never a locale-dependent string — a machine-readable export stays machine-readable. */
function csvCell(value: ExportCellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return csvEscape(String(value));
}

/**
 * Builds a proper CSV — quoted/escaped commas, quotes and line breaks
 * (spec §3), numbers exported as bare values (never a formatted UI
 * string), deterministic column order (`dataset.columns`' own order,
 * never a table's rendered column order). A column with a `total()`
 * appends one final totals row, label in the first column.
 */
export function buildCSV<T>(dataset: ExportDataset<T>): string {
  const header = dataset.columns.map((c) => csvEscape(c.header));
  const lines = [header.join(',')];
  for (const row of dataset.rows) {
    lines.push(dataset.columns.map((c) => csvCell(c.accessor(row))).join(','));
  }
  if (dataset.columns.some((c) => c.total)) {
    const totalsRow = dataset.columns.map((c, i) => {
      if (!c.total) return i === 0 ? 'Total' : '';
      return csvCell(c.total(dataset.rows));
    });
    lines.push(totalsRow.join(','));
  }
  return lines.join('\r\n');
}

/**
 * Triggers a browser download of `dataset` as CSV. A UTF-8 BOM is
 * prepended — without it, Excel (still the overwhelmingly common opener
 * for a downloaded .csv) misreads non-ASCII characters (e.g. "R" is
 * ASCII, but a customer/supplier name with an accent is not) as the
 * system codepage instead of UTF-8.
 */
export function downloadCSV<T>(dataset: ExportDataset<T>): void {
  const csv = buildCSV(dataset);
  const blob = new Blob([UTF8_BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${dataset.filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
