/**
 * The ONE authoritative inventory valuation + weighted-average-cost contract
 * for the whole module (Review 3B). Every consumer — the posting engine's
 * fake executor, `reconcileInventory()`, inventory reports, GL comparisons,
 * and tests — uses these functions. The live Postgres RPC
 * `post_inventory_transaction` (migration 0031) implements the identical rules
 * in exact `numeric` arithmetic.
 *
 * ── Precision ────────────────────────────────────────────────────────────
 * quantity   : 3 dp  (DB `numeric(14,3)`)
 * unit cost  : 4 dp  (DB `numeric(14,4)`)  — the weighted-average cost
 * money / GL : 2 dp  (DB `numeric(14,2)`)
 *
 * All arithmetic here is done in **scaled integers** (BigInt) so JS binary
 * floating point can never introduce monetary drift, then converted back at
 * the boundary. Rounding is half-away-from-zero, matching Postgres `round()`.
 *
 * ── Valuation rule: ROUND AFTER SUM ──────────────────────────────────────
 * Inventory value = round( Σ (quantity × unit_cost) , 2 ).
 * NOT Σ round(quantity × unit_cost, 2). The two differ by rounding noise
 * (Office National: R1,569,743.20 vs R1,569,743.22). `.20` — round-after-sum —
 * is authoritative and ties to GL 1200.
 */

const QTY_SCALE = 1_000n; // 3 dp
const COST_SCALE = 10_000n; // 4 dp
const MONEY_SCALE = 100n; // 2 dp
/** quantity(3dp) × cost(4dp) lands at 10^-7; this is the intermediate scale. */
const PRODUCT_SCALE = QTY_SCALE * COST_SCALE; // 10^7

function toScaledInt(value: number, scale: bigint): bigint {
  // Round the input to the target scale first (inputs are already rounded
  // decimals from the DB; this only absorbs float representation error).
  const scaled = value * Number(scale);
  return BigInt(Math.round(scaled));
}

/** Half-away-from-zero division of scaled integers, returning a scaled integer at `outScale`. */
function divRound(numerator: bigint, denominator: bigint, outScale: bigint): bigint {
  if (denominator === 0n) throw new Error('inventoryValuation: division by zero');
  const scaledNum = numerator * outScale;
  const q = scaledNum / denominator;
  const r = scaledNum % denominator;
  const twiceR = (r < 0n ? -r : r) * 2n;
  const absDen = denominator < 0n ? -denominator : denominator;
  if (twiceR >= absDen) return q + (scaledNum < 0n === denominator < 0n ? 1n : -1n);
  return q;
}

function divRoundSameSign(numerator: bigint, denominator: bigint): bigint {
  const q = numerator / denominator;
  const r = numerator % denominator;
  const twiceR = (r < 0n ? -r : r) * 2n;
  if (twiceR >= denominator) return q + (numerator < 0n ? -1n : 1n);
  return q;
}

/** `round(value, 2)` — half-away-from-zero, the money house rule. */
export function roundMoney(value: number): number {
  const asMoney = toScaledInt(value, MONEY_SCALE);
  return Number(asMoney) / Number(MONEY_SCALE);
}

/** `round(value, 4)` — the unit-cost house rule. */
export function roundCost(value: number): number {
  const asCost = toScaledInt(value, COST_SCALE);
  return Number(asCost) / Number(COST_SCALE);
}

/**
 * New weighted-average cost after a stock-IN event at a real acquisition cost
 * (a purchase receipt, or opening stock). Company-wide quantity is used because
 * `products.cost_price` is one company-wide number.
 *
 *   newWac = (oldQty × oldWac + receivedQty × receivedUnitCost) / (oldQty + receivedQty)
 *
 * Edge cases:
 *  - newQty ≤ 0  → keep `oldWac` (cannot blend into nothing).
 *  - oldQty ≤ 0  → newWac = `receivedUnitCost` (no meaningful base to blend
 *    into; standard practice is "latest cost").
 *  - receivedQty ≤ 0 → not a receipt; returns `oldWac` unchanged.
 */
export function newWeightedAverageCost(
  oldQty: number,
  oldWac: number,
  receivedQty: number,
  receivedUnitCost: number,
): number {
  if (receivedQty <= 0) return roundCost(oldWac);
  const oq = toScaledInt(oldQty, QTY_SCALE);
  const ow = toScaledInt(oldWac, COST_SCALE);
  const rq = toScaledInt(receivedQty, QTY_SCALE);
  const rc = toScaledInt(receivedUnitCost, COST_SCALE);
  const newQ = oq + rq;
  if (newQ <= 0n) return roundCost(oldWac);
  if (oq <= 0n) return roundCost(receivedUnitCost);
  // oldValue and receivedValue are at scale QTY_SCALE×COST_SCALE (10^7).
  const totalValue = oq * ow + rq * rc;
  // totalValue / newQ where newQ is at QTY_SCALE, asking for a COST_SCALE result:
  //   (totalValue / 10^7) / (newQ / 10^3) × 10^4  ==  totalValue / newQ  (scales cancel)
  const newWacScaled = divRound(totalValue, newQ, 1n);
  return Number(newWacScaled) / Number(COST_SCALE);
}

/**
 * `|quantity| × unitCost` at full 10^-7 precision — NOT rounded. This is the
 * raw per-line contribution that feeds the per-account ROUND-AFTER-SUM journal
 * aggregation: the sum of these across a document's lines for one account is
 * rounded to cents exactly once (migration 0035 keeps the identical value in
 * NUMERIC and rounds `sum()` per account). Never use this for a standalone
 * movement value — that is `lineValue`.
 */
export function rawLineValue(quantity: number, unitCost: number): number {
  const q = toScaledInt(quantity < 0 ? -quantity : quantity, QTY_SCALE);
  const c = toScaledInt(unitCost, COST_SCALE);
  return Number(q * c) / Number(PRODUCT_SCALE);
}

/** The value of `quantity` units at `unitCost`, rounded to cents (per-line — used for a single journal line). */
export function lineValue(quantity: number, unitCost: number): number {
  const q = toScaledInt(quantity < 0 ? -quantity : quantity, QTY_SCALE);
  const c = toScaledInt(unitCost, COST_SCALE);
  const product = q * c; // scale 10^7
  const cents = divRoundSameSign(product, PRODUCT_SCALE / MONEY_SCALE); // → scale 100
  return Number(cents) / Number(MONEY_SCALE);
}

export interface ValuationInput {
  quantity: number;
  unitCost: number;
}

/**
 * ROUND-AFTER-SUM inventory valuation. `round( Σ (quantity × unitCost) , 2 )`.
 * The intermediate sum is kept at full 10^-7 precision; only the final total
 * is rounded to cents.
 */
export function roundAfterSumValuation(lines: ValuationInput[]): number {
  let acc = 0n; // scale 10^7
  for (const l of lines) {
    const q = toScaledInt(l.quantity, QTY_SCALE);
    const c = toScaledInt(l.unitCost, COST_SCALE);
    acc += q * c;
  }
  const cents = divRoundSameSign(acc, PRODUCT_SCALE / MONEY_SCALE);
  return Number(cents) / Number(MONEY_SCALE);
}

/** `sum` of already-2dp money values, exact (no float drift). */
export function sumMoney(values: number[]): number {
  let acc = 0n;
  for (const v of values) acc += toScaledInt(v, MONEY_SCALE);
  return Number(acc) / Number(MONEY_SCALE);
}
