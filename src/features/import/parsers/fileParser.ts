import type { ImportFileFormat, ParsedWorkbook } from '../types';
import { parseCSV } from './csvParser';
import { parseWorkbookBytes } from './spreadsheetParser';

/** 10 MB — generous for a spreadsheet of master data, small enough to keep parsing (and any ReDoS surface in the xlsx dependency) bounded. */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
/** Applied after parsing, before the row ever reaches an adapter — a file with more rows than this is rejected outright rather than silently truncated. */
export const MAX_IMPORT_ROWS = 20_000;

const EXTENSION_FORMAT: Record<string, ImportFileFormat> = { csv: 'csv', xlsx: 'xlsx', xls: 'xls' };
/** Browsers report these inconsistently (a bare `.csv` is often `text/csv`, `application/vnd.ms-excel`, or even `''`) — MIME is a secondary signal, extension is authoritative, matching the file-security posture of every other importer in this codebase (banking's `detectStatementFormat`). */
const ACCEPTED_MIME_PREFIXES = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml', 'application/csv', 'text/plain'];

export class ImportFileError extends Error {}

function detectFormat(fileName: string): ImportFileFormat {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const format = ext ? EXTENSION_FORMAT[ext] : undefined;
  if (!format) {
    throw new ImportFileError(`Unsupported file type "${fileName}" — choose a .csv, .xls or .xlsx file.`);
  }
  return format;
}

/**
 * The ONE entry point every adapter's file-selection step calls — dispatches
 * to `parseCSV`/`parseWorkbookBytes` by (authoritative) file extension after
 * enforcing the file-security limits (spec §18): a real .csv/.xls/.xlsx
 * extension, a sane MIME (when the browser reports one), and a maximum
 * upload size. Never executes a macro or formula — `parseWorkbookBytes`
 * reads cached values only.
 */
export async function parseImportFile(file: File): Promise<ParsedWorkbook> {
  if (file.size === 0) {
    throw new ImportFileError(`"${file.name}" is empty.`);
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError(`"${file.name}" is larger than the ${(MAX_IMPORT_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB import limit.`);
  }
  const format = detectFormat(file.name);
  if (file.type && !ACCEPTED_MIME_PREFIXES.some((p) => file.type.startsWith(p)) && file.type !== 'application/octet-stream') {
    throw new ImportFileError(`"${file.name}" reports an unexpected file type (${file.type}) for a .${format} file.`);
  }

  if (format === 'csv') {
    const text = await file.text();
    const sheet = parseCSV(text);
    assertRowLimit(sheet.rows.length, file.name);
    return {
      format,
      fileName: file.name,
      worksheetNames: ['Sheet1'],
      getSheet: () => sheet,
    };
  }

  const bytes = await file.arrayBuffer();
  const workbook = parseWorkbookBytes(bytes, file.name, format);
  for (const name of workbook.worksheetNames) {
    assertRowLimit(workbook.getSheet(name).rows.length, `${file.name} → ${name}`);
  }
  return workbook;
}

function assertRowLimit(rowCount: number, label: string): void {
  if (rowCount > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`"${label}" has ${rowCount.toLocaleString()} rows — the import limit is ${MAX_IMPORT_ROWS.toLocaleString()}. Split the file and import in batches.`);
  }
}
