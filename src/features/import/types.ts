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
  /** A safe, human-meaningful business identifier for the record this row created/updated/mapped to — an account code, customer/supplier code, or journal number. Never a raw internal id/UUID; left unset when the adapter has no such identifier to show (Part 34 principle applied to the result report). */
  recordRef?: string;
}

export interface ImportExecutionSummary {
  rowsRead: number;
  imported: number;
  updated: number;
  skipped: number;
  errored: number;
  rows: ImportRowOutcome[];
  /** Set when the adapter created one accounting-significant draft document (opening stock, stock take, an opening-balance journal) rather than N independent master-data records. */
  draftRecordId?: string;
  /** Small, aggregated batch-level detail (Phase D) — e.g. per-customer opening-AR totals for the reconciliation dashboard. Never raw per-row source content (Part 34). */
  metadata?: Record<string, unknown>;
}

/** One extra input the wizard's Confirm step collects before `execute()` runs — e.g. "which frozen stock take are these counts for", or (Phase D) "what is the opening/migration date". `type: 'enum'` (default) renders an EnumSelect dropdown from `options`; `type: 'date'` renders a plain date input and ignores `options`. The chosen value lands in `ImportExecuteOptions.params[key]`. */
export interface ImportConfirmField {
  key: string;
  label: string;
  type?: 'enum' | 'date';
  options?: { value: string; label: string }[];
  /** Pre-fills a `type: 'date'` field — e.g. the earliest open financial period's start date. */
  defaultValue?: string;
  required?: boolean;
  helpText?: string;
}

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Account mapping (Phase D — external account code -> Vertex Chart of Accounts).
// Only adapters that reference an EXTERNAL account (Trial Balance, GL
// detail) declare this; master-data adapters (Products, Customers, …)
// never do. See src/features/import/migration/accountMapping.ts.
// ---------------------------------------------------------------------------

/** One distinct external account a row set refers to, discovered from the mapped-but-not-yet-normalized rows. */
export interface ExternalAccountRef {
  code: string;
  name?: string;
  /** Free-text account type/category as it appeared in the source file, if any — shown for context only, never used to auto-decide a mapping. */
  sourceType?: string;
}

/** The user's decision for one ExternalAccountRef — always explicit, never inferred (Part 25: "no silent fuzzy accounting mapping"). `'create'` carries the code/name to create it with (the UI already has both from the ExternalAccountRef being mapped). */
export type AccountMappingChoice =
  | { action: 'existing'; accountId: string }
  | { action: 'create'; accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'; code: string; name: string }
  | { action: 'ignore' };

/** externalAccountCode -> the user's mapping choice for it. */
export type AccountMappingSelections = Record<string, AccountMappingChoice>;

// ---------------------------------------------------------------------------
// Tax/VAT mapping (Phase D, Requirement 2 — external tax/VAT code -> Vertex
// tax treatment). Same shape and safety rule as account mapping: exact-code
// suggestions only, always shown for explicit confirmation, never applied
// silently. Built as a reusable foundation per the brief's own instruction
// ("even if not every current adapter consumes it yet") — the GL Detail
// adapter is the first (optional) consumer. See
// src/features/import/migration/taxMapping.ts.
// ---------------------------------------------------------------------------

/** One distinct external tax/VAT code a row set refers to, discovered from the mapped-but-not-yet-normalized rows. */
export interface ExternalTaxRef {
  code: string;
  description?: string;
  /** The source file's own stated rate (e.g. 15), shown for context only — never used to auto-decide a mapping. */
  rate?: number;
}

/** The user's decision for one ExternalTaxRef. `'ignore'` is for a legitimately non-taxable line (Part 24: "Ignore where legitimately non-taxable") — never a default/fallback. */
export type TaxMappingChoice = { action: 'mapped'; taxRateId: string } | { action: 'ignore' };

/** externalTaxCode -> the user's mapping choice for it. */
export type TaxMappingSelections = Record<string, TaxMappingChoice>;

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
  /**
   * When true, the wizard inserts an "Account mapping" step right after
   * column mapping (before validation) — `extractAccountRefs`/
   * `getMappableAccounts`/`applyAccountMapping` become required.
   */
  requiresAccountMapping?: boolean;
  /** Distinct external accounts referenced by the mapped-but-unnormalized rows — computed from raw column-mapped cells, not `normalizeRow()` output. */
  extractAccountRefs?: (rawRows: Record<string, ImportCellValue>[], ctx: TContext) => ExternalAccountRef[];
  /** The Vertex accounts the user may map an external account to. */
  getMappableAccounts?: (ctx: TContext) => { id: string; code: string; name: string }[];
  /** Folds the user's resolved account-mapping selections into `ctx` — `normalizeRow`/`execute` read the resolution from there. May create new accounts (action `'create'`) via the real accountService, never a fabricated id. */
  applyAccountMapping?: (ctx: TContext, selections: AccountMappingSelections) => Promise<TContext>;
  /**
   * When true, the wizard inserts a "Tax mapping" step (after account
   * mapping, before validation) — `extractTaxRefs`/`getMappableTaxTreatments`/
   * `applyTaxMapping` become required. The step is skipped automatically
   * when `extractTaxRefs` finds nothing to map (e.g. the source file has no
   * tax-code column mapped).
   */
  requiresTaxMapping?: boolean;
  /** Distinct external tax/VAT codes referenced by the mapped-but-unnormalized rows. Returns an empty array when there is nothing to map — the wizard skips the step in that case. */
  extractTaxRefs?: (rawRows: Record<string, ImportCellValue>[], ctx: TContext) => ExternalTaxRef[];
  /** The real, already-configured Vertex tax rates/treatments the user may map an external code to — never a newly hard-coded tax definition (Part 24). `code`/`treatment` feed the exact-alias suggestion logic (see migration/taxMapping.ts); `label` is what the UI displays. */
  getMappableTaxTreatments?: (ctx: TContext) => { id: string; code: string; treatment: string; label: string; rate: number }[];
  /** Folds the user's resolved tax-mapping selections into `ctx`. */
  applyTaxMapping?: (ctx: TContext, selections: TaxMappingSelections) => Promise<TContext>;
  /** Turns one mapped raw row into a normalized candidate + findings. Never throws — a bad row is a message, not an exception. */
  normalizeRow: (raw: Record<string, ImportCellValue>, rowNumber: number, ctx: TContext) => { normalized?: TNormalized; messages: RowMessage[] };
  /** Cross-row + against-existing-data duplicate detection. Returns a NEW array (rows are not mutated) with `severity`/`messages` updated for any row found duplicate. */
  detectDuplicates: (rows: ImportRowResult<TNormalized>[], ctx: TContext) => ImportRowResult<TNormalized>[];
  /** Executes the import for every row that is not `error`/`skipped`. Row-level outcomes for master data; a single draft-document creation for accounting-significant adapters (see `draftRecordId`). */
  execute: (rows: ImportRowResult<TNormalized>[], ctx: TContext, options: ImportExecuteOptions) => Promise<ImportExecutionSummary>;
}
