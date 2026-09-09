import type { ID, StockMovement, StockMovementSourceType } from '@/types';

/**
 * The per-movement accounting trace shown in the evidence drawer — journal
 * number/link, the inventory GL account and its contra, the engine posting
 * key and reversal evidence. Presentational data only; built by
 * `resolveMovementAccounting()` from the loaded documents + journal entries.
 */
export interface MovementAccounting {
  journalNumber?: string;
  journalEntryId?: string;
  /** The inventoryPostingEngine idempotency key, e.g. `invoice:<id>:post`. */
  postingKey?: string;
  /** Always the inventory asset account, "1200 Inventory". */
  inventoryAccount: string;
  /** COGS / GRNI / Inventory Adjustment / PPV, depending on the movement type. */
  contraAccount?: string;
  /** One line of plain English on the inventory ↔ contra relationship (COGS/AP/AR). */
  contraRelationship?: string;
  isReversal?: boolean;
}

/** Engine posting-key suffix per source type (matches the *Service postingKey conventions). */
export const POSTING_KEY_SUFFIX: Partial<Record<StockMovementSourceType, string>> = {
  invoice: 'post',
  bill: 'post',
  credit_note: 'issue',
  stock_adjustment: 'post',
  stock_take: 'post',
  supplier_return: 'post',
  opening_stock_batch: 'post',
  delivery_note: 'post',
};

/** The inventory-side contra account + a one-line relationship note, keyed by movement type. */
export const MOVEMENT_CONTRA: Record<
  StockMovement['type'],
  { contra?: string; relationship?: string }
> = {
  goods_received: {
    contra: '2050 Goods Received Not Invoiced → 2000 Accounts Payable',
    relationship: 'Stock in at cost; the offsetting credit is GRNI, cleared to Accounts Payable when the bill posts.',
  },
  purchase_return: {
    contra: '2000 Accounts Payable / 5060 Purchase Price Variance',
    relationship: 'Stock out at WAC; supplier credit vs carrying cost lands in Purchase Price Variance.',
  },
  sale: {
    contra: '5000 Cost of Goods Sold',
    relationship: 'COGS recognised on this issue; the AR / Sales / VAT-output legs are on the same journal entry.',
  },
  sales_return: {
    contra: '5000 Cost of Goods Sold',
    relationship: 'Stock back in at WAC; COGS is reversed against the credit note.',
  },
  transfer_in: { contra: '1210 Inventory in Transit', relationship: 'Inter-warehouse move; no P&L effect.' },
  transfer_out: { contra: '1210 Inventory in Transit', relationship: 'Inter-warehouse move; no P&L effect.' },
  adjustment: { contra: '5050 Inventory Adjustments', relationship: 'Physical stock difference expensed / credited to Inventory Adjustments.' },
  write_off: { contra: '5050 Inventory Adjustments', relationship: 'Stock written off to Inventory Adjustments.' },
  stock_gain: { contra: '5050 Inventory Adjustments', relationship: 'Stock gain credited to Inventory Adjustments.' },
  stock_take: { contra: '5050 Inventory Adjustments', relationship: 'Net count variance posted to Inventory Adjustments.' },
  correction: { contra: '5050 Inventory Adjustments', relationship: 'Correcting movement.' },
  opening: { contra: '3950 Opening Balance Equity', relationship: 'Opening stock brought in against Opening Balance Equity.' },
  delivery: {
    contra: '1220 Goods Delivered Not Invoiced',
    relationship: 'Stock out at frozen WAC; the offsetting debit is 1220, cleared to COGS when the linked invoice posts. No revenue, VAT or AR at this point.',
  },
};

export interface MovementAccountingContext {
  /** `sourceDocumentId` → the journal entry it posted. */
  journalEntryIdBySource: Map<string, ID>;
  /** journal entry id → its human number. */
  journalNumberById: Map<string, string>;
}

/**
 * The accounting trace for a single stock movement — its journal entry (id +
 * number), the inventory GL account + contra, the engine posting key and
 * reversal evidence. Pure. Returns `undefined` only when the movement type
 * genuinely does not post and nothing is linked.
 */
export function resolveMovementAccounting(
  m: StockMovement,
  ctx: MovementAccountingContext,
): MovementAccounting | undefined {
  const meta = MOVEMENT_CONTRA[m.type];
  const jeId = m.sourceDocumentId ? ctx.journalEntryIdBySource.get(m.sourceDocumentId) : undefined;
  const journalNumber = jeId ? ctx.journalNumberById.get(jeId) : undefined;
  let postingKey: string | undefined;
  if (m.sourceDocumentType && m.sourceDocumentId) {
    if (m.sourceDocumentType === 'stock_transfer') {
      postingKey = `stock_transfer:${m.sourceDocumentId}:${m.type === 'transfer_out' ? 'dispatch' : 'receive'}`;
    } else {
      const suffix = POSTING_KEY_SUFFIX[m.sourceDocumentType];
      postingKey = suffix ? `${m.sourceDocumentType}:${m.sourceDocumentId}:${suffix}` : undefined;
    }
  }
  if (!jeId && !postingKey && !meta.contra) return undefined;
  return {
    journalEntryId: jeId,
    journalNumber,
    postingKey,
    inventoryAccount: '1200 Inventory',
    contraAccount: meta.contra,
    contraRelationship: meta.relationship,
    isReversal: m.type === 'correction' || Boolean(m.reversalOfMovementId),
  };
}
