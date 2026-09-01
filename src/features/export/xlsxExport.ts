import * as XLSX from 'xlsx';
import type { ExportCellValue, ExportDataset, ExportOptions } from './types';

function toCellValue(value: ExportCellValue): string | number | Date {
  if (value === null || value === undefined) return '';
  return value;
}

/**
 * Builds a genuine SheetJS workbook — real numeric/date cell types where
 * the source value is a number/`Date` (spec §4: "support number/date cell
 * types where practical"), never a spreadsheet of formatted text pretending
 * to be data. No formulas are ever written or evaluated — every cell is a
 * literal value. Column widths are set from the header text (SheetJS's own
 * best-effort `!cols` sizing hint, honoured by desktop Excel/LibreOffice,
 * ignored harmlessly by anything that doesn't support it).
 */
export function buildWorkbook<T>(dataset: ExportDataset<T>, options: ExportOptions = {}): XLSX.WorkBook {
  const sheetName = (options.sheetName ?? dataset.title).slice(0, 31) || 'Sheet1';
  const header = dataset.columns.map((c) => c.header);
  const dataRows = dataset.rows.map((row) => dataset.columns.map((c) => toCellValue(c.accessor(row))));
  const aoa: (string | number | Date)[][] = [header, ...dataRows];

  if (dataset.columns.some((c) => c.total)) {
    aoa.push(dataset.columns.map((c, i) => (c.total ? toCellValue(c.total(dataset.rows)) : i === 0 ? 'Total' : '')));
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  worksheet['!cols'] = dataset.columns.map((c) => ({ wch: Math.max(c.header.length + 2, 10) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return workbook;
}

/** Triggers a browser download of `dataset` as a real `.xlsx` file (SheetJS's own `writeFile`, which handles the Blob/download itself in a browser build). */
export function downloadXLSX<T>(dataset: ExportDataset<T>, options: ExportOptions = {}): void {
  const workbook = buildWorkbook(dataset, options);
  XLSX.writeFile(workbook, `${dataset.filename}.xlsx`);
}
