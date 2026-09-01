import * as XLSX from 'xlsx';
import type { ImportCellValue, ParsedSheet, ParsedWorkbook } from '../types';

/**
 * XLS/XLSX via SheetJS (`xlsx` on npm — the only maintained registry
 * package for this; `npm audit` flags a known, no-fix-available advisory
 * on it, see docs/IMPORT_EXPORT_ARCHITECTURE.md § Known issues). Read-only:
 * `bookVBA: false` and no `cellFormula` handling — a formula's cached
 * VALUE is read like any other cell, its FORMULA STRING never is, so a
 * malicious formula is inert data here, never executed
 * (docs/IMPORT_EXPORT_ARCHITECTURE.md § File security).
 */
export function parseWorkbookBytes(bytes: ArrayBuffer, fileName: string, format: 'xlsx' | 'xls'): ParsedWorkbook {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, bookVBA: false });
  const worksheetNames = workbook.SheetNames;

  return {
    format,
    fileName,
    worksheetNames,
    getSheet(worksheetName: string): ParsedSheet {
      const sheet = workbook.Sheets[worksheetName];
      if (!sheet) return { headers: [], rows: [] };
      // header: 1 → array-of-arrays (not object-per-row), so a duplicate or
      // blank header never silently collides/drops a column; raw: true
      // keeps a text-formatted cell (e.g. a SKU with leading zeroes) as the
      // string it actually is rather than coercing it through a number.
      const grid = XLSX.utils.sheet_to_json<ImportCellValue[]>(sheet, {
        header: 1,
        raw: true,
        defval: undefined,
        blankrows: false,
      });
      if (grid.length === 0) return { headers: [], rows: [] };
      const headers = grid[0].map((h) => (h === undefined ? '' : String(h).trim()));
      const rows = grid.slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''));
      return { headers, rows };
    },
  };
}
