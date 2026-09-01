import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentLineItem, ID } from '@/types';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { NORMALIZED_DOCUMENT_LINES_ENABLED } from '@/config/featureFlags';
import type { IDocumentLineProjector } from './IDocumentLineProjector';

export interface DocumentLineProjectorConfig {
  projectorName: string;
  /** e.g. 'invoice_lines'. */
  lineTable: string;
  /** e.g. 'invoice_id' — the FK column on `lineTable` pointing back at the document. */
  foreignKeyColumn: string;
  /**
   * Document-specific columns beyond the common `DocumentLineItem` shape
   * (e.g. `fixed_asset_details` on bill_lines, `original_invoice_line_id`
   * on credit_note_lines). Returns `{}` for a plain line.
   */
  extraColumns?: (line: DocumentLineItem) => Record<string, unknown>;
}

/**
 * A quantity is projectable iff it resolves to a strictly positive finite
 * number — the exact rule migration 0042's backfill uses
 * (`coalesce(l->>'quantity','0')::numeric > 0`) and the one the normalized
 * tables enforce (`check (quantity > 0)`). A zero / negative / missing /
 * non-numeric quantity belongs to a legacy or non-posting line that the
 * projection simply omits — it is never coerced, and the authoritative
 * jsonb `lineItems` keeps it untouched.
 */
export function isProjectableLineQuantity(quantity: unknown): boolean {
  const n = typeof quantity === 'number' ? quantity : Number(quantity);
  return Number.isFinite(n) && n > 0;
}

/**
 * Replace-on-write projector: `sync(documentId, lines)` deletes every row
 * currently projected for `documentId` and re-inserts the projectable
 * lines — simplest correct behavior for a non-authoritative side table
 * whose source (the jsonb `lineItems`) can change shape completely between
 * drafts. Gated by `NORMALIZED_DOCUMENT_LINES_ENABLED`
 * (src/config/featureFlags.ts) — a no-op while that flag is `false`, so
 * this class is safe to wire into the composition root before migrations
 * 0038-0041 have actually created these tables.
 *
 * Lines with a non-positive quantity are skipped (see
 * {@link isProjectableLineQuantity}), so one such line can never fail the
 * whole document's projection against the `check (quantity > 0)`
 * constraint. `line_number` stays the line's ORIGINAL 1-based position in
 * the jsonb array — matching 0042's `with ordinality` and what
 * `DocumentLineParityChecker` expects — positions are not re-sequenced
 * after a skip.
 */
export class SupabaseDocumentLineProjector implements IDocumentLineProjector {
  private cachedCompanyId: ID | undefined;

  constructor(
    private readonly client: SupabaseClient,
    private readonly config: DocumentLineProjectorConfig,
  ) {}

  async sync(documentId: ID, lines: readonly DocumentLineItem[]): Promise<void> {
    if (!NORMALIZED_DOCUMENT_LINES_ENABLED) return;

    const companyId = await this.resolveCompanyId();
    const { error: deleteError } = await this.client
      .from(this.config.lineTable)
      .delete()
      .eq(this.config.foreignKeyColumn, documentId);
    if (deleteError) {
      throw new Error(`${this.config.projectorName}.sync: failed to clear prior lines: ${deleteError.message}`);
    }

    const rows = lines
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => isProjectableLineQuantity(line.quantity))
      .map(({ line, lineNumber }) => ({
        id: line.id,
        company_id: companyId,
        [this.config.foreignKeyColumn]: documentId,
        line_number: lineNumber,
        product_id: line.productId ?? null,
        warehouse_id: line.warehouseId ?? null,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        tax_rate_id: line.taxRateId ?? null,
        tax_amount: line.taxAmount,
        line_total: line.lineTotal,
        ...(this.config.extraColumns?.(line) ?? {}),
      }));

    if (rows.length === 0) return;

    const { error: insertError } = await this.client.from(this.config.lineTable).insert(rows);
    if (insertError) {
      throw new Error(`${this.config.projectorName}.sync: failed to insert lines: ${insertError.message}`);
    }
  }

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) {
      this.cachedCompanyId = await resolveDefaultCompanyId(this.client, this.config.projectorName);
    }
    return this.cachedCompanyId;
  }
}
