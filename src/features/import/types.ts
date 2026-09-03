/**
 * Shared Import Framework (Phase 6, docs/IMPORT_EXPORT_ARCHITECTURE.md) —
 * the generic contract every import target (Inventory Products, Opening
 * Stock, Stock Take counts, Customers, Suppliers, …) plugs into. Nothing
 * in this file knows about any one domain; a domain-specific
 * `ImportAdapter` (see `adapters/`) is the only place that does.
 *
 * Pipeline: file → parse → (worksheet) → preview → map columns → validate
 * → review → confirm → execute → result. `ImportWizard` (components/) is
 * the ONE UI that drives every adapter through this pipeline — see its
 * own doc comment for the step list.
 */

export type ImportFileFormat = 'csv' | 'xlsx' | 'xls';

/** A cell value after parsing — already coerced from the file's own representation, never a raw library type. */
export type ImportCellValue = string | number | boolean | Date | undefined;

/** One worksheet's (or a CSV file's single implicit sheet's) header row + data rows, values in header order. */
export interface ParsedSheet {
  headers: string[];
  rows: ImportCellValue[][];
}

/** A parsed file — one or more worksheets. CSV always has exactly one, named `'Sheet1'`. */
export interface ParsedWorkbook {
  format: ImportFileFormat;
  fileName: string;
  worksheetNames: string[];
  getSheet(worksheetName: string): ParsedSheet;
}

// ---------------------------------------------------------------------------
// Field definitions + column mapping
// ---------------------------------------------------------------------------

export type ImportFieldType = 'string' | 'number' | 'boolean' | 'date';

/** One application field an adapter can accept a spreadsheet column into. */
export interface ImportFieldDef {
  /** Stable key used everywhere else in the pipeline (mapping, raw row, normalized record). */
  key: string;
  label: string;
  required?: boolean;
  type: ImportFieldType;
  /** Case/punctuation-insensitive header aliases used to suggest a mapping — see `mapping.ts`. Never applied silently below `MAPPING_CONFIDENCE_THRESHOLD`. */
  aliases: string[];
  description?: string;
}

/** fieldKey → source column index in the sheet currently being imported, or `undefined` when unmapped. */
export type ColumnMapping = Record<string, number | undefined>;

export interface SuggestedMapping {
  mapping: ColumnMapping;
  /** fieldKey → true when the suggestion was a confident automatic match (shown differently in the UI from a required-but-unmapped field). */
  confident: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Row-level validation
// ---------------------------------------------------------------------------

export type RowSeverity = 'valid' | 'warning' | 'error' | 'duplicate' | 'skipped';

export interface RowMessage {
  field?: string;
  message: string;
  severity: 'warning' | 'error';
}

/**
 * One row's outcome as it moves through mapping → normalize → duplicate
 * detection. `raw` and `normalized` are both kept (spec §6): raw is what
 * mapping produced (still string/number/Date, un-typed), normalized is
 * what `normalizeRow()` actually parsed out of it — a row can have `raw`
 * but no `normalized` (e.g. a required field was blank).
 */
export interface ImportRowResult<TNormalized> {
  /** 1-based, matching the spreadsheet's own row numbering (the header is row 1). */
  rowNumber: number;
  raw: Record<string, ImportCellValue>;
  normalized?: TNormalized;
  severity: RowSeverity;
  messages: RowMessage[];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export type DuplicateStrategy = 'skip' | 'update' | 'error';

export interface ImportExecuteOptions {
  duplicateStrategy: DuplicateStrategy;
  actorUserId: string;
  /** Adapter-specific extra input the wizard's confirm step collected via `ImportAdapter.confirmFields` (e.g. stock-take-count import's target stock take id) — empty for adapters that need none. */
  params: Record<string, unknown>;
}

export interface ImportRowOutcome {
  rowNumber: number;
  outcome: 'imported' | 'updated' | 'skipped' | 'error';
  message?: string;
}

export interface ImportExecutionSummary {
  rowsRead: number;
  imported: number;
  updated: number;
  skipped: number;
  errored: number;
  rows: ImportRowOutcome[];
  /** Set when the adapter created one accounting-significant draft document (opening stock, stock take) rather than N independent master-data records. */
  draftRecordId?: string;
}

/** One extra input the wizard's Confirm step collects before `execute()` runs — e.g. "which frozen stock take are these counts for". Rendered as an EnumSelect dropdown; the chosen value lands in `ImportExecuteOptions.params[key]`. */
export interface ImportConfirmField {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
  helpText?: string;
}

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

/**
 * Everything one import target needs to plug into `ImportWizard`. An
 * adapter is pure orchestration + domain rules — it calls existing
 * services (`productService`, `openingStockBatchService`, …) for every
 * actual write; it never talks to a repository directly and never posts
 * a journal entry itself (see each adapter's own doc comment for its
 * accounting-safety boundary).
 */
export interface ImportAdapter<TNormalized, TContext> {
  id: string;
  label: string;
  description: string;
  /** Gates this adapter's availability in the wizard's "Import type" step — `useCanAccess(permission.feature, permission.action)`. */
  permission: { feature: string; action: string };
  fields: ImportFieldDef[];
  /** Loads whatever reference data `normalizeRow`/`detectDuplicates`/`execute` need (categories, suppliers, existing SKUs, …). Called once, right after the import type is chosen. */
  loadContext: () => Promise<TContext>;
  /**
   * Extra input the wizard must collect from the user, right after
   * `loadContext()`, before mapping/validation can run (e.g. which frozen
   * stock take to import counts into) — omitted (or an empty array) for
   * adapters that need none.
   */
  confirmFields?: (ctx: TContext) => ImportConfirmField[];
  /** Folds the user's `confirmFields` selections into `ctx` before mapping/validation proceeds — required whenever `confirmFields` is provided. */
  applyParams?: (ctx: TContext, params: Record<string, unknown>) => TContext;
  /** Turns one mapped raw row into a normalized candidate + findings. Never throws — a bad row is a message, not an exception. */
  normalizeRow: (raw: Record<string, ImportCellValue>, rowNumber: number, ctx: TContext) => { normalized?: TNormalized; messages: RowMessage[] };
  /** Cross-row + against-existing-data duplicate detection. Returns a NEW array (rows are not mutated) with `severity`/`messages` updated for any row found duplicate. */
  detectDuplicates: (rows: ImportRowResult<TNormalized>[], ctx: TContext) => ImportRowResult<TNormalized>[];
  /** Executes the import for every row that is not `error`/`skipped`. Row-level outcomes for master data; a single draft-document creation for accounting-significant adapters (see `draftRecordId`). */
  execute: (rows: ImportRowResult<TNormalized>[], ctx: TContext, options: ImportExecuteOptions) => Promise<ImportExecutionSummary>;
}
