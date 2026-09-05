import type { ID, Product, StockBalance, StockMovement } from '@/types';
import type { AccountMapper } from '@/features/accounting/services/accountMappingService';
import { roundAfterSumValuation, roundMoney } from './inventoryValuation';

/**
 * The minimal GL surface reconciliation needs: the posted running balance of a
 * control account. `journalEntryService` satisfies this; a test fake need only
 * return the final running balance. (Matches `subledgerReconciliation.ts`.)
 */
export interface ControlAccountLedger {
  getAccountLedger(accountId: ID): Promise<ReadonlyArray<{ runningBalance: number }>>;
}

/**
 * The programmatic inventory reconciliation ENGINE (Review 3B, items 18-19).
 * Phase 14 adds the Difference-Investigator UI over this result; the engine
 * itself is not deferred.
 *
 * Every number uses the ONE valuation contract — ROUND AFTER SUM — from
 * `inventoryValuation.ts`. Findings name the exact product / warehouse /
 * document / movement / journal, with expected vs actual vs difference.
 */

export interface InventoryReconciliationFinding {
  code:
    | 'balance_cache_drift'
    | 'product_quantity_drift'
    | 'movement_missing_source'
    | 'negative_stock'
    | 'subledger_vs_gl'
    | 'in_transit_vs_gl'
    | 'total_inventory_vs_gl'
    | 'missing_cogs_movement'
    | 'orphan_in_transit'
    | 'duplicate_transfer_receipt';
  severity: 'error' | 'warning' | 'info';
  productId?: ID;
  productSku?: string;
  warehouseId?: ID;
  movementId?: ID;
  journalEntryId?: ID;
  documentRef?: string;
  /** Transfer reference (source_document_id / reference) the transit finding is about. */
  transferRef?: string;
  expected: number;
  actual: number;
  difference: number;
  /** The largest difference that would still be treated as a rounding residual (subledger/GL checks only). */
  toleranceBound?: number;
  detail: string;
}

export interface InventoryReconciliationResult {
  /** ROUND-AFTER-SUM Σ (companyQtyOnHand × costPrice) over tracked products — the inventory subledger valuation. */
  subledgerValuation: number;
  /** Posted balance of the Inventory Asset control account (1200). */
  inventoryGlBalance: number;
  /** subledgerValuation − inventoryGlBalance. */
  subledgerVsGl: number;
  /** Value of stock sitting in `transfer_out` legs not yet received (the in-transit subledger). */
  inTransitValuation: number;
  /** Posted balance of Inventory in Transit (1210). */
  inTransitGlBalance: number;
  inTransitVsGl: number;
  /** (subledgerValuation + inTransitValuation) vs (1200 + 1210). */
  totalInventoryVsGl: number;
  isReconciled: boolean;
  findings: InventoryReconciliationFinding[];
}

const EPSILON = 0.005;

async function controlBalance(
  journalEntryService: ControlAccountLedger,
  accountId: ID,
): Promise<number> {
  const rows = await journalEntryService.getAccountLedger(accountId);
  return rows.length > 0 ? rows[rows.length - 1].runningBalance : 0;
}

export interface ReconcileInventoryInput {
  products: Product[];
  stockBalances: StockBalance[];
  stockMovements: StockMovement[];
  /** Free-text `reference` / structured `source_document_*` values that DO resolve to a real posted document (built by the caller from invoices/bills/adjustments/…). Used only for the movement-evidence check. */
  knownDocumentRefs?: Set<string>;
}

export async function reconcileInventory(
  input: ReconcileInventoryInput,
  accounts: AccountMapper,
  journalEntryService: ControlAccountLedger,
): Promise<InventoryReconciliationResult> {
  const { products, stockBalances, stockMovements } = input;
  const tracked = products.filter((p) => p.trackInventory);
  const productById = new Map(products.map((p) => [p.id, p]));
  const findings: InventoryReconciliationFinding[] = [];

  // ── A. movement ledger quantity  vs  stock_balances quantity  (per product/warehouse) ──
  const ledgerByKey = new Map<string, number>();
  for (const m of stockMovements) {
    const key = `${m.productId}::${m.warehouseId}`;
    ledgerByKey.set(key, (ledgerByKey.get(key) ?? 0) + m.quantityDelta);
  }
  const balanceByKey = new Map<string, StockBalance>();
  for (const b of stockBalances) balanceByKey.set(`${b.productId}::${b.warehouseId}`, b);

  const allKeys = new Set<string>([...ledgerByKey.keys(), ...balanceByKey.keys()]);
  for (const key of allKeys) {
    const [productId, warehouseId] = key.split('::');
    const ledgerQty = roundQty(ledgerByKey.get(key) ?? 0);
    const balanceQty = roundQty(balanceByKey.get(key)?.quantityOnHand ?? 0);
    if (Math.abs(ledgerQty - balanceQty) > EPSILON) {
      findings.push({
        code: 'balance_cache_drift',
        severity: 'error',
        productId,
        productSku: productById.get(productId)?.sku,
        warehouseId,
        expected: ledgerQty,
        actual: balanceQty,
        difference: roundQty(balanceQty - ledgerQty),
        detail: `stock_balances quantity_on_hand (${balanceQty}) ≠ Σ stock_movements.quantity_delta (${ledgerQty}) for this product/warehouse.`,
      });
    }
    if (balanceQty < -EPSILON) {
      findings.push({
        code: 'negative_stock',
        severity: 'warning',
        productId,
        productSku: productById.get(productId)?.sku,
        warehouseId,
        expected: 0,
        actual: balanceQty,
        difference: balanceQty,
        detail: `Negative on-hand quantity (${balanceQty}). Allowed under weighted-average costing but flagged for review.`,
      });
    }
  }

  // ── B. Σ stock_balances by product  vs  products.quantity_on_hand ──
  const balanceSumByProduct = new Map<ID, number>();
  for (const b of stockBalances) {
    balanceSumByProduct.set(b.productId, (balanceSumByProduct.get(b.productId) ?? 0) + b.quantityOnHand);
  }
  for (const p of tracked) {
    const balSum = roundQty(balanceSumByProduct.get(p.id) ?? 0);
    const scalar = roundQty(p.quantityOnHand);
    if (Math.abs(balSum - scalar) > EPSILON) {
      findings.push({
        code: 'product_quantity_drift',
        severity: 'error',
        productId: p.id,
        productSku: p.sku,
        expected: balSum,
        actual: scalar,
        difference: roundQty(scalar - balSum),
        detail: `products.quantity_on_hand (${scalar}) ≠ Σ stock_balances.quantity_on_hand (${balSum}).`,
      });
    }
  }

  // ── C. inventory subledger valuation  vs  Inventory Asset GL (1200) ──
  // The subledger is round-after-sum `round(Σ qty×cost, 2)` (ONE rounding of
  // the grand total). GL 1200 is the running sum of each POSTING's inventory
  // journal line, and — as of migration 0035 — each of those lines is itself
  // `round(Σ raw line, 2)` for that posting (round-after-sum WITHIN the
  // posting). So GL 1200 = Σ over inventory-affecting postings of a
  // per-posting-rounded amount, vs the subledger's single rounding of the
  // whole. They differ by at most ±0.005 PER inventory-affecting posting
  // (journal entry) — NOT per movement (0035 collapsed a document's same-account
  // lines into one rounding). A healthy deterministic book with no multi-line
  // roundable postings reconciles to EXACTLY R0.00 (Office National today:
  // R0.00). A difference inside the band is a genuine rounding residual —
  // reported with expected / actual / difference / bound, never hidden (spec
  // item 8), never coerced to zero, but not a books-integrity ERROR. A
  // difference OUTSIDE the band means something is actually wrong (a mis-posted
  // entry, a manual GL journal, data corruption).
  const inventoryAffecting = stockMovements.filter(
    (m) => m.type !== 'transfer_out' && m.type !== 'transfer_in',
  );
  const inventoryPostingCount = new Set(
    inventoryAffecting.map(
      (m) =>
        (m.sourceDocumentType && m.sourceDocumentId
          ? `${m.sourceDocumentType}:${m.sourceDocumentId}`
          : m.reference) || m.id,
    ),
  ).size;
  const roundingBand = Math.max(EPSILON, roundMoney(0.005 * inventoryPostingCount));
  const subledgerValuation = roundAfterSumValuation(
    tracked.map((p) => ({ quantity: p.quantityOnHand, unitCost: p.costPrice })),
  );
  const inventoryGlBalance = roundMoney(await controlBalance(journalEntryService, await accounts.getAccountId('INVENTORY')));
  const subledgerVsGl = roundMoney(subledgerValuation - inventoryGlBalance);
  if (Math.abs(subledgerVsGl) > EPSILON) {
    const isResidual = Math.abs(subledgerVsGl) <= roundingBand;
    findings.push({
      code: 'subledger_vs_gl',
      severity: isResidual ? 'warning' : 'error',
      expected: subledgerValuation,
      actual: inventoryGlBalance,
      difference: subledgerVsGl,
      toleranceBound: roundingBand,
      detail: isResidual
        ? `Rounding residual. Expected (subledger round-after-sum Σ qty×cost) ${subledgerValuation}; actual (Inventory Asset GL 1200) ${inventoryGlBalance}; difference ${subledgerVsGl}; allowed theoretical bound ±${roundingBand} (0.005 × ${inventoryPostingCount} inventory-affecting postings). Reported, not hidden; not a books-integrity error.`
        : `Expected (subledger round-after-sum Σ qty×cost) ${subledgerValuation}; actual (Inventory Asset GL 1200) ${inventoryGlBalance}; difference ${subledgerVsGl} EXCEEDS the ±${roundingBand} rounding bound — investigate (mis-posted entry, manual GL journal, or data corruption).`,
    });
  }

  // ── D. in-transit valuation  vs  Inventory in Transit GL (1210) ──
  // In-transit is NOT `Σ transfer_out − Σ transfer_in` by reference: a
  // `correction` movement (reversal_of_movement_id set) that undoes a
  // dispatch or a receipt must be folded into the EFFECTIVE movement set.
  //
  //   dispatch only                        → in transit  (net > 0)
  //   dispatch + receipt                   → 0
  //   dispatch + reversal(dispatch)        → 0
  //   dispatch + receipt + reversal(receipt) → back in transit (net > 0)
  //   two receipts for one dispatch (duplicate) → net < 0  → INVALID
  //   receipt with no dispatch (orphan)         → net < 0  → INVALID
  //
  // A `correction` of a `transfer_out` contributes −(original value); a
  // `correction` of a `transfer_in` contributes +(original value). The
  // transfer a movement belongs to is keyed by source_document_id (or the
  // free-text reference) — for a correction, that of the movement it reverses.
  const movementById = new Map(stockMovements.map((m) => [m.id, m]));
  const transferKey = (m: StockMovement): string =>
    (m.sourceDocumentId ? String(m.sourceDocumentId) : undefined) ?? m.reference ?? m.id;

  const transitByTransfer = new Map<string, number>(); // transferRef -> net value still out
  for (const m of stockMovements) {
    const value = m.totalCost ?? 0;
    if (m.type === 'transfer_out') {
      transitByTransfer.set(transferKey(m), (transitByTransfer.get(transferKey(m)) ?? 0) + value);
    } else if (m.type === 'transfer_in') {
      transitByTransfer.set(transferKey(m), (transitByTransfer.get(transferKey(m)) ?? 0) - value);
    } else if (m.type === 'correction' && m.reversalOfMovementId) {
      const original = movementById.get(m.reversalOfMovementId);
      if (!original) continue;
      const key = transferKey(original);
      if (original.type === 'transfer_out') {
        transitByTransfer.set(key, (transitByTransfer.get(key) ?? 0) - (original.totalCost ?? 0));
      } else if (original.type === 'transfer_in') {
        transitByTransfer.set(key, (transitByTransfer.get(key) ?? 0) + (original.totalCost ?? 0));
      }
    }
  }

  let inTransitValuation = 0;
  for (const [ref, net] of transitByTransfer) {
    if (net > EPSILON) {
      inTransitValuation = roundMoney(inTransitValuation + net);
    } else if (net < -EPSILON) {
      // more received/returned than ever dispatched — a duplicate transfer
      // receipt or an orphan receipt with no matching dispatch.
      const hasDispatch = stockMovements.some(
        (m) => m.type === 'transfer_out' && transferKey(m) === ref,
      );
      findings.push({
        code: hasDispatch ? 'duplicate_transfer_receipt' : 'orphan_in_transit',
        severity: 'error',
        transferRef: ref,
        expected: 0,
        actual: roundMoney(net),
        difference: roundMoney(net),
        detail: hasDispatch
          ? `Transfer "${ref}" has received/returned ${roundMoney(-net)} more than it dispatched — a duplicate transfer receipt.`
          : `Transfer receipt for "${ref}" has no matching dispatch (transfer_out) — an orphan receipt worth ${roundMoney(-net)}.`,
      });
    }
  }
  inTransitValuation = roundMoney(inTransitValuation);

  let inTransitGlBalance = 0;
  try {
    inTransitGlBalance = roundMoney(
      await controlBalance(journalEntryService, await accounts.getAccountId('INVENTORY_IN_TRANSIT')),
    );
  } catch {
    inTransitGlBalance = 0; // account may not exist for older companies
  }
  const inTransitVsGl = roundMoney(inTransitValuation - inTransitGlBalance);
  if (Math.abs(inTransitVsGl) > EPSILON) {
    findings.push({
      code: 'in_transit_vs_gl',
      severity: inTransitValuation === 0 && inTransitGlBalance === 0 ? 'info' : 'error',
      expected: inTransitValuation,
      actual: inTransitGlBalance,
      difference: inTransitVsGl,
      detail: `In-transit subledger (effective transfer_out − transfer_in − reversals = ${inTransitValuation}) ≠ Inventory in Transit GL 1210 (${inTransitGlBalance}).`,
    });
  }

  // ── E. total controlled inventory ──
  const totalInventoryVsGl = roundMoney(
    subledgerValuation + inTransitValuation - (inventoryGlBalance + inTransitGlBalance),
  );
  if (Math.abs(totalInventoryVsGl) > EPSILON) {
    const isResidual = Math.abs(totalInventoryVsGl) <= roundingBand;
    findings.push({
      code: 'total_inventory_vs_gl',
      severity: isResidual ? 'warning' : 'error',
      expected: roundMoney(subledgerValuation + inTransitValuation),
      actual: roundMoney(inventoryGlBalance + inTransitGlBalance),
      difference: totalInventoryVsGl,
      toleranceBound: roundingBand,
      detail: isResidual
        ? `Rounding residual. Expected (warehouse ${subledgerValuation} + in-transit ${inTransitValuation}) ${roundMoney(subledgerValuation + inTransitValuation)}; actual (GL 1200+1210) ${roundMoney(inventoryGlBalance + inTransitGlBalance)}; difference ${totalInventoryVsGl}; allowed theoretical bound ±${roundingBand}. Reported, not hidden; not a books-integrity error.`
        : `Expected (warehouse ${subledgerValuation} + in-transit ${inTransitValuation}) ${roundMoney(subledgerValuation + inTransitValuation)}; actual (GL 1200+1210) ${roundMoney(inventoryGlBalance + inTransitGlBalance)}; difference ${totalInventoryVsGl} EXCEEDS the ±${roundingBand} rounding bound — investigate.`,
    });
  }

  // ── F. movement source-evidence completeness (rules BY movement type) ──
  // There is no blanket "adjustments / corrections are exempt" rule. Every
  // movement must be explainable; what counts as evidence depends on the type:
  //
  //   document-generated (goods_received, sale, sales_return, purchase_return,
  //     transfer_in, transfer_out, write_off, stock_gain, stock_take,
  //     adjustment): require source_document_type + source_document_id, and —
  //     where a normalized line always exists — source_document_line_id.
  //   correction / reversal: require reversal_of_movement_id AND source
  //     evidence (structured link or a resolvable reference).
  //   opening: the ONE documented exception — a legitimate opening movement
  //     may predate the opening_stock_batch workflow (Office National's was a
  //     hand-seeded SQL journal). Require an opening_stock_batch link OR a
  //     resolvable reference OR an OPENING-style reference; otherwise flag.
  const known = input.knownDocumentRefs;
  if (known) {
    const LINE_ID_REQUIRED = new Set<string>([
      'goods_received',
      'sale',
      'sales_return',
      'purchase_return',
      'transfer_in',
      'transfer_out',
      'write_off',
      'stock_gain',
      'stock_take',
      'adjustment',
      // Phase 5C: a 'delivery' movement always has a real DeliveryNoteLineItem
      // behind it (post_delivery_note builds one engine line per delivery
      // note line) — held to the same evidence standard as every other
      // document-generated movement type.
      'delivery',
    ]);
    for (const m of stockMovements) {
      const ref = m.reference ?? '';
      const hasStructured = Boolean(m.sourceDocumentType && m.sourceDocumentId);
      const refResolves = ref !== '' && known.has(ref);
      const base = {
        productId: m.productId,
        productSku: productById.get(m.productId)?.sku,
        movementId: m.id,
        documentRef: ref || undefined,
        expected: 0,
        actual: 0,
        difference: 0,
      } as const;

      if (m.type === 'correction') {
        if (!m.reversalOfMovementId) {
          findings.push({
            ...base,
            code: 'movement_missing_source',
            severity: 'warning',
            detail: `Correction/reversal movement ${m.id} has no reversal_of_movement_id — it cannot be traced to the movement it reverses.`,
          });
        } else if (!hasStructured && !refResolves) {
          findings.push({
            ...base,
            code: 'movement_missing_source',
            severity: 'warning',
            detail: `Correction movement ${m.id} reverses ${m.reversalOfMovementId} but has neither a structured source_document link nor a resolvable reference.`,
          });
        }
        continue;
      }

      if (m.type === 'opening') {
        const openingRef = /opening/i.test(ref);
        if (!hasStructured && !refResolves && !openingRef) {
          findings.push({
            ...base,
            code: 'movement_missing_source',
            severity: 'warning',
            detail: `Opening movement ${m.id} has no opening_stock_batch link, no resolvable reference, and no OPENING-style reference. A legitimate pre-workflow opening should still carry an "OPENING" reference.`,
          });
        }
        continue;
      }

      // Every other type is document-generated.
      if (!hasStructured && !refResolves) {
        findings.push({
          ...base,
          code: 'movement_missing_source',
          severity: 'warning',
          detail: `Document-generated movement of type "${m.type}" (${m.id}) has neither a structured source_document link (type + id) nor a resolvable reference.`,
        });
        continue;
      }
      if (LINE_ID_REQUIRED.has(m.type) && hasStructured && !m.sourceDocumentLineId) {
        findings.push({
          ...base,
          code: 'movement_missing_source',
          severity: 'warning',
          detail: `Movement of type "${m.type}" (${m.id}) is linked to ${m.sourceDocumentType} ${m.sourceDocumentId} but carries no source_document_line_id, though a normalized line always exists for this type.`,
        });
      }
    }
  }

  const isReconciled = !findings.some((f) => f.severity === 'error');
  return {
    subledgerValuation,
    inventoryGlBalance,
    subledgerVsGl,
    inTransitValuation,
    inTransitGlBalance,
    inTransitVsGl,
    totalInventoryVsGl,
    isReconciled,
    findings,
  };
}

function roundQty(v: number): number {
  return Math.round((v + Number.EPSILON) * 1000) / 1000;
}
