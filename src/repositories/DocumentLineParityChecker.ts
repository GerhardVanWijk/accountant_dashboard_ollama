import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';

/**
 * Phase 9B (docs/PHASE_9B_DESIGN.md §3-4) — DUAL-WRITE PARITY CHECKER.
 *
 * A deterministic, **read-only** integrity checker that compares the two
 * representations of a document's lines:
 *
 *   - the AUTHORITATIVE jsonb array  (`<header>.line_items`)
 *   - the normalized projection      (`invoice_lines` / `bill_lines` /
 *                                     `purchase_order_lines` /
 *                                     `credit_note_lines`)
 *
 * It exists so that — AFTER migrations 0037-0042 are applied and BEFORE
 * `NORMALIZED_DOCUMENT_LINES_ENABLED` (src/config/featureFlags.ts) is ever
 * flipped `true` — a reviewer can prove the projection is a faithful,
 * lossless copy of the jsonb source. Nothing may read the normalized tables
 * as authoritative until this checker reports zero unexplained findings.
 *
 * GUARANTEES:
 *   - It only ever issues `select` queries. It never inserts, updates,
 *     deletes, or calls an RPC. It never touches a service-layer singleton.
 *   - It does not repair, reconcile, or mutate either representation — it
 *     only reports. A mismatch is for a human to investigate.
 *   - Every finding carries both raw line objects and a per-field
 *     breakdown, i.e. enough evidence to investigate without re-querying.
 *
 * CLASSIFICATION (exactly the four the brief requires):
 *   MATCH                   — line id present in both, every compared field equal
 *   MISSING_NORMALIZED_LINE — jsonb line id absent from the normalized table
 *   EXTRA_NORMALIZED_LINE   — normalized line id absent from the jsonb array
 *   FIELD_MISMATCH          — line id present in both, ≥1 compared field differs
 *
 * A jsonb line with `quantity <= 0` is EXCLUDED, not flagged MISSING: the
 * normalized tables carry `check (quantity > 0)` and the 0042 backfill
 * deliberately skips such legacy lines rather than coercing them. Their ids
 * are surfaced separately (`excludedZeroQtyJsonbLineIds`) as evidence.
 *
 * A FIELD_MISMATCH on a reference column (`product_id`, `warehouse_id`,
 * `tax_rate_id`, `original_invoice_line_id`) where the jsonb side has a
 * value and the normalized side is NULL is marked
 * `possiblyExpectedBackfillNull` — the 0042 backfill writes NULL for a
 * reference that does not resolve to a same-company row (exact-only policy),
 * so this specific shape may be an expected historical nulling rather than a
 * projector defect. The reviewer classifies it from the evidence; the
 * checker does not guess.
 */

export type LineParityStatus =
  | 'MATCH'
  | 'MISSING_NORMALIZED_LINE'
  | 'EXTRA_NORMALIZED_LINE'
  | 'FIELD_MISMATCH';

export type DocumentLineParityType = 'invoice' | 'bill' | 'purchase_order' | 'credit_note';

export interface FieldMismatch {
  field: string;
  jsonbValue: unknown;
  normalizedValue: unknown;
  /** True only for a ref column that is set in jsonb but NULL in the projection — see class doc. */
  possiblyExpectedBackfillNull?: boolean;
}

export interface LineParityFinding {
  documentType: DocumentLineParityType;
  documentId: ID;
  companyId: ID | null;
  lineId: ID;
  /** normalized `line_number` when known, else the 1-based jsonb array position. */
  lineNumber: number | null;
  status: Exclude<LineParityStatus, 'MATCH'>;
  fieldMismatches: FieldMismatch[];
  jsonbLine: Record<string, unknown> | null;
  normalizedLine: Record<string, unknown> | null;
}

export interface DocumentTypeParityReport {
  documentType: DocumentLineParityType;
  headerTable: string;
  lineTable: string;
  /** Documents of this type that have ≥1 line in EITHER representation. */
  documentCount: number;
  /** jsonb lines considered (i.e. quantity > 0). */
  jsonbLineCount: number;
  /** Rows in the normalized line table. */
  normalizedLineCount: number;
  matchedLineCount: number;
  /** Document ids whose jsonb line count ≠ normalized line count. */
  documentsWithLineCountMismatch: ID[];
  /** Document ids that have jsonb lines but zero normalized rows. */
  documentsMissingNormalizationEntirely: ID[];
  /** jsonb line ids skipped because quantity ≤ 0 (not counted as MISSING). */
  excludedZeroQtyJsonbLineIds: ID[];
  /** Only non-MATCH findings. */
  findings: LineParityFinding[];
  ok: boolean;
}

export interface DocumentLineParityResult {
  generatedAt: string;
  reports: DocumentTypeParityReport[];
  ok: boolean;
}

interface HeaderRow {
  id: string;
  company_id: string | null;
  line_items: unknown;
}

interface NormalizedRow {
  id: string;
  company_id: string | null;
  line_number: number | null;
  product_id: string | null;
  warehouse_id: string | null;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  tax_rate_id: string | null;
  tax_amount: number | string | null;
  line_total: number | string | null;
  fixed_asset_details?: unknown;
  original_invoice_line_id?: string | null;
  [key: string]: unknown;
}

interface TypeConfig {
  documentType: DocumentLineParityType;
  headerTable: string;
  lineTable: string;
  foreignKeyColumn: string;
  /** Extra per-line fields to compare beyond the common shape. */
  extraFields: {
    /** jsonb key on the line object. */
    jsonbKey: string;
    /** column name on the normalized row. */
    column: string;
    kind: 'ref' | 'json';
  }[];
}

const TYPE_CONFIGS: TypeConfig[] = [
  { documentType: 'invoice', headerTable: 'invoices', lineTable: 'invoice_lines', foreignKeyColumn: 'invoice_id', extraFields: [] },
  {
    documentType: 'bill',
    headerTable: 'bills',
    lineTable: 'bill_lines',
    foreignKeyColumn: 'bill_id',
    extraFields: [{ jsonbKey: 'fixedAssetDetails', column: 'fixed_asset_details', kind: 'json' }],
  },
  {
    documentType: 'purchase_order',
    headerTable: 'purchase_orders',
    lineTable: 'purchase_order_lines',
    foreignKeyColumn: 'purchase_order_id',
    extraFields: [],
  },
  {
    documentType: 'credit_note',
    headerTable: 'credit_notes',
    lineTable: 'credit_note_lines',
    foreignKeyColumn: 'credit_note_id',
    extraFields: [{ jsonbKey: 'originalInvoiceLineId', column: 'original_invoice_line_id', kind: 'ref' }],
  },
];

/** Decimal scale of each numeric column — compare rounded to this. */
const NUMERIC_SCALE: Record<string, number> = {
  quantity: 3,
  unit_price: 4,
  tax_amount: 2,
  line_total: 2,
};

const PAGE_SIZE = 1000;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function numericEqual(a: unknown, b: unknown, scale: number): boolean {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  return roundTo(na, scale) === roundTo(nb, scale);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  const emptyA = a === null || a === undefined;
  const emptyB = b === null || b === undefined;
  if (emptyA && emptyB) return true;
  if (emptyA !== emptyB) return false;
  return stableStringify(a) === stableStringify(b);
}

function refEqual(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

export class DocumentLineParityChecker {
  constructor(private readonly client: SupabaseClient) {}

  /** Run the checker for every document type. Read-only. */
  async check(): Promise<DocumentLineParityResult> {
    const reports: DocumentTypeParityReport[] = [];
    for (const config of TYPE_CONFIGS) {
      reports.push(await this.runType(config));
    }
    return {
      generatedAt: new Date().toISOString(),
      reports,
      ok: reports.every((r) => r.ok),
    };
  }

  /** Run the checker for a single document type. Read-only. */
  async checkType(documentType: DocumentLineParityType): Promise<DocumentTypeParityReport> {
    const config = TYPE_CONFIGS.find((c) => c.documentType === documentType);
    if (!config) throw new Error(`DocumentLineParityChecker: unknown document type "${documentType}"`);
    return this.runType(config);
  }

  private async runType(config: TypeConfig): Promise<DocumentTypeParityReport> {
    const headers = await this.fetchAll<HeaderRow>(config.headerTable, 'id, company_id, line_items');
    const normalizedRows = await this.fetchAll<NormalizedRow>(config.lineTable, '*');

    const normalizedByDocument = new Map<string, NormalizedRow[]>();
    for (const row of normalizedRows) {
      const documentId = String(row[config.foreignKeyColumn] ?? '');
      const list = normalizedByDocument.get(documentId) ?? [];
      list.push(row);
      normalizedByDocument.set(documentId, list);
    }

    const findings: LineParityFinding[] = [];
    const documentsWithLineCountMismatch: ID[] = [];
    const documentsMissingNormalizationEntirely: ID[] = [];
    const excludedZeroQtyJsonbLineIds: ID[] = [];
    let jsonbLineCount = 0;
    let matchedLineCount = 0;
    let documentCount = 0;

    const seenDocuments = new Set<string>();

    for (const header of headers) {
      const rawLines = Array.isArray(header.line_items) ? (header.line_items as Record<string, unknown>[]) : [];
      const consideredJsonb: { line: Record<string, unknown>; position: number }[] = [];
      rawLines.forEach((line, index) => {
        const qty = toNumber(line.quantity) ?? 0;
        if (qty > 0) {
          consideredJsonb.push({ line, position: index + 1 });
        } else if (line.id != null) {
          excludedZeroQtyJsonbLineIds.push(String(line.id));
        }
      });

      const normalized = normalizedByDocument.get(header.id) ?? [];
      if (consideredJsonb.length === 0 && normalized.length === 0) continue;

      seenDocuments.add(header.id);
      documentCount += 1;
      jsonbLineCount += consideredJsonb.length;

      const normalizedById = new Map<string, NormalizedRow>();
      for (const row of normalized) normalizedById.set(String(row.id), row);

      if (consideredJsonb.length > 0 && normalized.length === 0) {
        documentsMissingNormalizationEntirely.push(header.id);
      }
      if (consideredJsonb.length !== normalized.length) {
        documentsWithLineCountMismatch.push(header.id);
      }

      const jsonbIds = new Set(consideredJsonb.map(({ line }) => String(line.id)));

      // jsonb-side walk: MATCH / MISSING_NORMALIZED_LINE / FIELD_MISMATCH
      for (const { line, position } of consideredJsonb) {
        const lineId = String(line.id);
        const normalizedRow = normalizedById.get(lineId);
        if (!normalizedRow) {
          findings.push({
            documentType: config.documentType,
            documentId: header.id,
            companyId: header.company_id,
            lineId,
            lineNumber: position,
            status: 'MISSING_NORMALIZED_LINE',
            fieldMismatches: [],
            jsonbLine: line,
            normalizedLine: null,
          });
          continue;
        }

        const fieldMismatches = this.compareLine(line, normalizedRow, position, config);
        if (fieldMismatches.length === 0) {
          matchedLineCount += 1;
        } else {
          findings.push({
            documentType: config.documentType,
            documentId: header.id,
            companyId: header.company_id,
            lineId,
            lineNumber: normalizedRow.line_number ?? position,
            status: 'FIELD_MISMATCH',
            fieldMismatches,
            jsonbLine: line,
            normalizedLine: normalizedRow,
          });
        }
      }

      // normalized-side walk: EXTRA_NORMALIZED_LINE
      for (const row of normalized) {
        if (!jsonbIds.has(String(row.id))) {
          findings.push({
            documentType: config.documentType,
            documentId: header.id,
            companyId: header.company_id,
            lineId: String(row.id),
            lineNumber: row.line_number ?? null,
            status: 'EXTRA_NORMALIZED_LINE',
            fieldMismatches: [],
            jsonbLine: null,
            normalizedLine: row,
          });
        }
      }
    }

    // Normalized rows whose parent document header does not exist at all.
    for (const [documentId, rows] of normalizedByDocument) {
      if (seenDocuments.has(documentId) || headers.some((h) => h.id === documentId)) continue;
      for (const row of rows) {
        findings.push({
          documentType: config.documentType,
          documentId,
          companyId: row.company_id,
          lineId: String(row.id),
          lineNumber: row.line_number ?? null,
          status: 'EXTRA_NORMALIZED_LINE',
          fieldMismatches: [],
          jsonbLine: null,
          normalizedLine: row,
        });
      }
    }

    return {
      documentType: config.documentType,
      headerTable: config.headerTable,
      lineTable: config.lineTable,
      documentCount,
      jsonbLineCount,
      normalizedLineCount: normalizedRows.length,
      matchedLineCount,
      documentsWithLineCountMismatch,
      documentsMissingNormalizationEntirely,
      excludedZeroQtyJsonbLineIds,
      findings,
      ok: findings.length === 0 && jsonbLineCount === normalizedRows.length,
    };
  }

  private compareLine(
    jsonbLine: Record<string, unknown>,
    normalizedRow: NormalizedRow,
    jsonbPosition: number,
    config: TypeConfig,
  ): FieldMismatch[] {
    const mismatches: FieldMismatch[] = [];

    const push = (field: string, jsonbValue: unknown, normalizedValue: unknown, possiblyExpectedBackfillNull?: boolean) => {
      mismatches.push({ field, jsonbValue, normalizedValue, ...(possiblyExpectedBackfillNull ? { possiblyExpectedBackfillNull } : {}) });
    };

    // line_number — normalized must equal the 1-based jsonb array position
    if ((normalizedRow.line_number ?? null) !== jsonbPosition) {
      push('line_number', jsonbPosition, normalizedRow.line_number ?? null);
    }

    // description — 0042 coalesces a missing description to ''
    const jsonbDescription = jsonbLine.description == null ? '' : String(jsonbLine.description);
    const normalizedDescription = normalizedRow.description == null ? '' : String(normalizedRow.description);
    if (jsonbDescription !== normalizedDescription) {
      push('description', jsonbLine.description ?? '', normalizedRow.description ?? '');
    }

    // numeric columns
    for (const [column, scale] of Object.entries(NUMERIC_SCALE)) {
      const jsonbKey = column === 'unit_price' ? 'unitPrice' : column === 'tax_amount' ? 'taxAmount' : column === 'line_total' ? 'lineTotal' : 'quantity';
      if (!numericEqual(jsonbLine[jsonbKey], normalizedRow[column], scale)) {
        push(column, jsonbLine[jsonbKey] ?? null, normalizedRow[column] ?? null);
      }
    }

    // reference columns common to every type
    const commonRefs: { jsonbKey: string; column: keyof NormalizedRow }[] = [
      { jsonbKey: 'productId', column: 'product_id' },
      { jsonbKey: 'warehouseId', column: 'warehouse_id' },
      { jsonbKey: 'taxRateId', column: 'tax_rate_id' },
    ];
    for (const { jsonbKey, column } of commonRefs) {
      const jsonbValue = jsonbLine[jsonbKey] ?? null;
      const normalizedValue = (normalizedRow[column] as unknown) ?? null;
      if (!refEqual(jsonbValue, normalizedValue)) {
        push(String(column), jsonbValue, normalizedValue, jsonbValue !== null && normalizedValue === null);
      }
    }

    // type-specific extra fields
    for (const extra of config.extraFields) {
      const jsonbValue = jsonbLine[extra.jsonbKey] ?? null;
      const normalizedValue = (normalizedRow[extra.column] as unknown) ?? null;
      if (extra.kind === 'ref') {
        if (!refEqual(jsonbValue, normalizedValue)) {
          push(extra.column, jsonbValue, normalizedValue, jsonbValue !== null && normalizedValue === null);
        }
      } else if (!jsonEqual(jsonbValue, normalizedValue)) {
        push(extra.column, jsonbValue, normalizedValue);
      }
    }

    return mismatches;
  }

  /** Paginated `select *`/projection — READ ONLY. */
  private async fetchAll<T>(table: string, columns: string): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await this.client
        .from(table)
        .select(columns)
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        throw new Error(`DocumentLineParityChecker: failed to read ${table}: ${error.message}`);
      }
      const rows = (data ?? []) as T[];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all;
  }
}

export const DOCUMENT_LINE_PARITY_TYPES: readonly DocumentLineParityType[] = TYPE_CONFIGS.map(
  (c) => c.documentType,
);
