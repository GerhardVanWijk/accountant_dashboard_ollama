import type { StockMovement } from '@/types';
import { isOpaqueReference, type ResolvedSourceDocument } from '@/components/app/record-page';
import type { MovementAccounting } from '../services/movementAccounting';
import type { StockMovementResolvers } from '../hooks/useStockMovementResolvers';

export interface MovementEvidenceContext {
  movement: StockMovement;
  /** Resolved source document (human number + route). */
  source?: ResolvedSourceDocument;
  /** Accounting trace — journal link, inventory + contra account, posting key. */
  accounting?: MovementAccounting;
  /** Customer / supplier behind the movement, already resolved. */
  party?: string;
  warehouseName: string;
  /** For a transfer leg: the other side of the move. */
  counterpartWarehouseName?: string;
  /** Running on-hand quantity after this movement, when the history is contiguous. */
  runningQuantity?: number;
  /** The product's current weighted-average cost (for context alongside the historical unit cost). */
  currentWac?: number;
  /** True when this movement has no structured source link and no resolvable reference. */
  missingEvidence?: boolean;
  /** Product name/SKU — shown on the global movements page where the row is not product-scoped. */
  productLabel?: string;
}

/** True when a movement has neither a structured source link nor a usable free-text reference. */
export function hasNoSourceEvidence(m: StockMovement): boolean {
  if (m.sourceDocumentType && m.sourceDocumentId) return false;
  return isOpaqueReference(m.reference);
}

/**
 * Assemble the full evidence context for a movement from the shared
 * resolvers. `extra` supplies view-specific bits: the running on-hand
 * quantity after the movement (only where a contiguous history makes it
 * derivable) and the product's current WAC.
 */
export function buildMovementEvidenceContext(
  m: StockMovement,
  resolvers: Pick<
    StockMovementResolvers,
    'resolveSource' | 'resolveAccounting' | 'resolveParty' | 'warehouseName' | 'transfers' | 'productName' | 'productSku'
  >,
  extra: { runningQuantity?: number; currentWac?: number; showProductLabel?: boolean } = {},
): MovementEvidenceContext {
  let counterpartWarehouseName: string | undefined;
  if ((m.type === 'transfer_in' || m.type === 'transfer_out') && m.sourceDocumentId) {
    const t = resolvers.transfers.find((tr) => tr.id === m.sourceDocumentId);
    if (t) {
      counterpartWarehouseName = resolvers.warehouseName(
        m.type === 'transfer_out' ? t.toWarehouseId : t.fromWarehouseId,
      );
    }
  }
  const sku = resolvers.productSku(m.productId);
  return {
    movement: m,
    source: resolvers.resolveSource(m),
    accounting: resolvers.resolveAccounting(m),
    party: resolvers.resolveParty(m),
    warehouseName: resolvers.warehouseName(m.warehouseId),
    counterpartWarehouseName,
    runningQuantity: extra.runningQuantity,
    currentWac: extra.currentWac,
    missingEvidence: hasNoSourceEvidence(m),
    productLabel: extra.showProductLabel
      ? `${resolvers.productName(m.productId)}${sku ? ` · ${sku}` : ''}`
      : undefined,
  };
}
