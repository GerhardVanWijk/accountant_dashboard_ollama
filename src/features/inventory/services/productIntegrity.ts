import type { ID } from '@/types';
import type {
  InventoryReconciliationFinding,
  InventoryReconciliationResult,
} from './reconcileInventory';

/**
 * Per-product view over the company-wide `reconcileInventory()` result. This
 * REPRODUCES NO RECONCILIATION MATH — it only slices the engine's findings
 * down to the ones that name a given product (plus the transfer findings for
 * transfers that carry a line for it), and rolls them up into a single
 * status. The engine (`reconcileInventory.ts`) stays the one source of the
 * numbers.
 */

export type ProductIntegrityStatus =
  /** Item is not stock-tracked — no integrity concept applies. */
  | 'not_tracked'
  /** No findings touch this product. */
  | 'reconciled'
  /** Only warnings (rounding residuals, evidence gaps) touch this product. */
  | 'attention'
  /** At least one error-severity finding touches this product. */
  | 'investigate';

export interface ProductIntegritySummary {
  status: ProductIntegrityStatus;
  errorCount: number;
  warningCount: number;
  findings: InventoryReconciliationFinding[];
}

/**
 * The findings from a company reconciliation result that concern `productId`:
 * every finding that names the product directly, plus any
 * orphan/duplicate-transfer finding whose transfer reference is in
 * `transferRefsForProduct` (built by the caller from the transfer line items —
 * the engine result does not carry per-line product data).
 */
export function selectProductFindings(
  result: Pick<InventoryReconciliationResult, 'findings'>,
  productId: ID,
  transferRefsForProduct: ReadonlySet<string> = new Set(),
): InventoryReconciliationFinding[] {
  return result.findings.filter((f) => {
    if (f.productId === productId) return true;
    if (
      (f.code === 'orphan_in_transit' || f.code === 'duplicate_transfer_receipt') &&
      f.transferRef != null
    ) {
      return transferRefsForProduct.has(f.transferRef);
    }
    return false;
  });
}

export function summarizeProductIntegrity(
  findings: InventoryReconciliationFinding[],
  isTracked: boolean,
): ProductIntegritySummary {
  if (!isTracked) {
    return { status: 'not_tracked', errorCount: 0, warningCount: 0, findings: [] };
  }
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const status: ProductIntegrityStatus =
    errorCount > 0 ? 'investigate' : warningCount > 0 ? 'attention' : 'reconciled';
  return { status, errorCount, warningCount, findings };
}

/** One-line label for a status — used by the workspace header pill and the Overview integrity block. */
export const PRODUCT_INTEGRITY_LABEL: Record<ProductIntegrityStatus, string> = {
  not_tracked: 'Not stock-tracked',
  reconciled: 'Reconciled',
  attention: 'Review recommended',
  investigate: 'Investigation required',
};
