/**
 * Shared Print / Export Infrastructure (Phase 7,
 * docs/IMPORT_EXPORT_ARCHITECTURE.md § Print/Export) — the generic model
 * every printable list/register/document plugs into. Export is always
 * built from this structured data, never scraped off a rendered
 * `DataTable`'s DOM/markup — the table's own column defs and the
 * `ExportColumn` defs below commonly mirror each other, but they stay two
 * separate declarations on purpose, since a table cell often renders a
 * badge/link/icon that has no sensible CSV/XLSX/print cell value.
 */

/** A machine-readable cell value — never a pre-formatted UI string ("R 1,234.56"); see `formatForPrint` for the one place display formatting belongs. */
export type ExportCellValue = string | number | Date | null | undefined;

export interface ExportColumn<T> {
  key: string;
  header: string;
  /** The real value — a number stays a number, a date stays a `Date`. This is what CSV/XLSX cells get. */
  accessor: (row: T) => ExportCellValue;
  /** How this column reads on a PRINTED page — defaults to `String(accessor(row))`. Currency symbols, percentage signs, thousands separators — anything screen/print-only — belongs here, never in `accessor`. */
  formatForPrint?: (row: T) => string;
  align?: 'left' | 'right';
  /** A column total shown on the printed report and appended as an extra XLSX row — omitted (not zero) for a column with no meaningful total. */
  total?: (rows: T[]) => ExportCellValue;
}

/** One active filter/scope shown on the printed report header (spec §17) — e.g. `{ label: 'Warehouse', value: 'Main Warehouse' }`. Purely descriptive; never re-applied to `rows`. */
export interface ExportFilterDescriptor {
  label: string;
  value: string;
}

export interface ExportDataset<T> {
  /** The report/list title — also seeds the default export filename when `filename` is omitted. */
  title: string;
  subtitle?: string;
  filters?: ExportFilterDescriptor[];
  columns: ExportColumn<T>[];
  rows: T[];
  /** Base filename, no extension — e.g. `'inventory-stock-on-hand-2026-09-01'`. */
  filename: string;
  /** Defaults to `new Date()` — overridable for deterministic tests. */
  generatedAt?: Date;
}

export interface ExportOptions {
  /** Overrides the XLSX worksheet name (defaults to `dataset.title`, truncated to Excel's 31-character limit). */
  sheetName?: string;
}
