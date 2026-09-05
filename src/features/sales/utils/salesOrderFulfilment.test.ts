import { describe, expect, it } from 'vitest';
import type { DeliveryNote, DeliveryNoteLineItem, DocumentLineItem, Invoice, ReturnNote, ReturnNoteLineItem, SalesOrder } from '@/types';
import {
  buildInvoiceFromSelections,
  canCloseRemaining,
  computeSalesOrderFulfilment,
  displayFulfilmentStatus,
  displayInvoicingStatus,
  fullRemainingSelections,
  invoiceableSalesOrderLines,
  isFullyInvoiced,
  isFullyPostedInvoiced,
  isPostedDeliveryNoteStatus,
  isPostedInvoiceStatus,
  isPostedReturnNoteStatus,
  isValidSelectionQuantity,
  sumDeliveredBySalesOrderLine,
  sumDirectlyInvoicedBySalesOrderLine,
  sumInvoicedBySalesOrderLine,
  sumPhysicallyIssuedBySalesOrderLine,
  sumReturnedBySalesOrderLine,
} from './salesOrderFulfilment';

function soLine(overrides: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return { id: `sol_${Math.random().toString(36).slice(2, 8)}`, description: 'Item', quantity: 1, unitPrice: 100, taxAmount: 15, lineTotal: 100, ...overrides };
}

function order(lineItems: DocumentLineItem[], overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'so_1',
    orderNumber: 'SO-1',
    customerId: 'cust_1',
    orderDate: '2026-09-01',
    lineItems,
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    currency: 'ZAR',
    status: 'confirmed',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function invoice(lineItems: DocumentLineItem[], overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: `inv_${Math.random().toString(36).slice(2, 8)}`,
    invoiceNumber: 'INV-1',
    customerId: 'cust_1',
    salesOrderId: 'so_1',
    issueDate: '2026-09-05',
    dueDate: '2026-10-05',
    lineItems,
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('isPostedInvoiceStatus', () => {
  it('true for sent / partially_paid / paid / overdue, false for draft / void', () => {
    expect(isPostedInvoiceStatus('sent')).toBe(true);
    expect(isPostedInvoiceStatus('partially_paid')).toBe(true);
    expect(isPostedInvoiceStatus('paid')).toBe(true);
    expect(isPostedInvoiceStatus('overdue')).toBe(true);
    expect(isPostedInvoiceStatus('draft')).toBe(false);
    expect(isPostedInvoiceStatus('void')).toBe(false);
  });
});

describe('sumInvoicedBySalesOrderLine', () => {
  it('groups by salesOrderLineId, ignores lines with none', () => {
    const invs = [
      invoice([soLine({ salesOrderLineId: 'A', quantity: 3 }), soLine({ quantity: 9 })]),
      invoice([soLine({ salesOrderLineId: 'A', quantity: 2 }), soLine({ salesOrderLineId: 'B', quantity: 5 })]),
    ];
    const map = sumInvoicedBySalesOrderLine(invs, () => true);
    expect(map.get('A')).toBe(5);
    expect(map.get('B')).toBe(5);
    expect(map.size).toBe(2);
  });
});

describe('computeSalesOrderFulfilment', () => {
  it('confirmed SO, no invoices -> not invoiced, full remaining', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    const f = computeSalesOrderFulfilment(so, []);
    expect(f.postedFulfilledQty).toBe(0);
    expect(f.remainingToInvoiceQty).toBe(10);
    expect(f.remainingToFulfilQty).toBe(10);
    expect(f.invoicingStatus).toBe('not_invoiced');
    expect(f.fulfilmentStatus).toBe('not_fulfilled');
    expect(f.hasLineLevelEvidence).toBe(false);
  });

  it('draft invoice does not count as fulfilled but reduces remainingToInvoice', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    const f = computeSalesOrderFulfilment(so, [invoice([soLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'draft' })]);
    expect(f.postedFulfilledQty).toBe(0);
    expect(f.draftInvoicedQty).toBe(4);
    expect(f.remainingToFulfilQty).toBe(10);
    expect(f.remainingToInvoiceQty).toBe(6);
    expect(f.invoicingStatus).toBe('not_invoiced');
  });

  it('posted partial invoice -> partially_invoiced, correct remaining', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    const f = computeSalesOrderFulfilment(so, [invoice([soLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'sent' })]);
    expect(f.postedFulfilledQty).toBe(4);
    expect(f.remainingToFulfilQty).toBe(6);
    expect(f.remainingToInvoiceQty).toBe(6);
    expect(f.invoicingStatus).toBe('partially_invoiced');
    expect(f.fulfilmentStatus).toBe('partially_fulfilled');
    expect(f.hasLineLevelEvidence).toBe(true);
  });

  it('successive posted invoices -> fully invoiced at the end', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    const invs = [
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'sent' }),
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 3 })], { status: 'paid' }),
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 3 })], { status: 'partially_paid' }),
    ];
    const f = computeSalesOrderFulfilment(so, invs);
    expect(f.postedFulfilledQty).toBe(10);
    expect(f.remainingToFulfilQty).toBe(0);
    expect(f.invoicingStatus).toBe('fully_invoiced');
    expect(f.fulfilmentStatus).toBe('fulfilled');
  });

  it('void invoice is excluded from every figure', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    const f = computeSalesOrderFulfilment(so, [invoice([soLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'void' })]);
    expect(f.postedFulfilledQty).toBe(0);
    expect(f.relatedInvoiceIds).toHaveLength(0);
  });

  it('multi-line SO tracks each line independently', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 }), soLine({ id: 'L2', quantity: 5 })]);
    const f = computeSalesOrderFulfilment(so, [
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 10 })], { status: 'sent' }),
    ]);
    expect(f.lines[0].remainingToInvoiceQty).toBe(0);
    expect(f.lines[1].remainingToInvoiceQty).toBe(5);
    expect(f.invoicingStatus).toBe('partially_invoiced');
  });

  it('over-invoiced line is flagged but remaining floors at 0', () => {
    const so = order([soLine({ id: 'L1', quantity: 5 })]);
    const f = computeSalesOrderFulfilment(so, [invoice([soLine({ salesOrderLineId: 'L1', quantity: 8 })], { status: 'sent' })]);
    expect(f.lines[0].overFulfilled).toBe(true);
    expect(f.lines[0].remainingToFulfilQty).toBe(0);
    expect(f.remainingToInvoiceQty).toBe(0);
  });

  it('legacy conversion (invoice with no line links) -> hasLineLevelEvidence false, legacy id captured', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })], { status: 'fulfilled' });
    const legacy = invoice([soLine({ quantity: 10 })], { status: 'paid' });
    const f = computeSalesOrderFulfilment(so, [legacy]);
    expect(f.hasLineLevelEvidence).toBe(false);
    expect(f.legacyLinkedInvoiceIds).toEqual([legacy.id]);
    // raw derived value is honest (0), display helper tolerates legacy
    expect(f.invoicingStatus).toBe('not_invoiced');
    expect(displayInvoicingStatus(so, f)).toBe('fully_invoiced');
    expect(displayFulfilmentStatus(so, f)).toBe('fulfilled');
  });
});

describe('invoiceableSalesOrderLines', () => {
  it('returns full remaining when nothing invoiced', () => {
    const so = order([soLine({ id: 'L1', quantity: 10, lineTotal: 1000, taxAmount: 150 })]);
    const parts = invoiceableSalesOrderLines(so, []);
    expect(parts).toHaveLength(1);
    expect(parts[0].quantity).toBe(10);
    expect(parts[0].lineTotal).toBe(1000);
    expect(parts[0].taxAmount).toBe(150);
  });

  it('counts BOTH draft and posted linked invoices as already taken, scales totals for the remainder', () => {
    const so = order([soLine({ id: 'L1', quantity: 10, lineTotal: 1000, taxAmount: 150 })]);
    const invs = [
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'sent' }),
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 2 })], { status: 'draft' }),
    ];
    const parts = invoiceableSalesOrderLines(so, invs);
    expect(parts).toHaveLength(1);
    expect(parts[0].quantity).toBe(4);
    expect(parts[0].lineTotal).toBeCloseTo(400, 2);
    expect(parts[0].taxAmount).toBeCloseTo(60, 2);
  });

  it('returns [] when every line is fully taken', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    const parts = invoiceableSalesOrderLines(so, [invoice([soLine({ salesOrderLineId: 'L1', quantity: 10 })], { status: 'draft' })]);
    expect(parts).toHaveLength(0);
  });

  it('skips a service line with no product but keeps a priced service line', () => {
    const so = order([soLine({ id: 'L1', quantity: 0 }), soLine({ id: 'L2', productId: undefined, quantity: 2, lineTotal: 500, taxAmount: 75 })]);
    const parts = invoiceableSalesOrderLines(so, []);
    expect(parts.map((p) => p.salesOrderLineId)).toEqual(['L2']);
  });
});

describe('isFullyInvoiced', () => {
  it('false with no linked invoices', () => {
    expect(isFullyInvoiced(order([soLine({ id: 'L1', quantity: 5 })]), [])).toBe(false);
  });
  it('true once draft + posted cover every line', () => {
    const so = order([soLine({ id: 'L1', quantity: 5 }), soLine({ id: 'L2', quantity: 3 })]);
    const invs = [
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 5 })], { status: 'sent' }),
      invoice([soLine({ salesOrderLineId: 'L2', quantity: 3 })], { status: 'draft' }),
    ];
    expect(isFullyInvoiced(so, invs)).toBe(true);
  });
});

describe('isFullyPostedInvoiced (drives the stored-status flip)', () => {
  it('false when a draft covers the shortfall — only POSTED counts', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    expect(isFullyPostedInvoiced(so, [invoice([soLine({ salesOrderLineId: 'L1', quantity: 10 })], { status: 'draft' })])).toBe(false);
  });
  it('true once POSTED invoices cover every line', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 })]);
    const invs = [
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'paid' }),
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 6 })], { status: 'sent' }),
    ];
    expect(isFullyPostedInvoiced(so, invs)).toBe(true);
  });
});

describe('canCloseRemaining', () => {
  const partly = { postedFulfilledQty: 4, remainingToFulfilQty: 6 };
  it('true for a confirmed, partly-POSTED-invoiced order with an un-invoiced remainder', () => {
    expect(canCloseRemaining({ status: 'confirmed' }, partly)).toBe(true);
  });
  it('false when the started invoicing is only a DRAFT (post it or delete it first)', () => {
    expect(canCloseRemaining({ status: 'confirmed' }, { postedFulfilledQty: 0, remainingToFulfilQty: 10 })).toBe(false);
  });
  it('false for a confirmed order with NOTHING invoiced (cancel it instead)', () => {
    expect(canCloseRemaining({ status: 'confirmed' }, { postedFulfilledQty: 0, remainingToFulfilQty: 10 })).toBe(false);
  });
  it('false when there is no remainder left (it is effectively fulfilled)', () => {
    expect(canCloseRemaining({ status: 'confirmed' }, { postedFulfilledQty: 10, remainingToFulfilQty: 0 })).toBe(false);
  });
  it.each(['pending', 'fulfilled', 'closed', 'cancelled'] as const)('false for a %s order', (status) => {
    expect(canCloseRemaining({ status }, partly)).toBe(false);
  });
});

describe('isValidSelectionQuantity', () => {
  it.each([
    [2, true], [0.5, true], [1.125, true],
    [0, false], [-3, false], [Number.NaN, false], [Infinity, false],
    [1.2345, false], ['2', false], [null, false], [undefined, false],
  ])('%s -> %s', (q, expected) => {
    expect(isValidSelectionQuantity(q)).toBe(expected);
  });
});

describe('fullRemainingSelections', () => {
  it('one entry per line with remaining > 0, quantity = remainingToInvoiceQty', () => {
    const so = order([soLine({ id: 'L1', quantity: 10 }), soLine({ id: 'L2', quantity: 5 }), soLine({ id: 'L3', quantity: 3 })]);
    const invs = [
      invoice([soLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'sent' }),   // posted
      invoice([soLine({ salesOrderLineId: 'L2', quantity: 5 })], { status: 'draft' }),  // draft covers L2
    ];
    const sel = fullRemainingSelections(so, invs);
    expect(sel).toEqual([
      { salesOrderLineId: 'L1', quantity: 6 },
      { salesOrderLineId: 'L3', quantity: 3 },
    ]);
  });
});

describe('buildInvoiceFromSelections', () => {
  const so = () =>
    order([
      soLine({ id: 'L1', productId: 'p1', warehouseId: 'wh1', description: 'Printer', quantity: 10, unitPrice: 2000, taxRateId: 'v15', taxAmount: 3000, lineTotal: 20000 }),
      soLine({ id: 'L2', productId: 'p2', description: 'Paper', quantity: 50, unitPrice: 100, taxRateId: 'v15', taxAmount: 750, lineTotal: 5000 }),
      soLine({ id: 'L3', description: 'Service', quantity: 1, unitPrice: 500, taxRateId: 'v15', taxAmount: 75, lineTotal: 500 }),
    ]);

  it('builds parts from the authoritative SO line, recomputes partial totals + VAT', () => {
    const built = buildInvoiceFromSelections(so(), [], [
      { salesOrderLineId: 'L1', quantity: 3 },
      { salesOrderLineId: 'L2', quantity: 10 },
    ]);
    expect(built.parts).toHaveLength(2);
    const p1 = built.parts.find((p) => p.salesOrderLineId === 'L1')!;
    expect(p1.source.productId).toBe('p1');
    expect(p1.quantity).toBe(3);
    expect(p1.lineTotal).toBeCloseTo(6000, 2);
    expect(p1.taxAmount).toBeCloseTo(900, 2); // 6000 * 15%
    expect(built.subtotal).toBeCloseTo(7000, 2);
    expect(built.taxTotal).toBeCloseTo(1050, 2);
    expect(built.total).toBeCloseTo(8050, 2);
  });

  it('billing the WHOLE line preserves the SO line total/tax exactly (no ratio drift)', () => {
    const built = buildInvoiceFromSelections(so(), [], [{ salesOrderLineId: 'L1', quantity: 10 }]);
    expect(built.parts[0].lineTotal).toBe(20000);
    expect(built.parts[0].taxAmount).toBe(3000);
  });

  it('fractional-cent rounding: 3 @ 33.33 with 15% VAT', () => {
    const o = order([soLine({ id: 'X', quantity: 9, unitPrice: 33.33, taxAmount: 44.99, lineTotal: 299.97 })]);
    const built = buildInvoiceFromSelections(o, [], [{ salesOrderLineId: 'X', quantity: 3 }]);
    expect(built.parts[0].lineTotal).toBeCloseTo(99.99, 2);
    expect(built.parts[0].taxAmount).toBeCloseTo(15.0, 2); // 99.99 * (44.99/299.97) ≈ 15.00
  });

  it('re-derives remaining from CURRENT invoices (stale selection rejected)', () => {
    const invs = [invoice([soLine({ salesOrderLineId: 'L1', quantity: 8 })], { status: 'sent' })];
    expect(() => buildInvoiceFromSelections(so(), invs, [{ salesOrderLineId: 'L1', quantity: 6 }])).toThrow(/only 2 remain/i);
    expect(buildInvoiceFromSelections(so(), invs, [{ salesOrderLineId: 'L1', quantity: 2 }]).parts[0].quantity).toBe(2);
  });

  it('draft quantities are counted as taken (no double-drafting)', () => {
    const invs = [invoice([soLine({ salesOrderLineId: 'L1', quantity: 6 })], { status: 'draft' })];
    expect(() => buildInvoiceFromSelections(so(), invs, [{ salesOrderLineId: 'L1', quantity: 5 }])).toThrow(/only 4 remain/i);
  });

  it.each([
    [[{ salesOrderLineId: 'L1', quantity: 0 }], /greater than zero/i],
    [[{ salesOrderLineId: 'L1', quantity: -2 }], /greater than zero/i],
    [[{ salesOrderLineId: 'L1', quantity: Number.NaN }], /must be a number/i],
    [[{ salesOrderLineId: 'L1', quantity: 1.2345 }], /decimal places/i],
    [[{ salesOrderLineId: 'L1', quantity: 11 }], /only 10 remain/i],
    [[{ salesOrderLineId: 'L1', quantity: 1 }, { salesOrderLineId: 'L1', quantity: 1 }], /more than once/i],
    [[{ salesOrderLineId: 'ZZZ', quantity: 1 }], /not on sales order/i],
    [[], /at least one line/i],
  ])('rejects %j', (sel, re) => {
    expect(() => buildInvoiceFromSelections(so(), [], sel)).toThrow(re);
  });

  it('rejects a cancelled order and a legacy full-conversion', () => {
    expect(() => buildInvoiceFromSelections({ ...so(), status: 'cancelled' }, [], [{ salesOrderLineId: 'L1', quantity: 1 }])).toThrow(/cancelled/i);
    const legacyInv = invoice([soLine({ quantity: 10 })], { status: 'sent', invoiceNumber: 'INV-OLD' });
    expect(() => buildInvoiceFromSelections(so(), [legacyInv], [{ salesOrderLineId: 'L1', quantity: 1 }])).toThrow(/already converted to invoice INV-OLD/i);
  });

  it('rejects a legacy fulfilled order with no line-level evidence', () => {
    expect(() =>
      buildInvoiceFromSelections({ ...order([soLine({ id: 'L1', quantity: 5 })]), status: 'fulfilled' }, [], [{ salesOrderLineId: 'L1', quantity: 1 }]),
    ).toThrow(/already been fulfilled/i);
  });

  it('rejects a closed order', () => {
    expect(() =>
      buildInvoiceFromSelections({ ...so(), status: 'closed' }, [], [{ salesOrderLineId: 'L1', quantity: 1 }]),
    ).toThrow(/closed/i);
  });

  it('a non-inventory line (no productId) is invoiceable', () => {
    const built = buildInvoiceFromSelections(so(), [], [{ salesOrderLineId: 'L3', quantity: 1 }]);
    expect(built.parts[0].source.productId).toBeUndefined();
    expect(built.total).toBeCloseTo(575, 2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 5C — Delivery Notes (docs/DELIVERY_NOTES_DESIGN.md Part 8). These
// mirror the CP-5C-A hardening's 18-scenario formal proof
// (deliveryNotesMigrations.test.ts), but exercise the ACTUAL TypeScript
// implementation `computeSalesOrderFulfilment` uses in the app, not a
// reimplemented formula — closing the gap between "proven on paper" and
// "proven in the real code path".
// ────────────────────────────────────────────────────────────────────────────

function dnLine(overrides: Partial<DeliveryNoteLineItem> = {}): DeliveryNoteLineItem {
  return {
    id: `dnl_${Math.random().toString(36).slice(2, 8)}`,
    salesOrderLineId: 'L1',
    productId: 'p1',
    description: 'Item',
    quantity: 1,
    unitPrice: 100,
    taxAmount: 15,
    lineTotal: 100,
    ...overrides,
  };
}

function deliveryNote(lineItems: DeliveryNoteLineItem[], overrides: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: `dn_${Math.random().toString(36).slice(2, 8)}`,
    deliveryNoteNumber: 'DN-1',
    salesOrderId: 'so_1',
    customerId: 'cust_1',
    warehouseId: 'wh_1',
    deliveryDate: '2026-09-05',
    status: 'posted',
    lineItems,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('isPostedDeliveryNoteStatus', () => {
  it('true only for posted', () => {
    expect(isPostedDeliveryNoteStatus('posted')).toBe(true);
    expect(isPostedDeliveryNoteStatus('draft')).toBe(false);
    expect(isPostedDeliveryNoteStatus('cancelled')).toBe(false);
  });
});

describe('sumDeliveredBySalesOrderLine', () => {
  it('sums posted DN line qty per SO line; drafts/cancelled excluded by the predicate', () => {
    const dns = [
      deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 4 })], { status: 'posted' }),
      deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 3 })], { status: 'posted' }),
      deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 99 })], { status: 'draft' }),
    ];
    const map = sumDeliveredBySalesOrderLine(dns, (dn) => isPostedDeliveryNoteStatus(dn.status));
    expect(map.get('L1')).toBe(7);
  });
});

describe('sumDirectlyInvoicedBySalesOrderLine', () => {
  it('excludes any invoice line carrying deliveryNoteLineId — the double-subtraction guard', () => {
    const invoices = [
      invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4 })]),
      invoice([soLine({ id: 'i2', salesOrderLineId: 'L1', quantity: 6, deliveryNoteLineId: 'dnl_1' })]),
    ];
    const map = sumDirectlyInvoicedBySalesOrderLine(invoices, (i) => isPostedInvoiceStatus(i.status));
    expect(map.get('L1')).toBe(4); // the delivery-linked 6 is excluded
  });

  it('a legacy (pre-5C) invoice line with no deliveryNoteLineId key at all counts as direct', () => {
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4 })])];
    const map = sumDirectlyInvoicedBySalesOrderLine(invoices, (i) => isPostedInvoiceStatus(i.status));
    expect(map.get('L1')).toBe(4);
  });
});

describe('sumPhysicallyIssuedBySalesOrderLine', () => {
  it('= deliveredQty + directlyInvoicedQty, never double-counting a delivery-linked invoice', () => {
    const dns = [deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 7 })])];
    const invoices = [
      invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4, deliveryNoteLineId: 'dnl_x' })]), // invoicing the delivery — must NOT add again
      invoice([soLine({ id: 'i2', salesOrderLineId: 'L1', quantity: 3 })]), // direct
    ];
    const map = sumPhysicallyIssuedBySalesOrderLine(invoices, dns);
    expect(map.get('L1')).toBe(10); // 7 delivered + 3 direct, NOT 7 + 4 + 3
  });

  it('reduces to plain posted-invoice qty when no Delivery Note has ever been posted', () => {
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 6 })])];
    const withNoDn = sumPhysicallyIssuedBySalesOrderLine(invoices, []);
    const legacy = sumInvoicedBySalesOrderLine(invoices, (i) => isPostedInvoiceStatus(i.status));
    expect(withNoDn.get('L1')).toBe(legacy.get('L1'));
  });
});

describe('computeSalesOrderFulfilment — Phase 5C delivery-aware fields', () => {
  function so10() {
    return order([soLine({ id: 'L1', productId: 'p1', quantity: 10, unitPrice: 100, lineTotal: 1000, taxAmount: 150 })]);
  }

  it('1. ordered 10, delivered 0, direct 0 → remainingToDeliver 10', () => {
    const f = computeSalesOrderFulfilment(so10(), [], []);
    expect(f.lines[0].remainingToDeliver).toBe(10);
  });

  it('2/3. ordered 10, delivered 6 → remainingToDeliver 4 (allow 4, would reject 10)', () => {
    const dns = [deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 6 })])];
    const f = computeSalesOrderFulfilment(so10(), [], dns);
    expect(f.lines[0].deliveredQty).toBe(6);
    expect(f.lines[0].remainingToDeliver).toBe(4);
  });

  it('5. ordered 10, delivered 6, direct 4 → remainingToDeliver 0', () => {
    const dns = [deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 6 })])];
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4 })])];
    const f = computeSalesOrderFulfilment(so10(), invoices, dns);
    expect(f.lines[0].remainingToDeliver).toBe(0);
  });

  it('8. ordered 10, DN 4, invoice-from-DN 4 (posted) → remainingToDeliver 6, remainingToInvoiceQty 6', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 4 })])];
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4, deliveryNoteLineId: 'dnl_1' })])];
    const f = computeSalesOrderFulfilment(so10(), invoices, dns);
    expect(f.lines[0].remainingToDeliver).toBe(6);
    expect(f.lines[0].remainingToInvoiceQty).toBe(6);
    // (they coincide numerically here — scenario 9 below proves they are
    // independently derived and CAN diverge; remainingToInvoiceQty is never
    // computed FROM remainingToDeliver or vice versa)
  });

  it('9. ordered 10, DN 7, invoice-from-DN 4 → remainingToDeliver 3, remainingToInvoiceQty 6', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 7 })])];
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4, deliveryNoteLineId: 'dnl_1' })])];
    const f = computeSalesOrderFulfilment(so10(), invoices, dns);
    expect(f.lines[0].remainingToDeliver).toBe(3);
    expect(f.lines[0].remainingToInvoiceQty).toBe(6);
  });

  it("10/11. ordered 10, direct invoice 4 (posted) → remainingToDeliver 6 — legacy invoices (no deliveryNoteLineId key) behave IDENTICALLY", () => {
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4 })])];
    const f = computeSalesOrderFulfilment(so10(), invoices, []);
    expect(f.lines[0].remainingToDeliver).toBe(6);
    expect(f.lines[0].remainingToInvoiceQty).toBe(6);
  });

  it('12. a draft invoice never counts as physical fulfilment', () => {
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 6 })], { status: 'draft' })];
    const f = computeSalesOrderFulfilment(so10(), invoices, []);
    expect(f.lines[0].deliveredQty).toBe(0);
    expect(f.lines[0].directlyInvoicedQty).toBe(0);
    expect(f.lines[0].remainingToDeliver).toBe(10);
  });

  it('13. a draft Delivery Note never counts as physical fulfilment', () => {
    const dns = [deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 6 })], { status: 'draft' })];
    const f = computeSalesOrderFulfilment(so10(), [], dns);
    expect(f.lines[0].deliveredQty).toBe(0);
    expect(f.lines[0].remainingToDeliver).toBe(10);
  });

  it('backward compatibility: computeSalesOrderFulfilment(order, invoices) with NO third argument is byte-identical to passing []', () => {
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4 })])];
    const withDefault = computeSalesOrderFulfilment(so10(), invoices);
    const withEmpty = computeSalesOrderFulfilment(so10(), invoices, []);
    expect(withDefault).toEqual(withEmpty);
  });

  it('18. a delivered-and-invoiced quantity is never double counted at the aggregate level either', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 7 })])];
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4, deliveryNoteLineId: 'dnl_1' })])];
    const f = computeSalesOrderFulfilment(so10(), invoices, dns);
    expect(f.physicalFulfilledQty).toBe(7); // NOT 7 + 4 = 11
    expect(f.deliveredQty).toBe(7);
    expect(f.directlyInvoicedQty).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 5D — Return Note netting (completion-run stabilization, Part 1)
// ────────────────────────────────────────────────────────────────────────────

function rnLine(overrides: Partial<ReturnNoteLineItem> = {}): ReturnNoteLineItem {
  return {
    id: `rnl_${Math.random().toString(36).slice(2, 8)}`,
    deliveryNoteLineId: 'dnl_1',
    salesOrderLineId: 'L1',
    productId: 'p1',
    description: 'Item',
    quantity: 1,
    unitCost: 80,
    unitPrice: 100,
    taxAmount: 15,
    lineTotal: 100,
    ...overrides,
  };
}

function returnNote(lineItems: ReturnNoteLineItem[], overrides: Partial<ReturnNote> = {}): ReturnNote {
  return {
    id: `rn_${Math.random().toString(36).slice(2, 8)}`,
    returnNoteNumber: 'RN-1',
    deliveryNoteId: 'dn_1',
    salesOrderId: 'so_1',
    customerId: 'cust_1',
    warehouseId: 'wh_1',
    returnDate: '2026-09-05',
    status: 'posted',
    lineItems,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('isPostedReturnNoteStatus', () => {
  it('true only for posted', () => {
    expect(isPostedReturnNoteStatus('posted')).toBe(true);
    expect(isPostedReturnNoteStatus('draft')).toBe(false);
    expect(isPostedReturnNoteStatus('cancelled')).toBe(false);
  });
});

describe('sumReturnedBySalesOrderLine', () => {
  it('sums posted RN line qty per SO line; drafts/cancelled excluded by the predicate', () => {
    const rns = [
      returnNote([rnLine({ salesOrderLineId: 'L1', quantity: 2 })]),
      returnNote([rnLine({ salesOrderLineId: 'L1', quantity: 1 })]),
      returnNote([rnLine({ salesOrderLineId: 'L1', quantity: 99 })], { status: 'draft' }),
    ];
    const map = sumReturnedBySalesOrderLine(rns, (rn) => isPostedReturnNoteStatus(rn.status));
    expect(map.get('L1')).toBe(3);
  });
});

describe('sumPhysicallyIssuedBySalesOrderLine — Return Note netting', () => {
  it('nets a posted return out of deliveredQty before adding directlyInvoicedQty', () => {
    const dns = [deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 6 })])];
    const rns = [returnNote([rnLine({ salesOrderLineId: 'L1', quantity: 2 })])];
    const map = sumPhysicallyIssuedBySalesOrderLine([], dns, rns);
    expect(map.get('L1')).toBe(4); // 6 delivered - 2 returned
  });

  it('never goes negative even if returns somehow exceed delivered for the map (defensive floor)', () => {
    const dns = [deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 2 })])];
    const rns = [returnNote([rnLine({ salesOrderLineId: 'L1', quantity: 5 })])];
    const map = sumPhysicallyIssuedBySalesOrderLine([], dns, rns);
    expect(map.get('L1')).toBe(0);
  });

  it('reduces to the pre-5D formula exactly when no Return Note has ever been posted', () => {
    const dns = [deliveryNote([dnLine({ salesOrderLineId: 'L1', quantity: 6 })])];
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 3 })])];
    const withReturns = sumPhysicallyIssuedBySalesOrderLine(invoices, dns, []);
    const withoutParam = sumPhysicallyIssuedBySalesOrderLine(invoices, dns);
    expect(withReturns).toEqual(withoutParam);
  });
});

describe('computeSalesOrderFulfilment — Phase 5D Return Note worked examples (brief Part 1)', () => {
  function so10() {
    return order([soLine({ id: 'L1', productId: 'p1', quantity: 10, unitPrice: 100, lineTotal: 1000, taxAmount: 150 })]);
  }

  it('SO 10, DN 6, RN returns 2 uninvoiced → net delivered 4, remaining 6, committed 6', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 6 })])];
    const rns = [returnNote([rnLine({ deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', quantity: 2 })])];
    const f = computeSalesOrderFulfilment(so10(), [], dns, rns);
    expect(f.lines[0].deliveredQty).toBe(6);
    expect(f.lines[0].returnedQty).toBe(2);
    expect(f.lines[0].netDeliveredQty).toBe(4);
    expect(f.lines[0].physicalFulfilledQty).toBe(4);
    expect(f.lines[0].remainingToDeliver).toBe(6);
  });

  it('same scenario, then a second DN delivers 6 more → net physical fulfilled 10, remaining 0', () => {
    const dns = [
      deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 6 })]),
      deliveryNote([dnLine({ id: 'dnl_2', salesOrderLineId: 'L1', quantity: 6 })]),
    ];
    const rns = [returnNote([rnLine({ deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', quantity: 2 })])];
    const f = computeSalesOrderFulfilment(so10(), [], dns, rns);
    expect(f.lines[0].deliveredQty).toBe(12); // 6 + 6, gross
    expect(f.lines[0].returnedQty).toBe(2);
    expect(f.lines[0].netDeliveredQty).toBe(10); // 12 - 2, NOT clamped by ordered here — physicalFulfilledQty below does the clamping via remainingToDeliver
    expect(f.lines[0].physicalFulfilledQty).toBe(10);
    expect(f.lines[0].remainingToDeliver).toBe(0);
  });

  it('interaction with direct invoicing: ordered 10, delivered 6, returned 2 uninvoiced, directly invoiced 3 → physical fulfilled 7, remaining 3, no double counting', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 6 })])];
    const rns = [returnNote([rnLine({ deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', quantity: 2 })])];
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 3 })])]; // direct, no deliveryNoteLineId
    const f = computeSalesOrderFulfilment(so10(), invoices, dns, rns);
    expect(f.lines[0].netDeliveredQty).toBe(4);
    expect(f.lines[0].directlyInvoicedQty).toBe(3);
    expect(f.lines[0].physicalFulfilledQty).toBe(7);
    expect(f.lines[0].remainingToDeliver).toBe(3);
  });

  it('a return note does NOT alter invoiced quantity — remainingToInvoiceQty is untouched by a return', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 6 })])];
    const invoices = [invoice([soLine({ id: 'i1', salesOrderLineId: 'L1', quantity: 4, deliveryNoteLineId: 'dnl_1' })])];
    const noReturn = computeSalesOrderFulfilment(so10(), invoices, dns, []);
    const rns = [returnNote([rnLine({ deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', quantity: 2 })])];
    const withReturn = computeSalesOrderFulfilment(so10(), invoices, dns, rns);
    expect(withReturn.lines[0].remainingToInvoiceQty).toBe(noReturn.lines[0].remainingToInvoiceQty);
    expect(withReturn.lines[0].postedFulfilledQty).toBe(noReturn.lines[0].postedFulfilledQty);
  });

  it('a draft Return Note never nets into remainingToDeliver', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 6 })])];
    const rns = [returnNote([rnLine({ deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', quantity: 2 })], { status: 'draft' })];
    const f = computeSalesOrderFulfilment(so10(), [], dns, rns);
    expect(f.lines[0].returnedQty).toBe(0);
    expect(f.lines[0].remainingToDeliver).toBe(4);
  });

  it('backward compatibility: computeSalesOrderFulfilment(order, invoices, deliveryNotes) with NO fourth argument is byte-identical to passing []', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 6 })])];
    const withDefault = computeSalesOrderFulfilment(so10(), [], dns);
    const withEmpty = computeSalesOrderFulfilment(so10(), [], dns, []);
    expect(withDefault).toEqual(withEmpty);
  });

  it('a Return Note against a DIFFERENT sales order is ignored (company/order scoping)', () => {
    const dns = [deliveryNote([dnLine({ id: 'dnl_1', salesOrderLineId: 'L1', quantity: 6 })])];
    const rns = [returnNote([rnLine({ deliveryNoteLineId: 'dnl_x', salesOrderLineId: 'L1', quantity: 2 })], { salesOrderId: 'so_other' })];
    const f = computeSalesOrderFulfilment(so10(), [], dns, rns);
    expect(f.lines[0].returnedQty).toBe(0);
    expect(f.lines[0].remainingToDeliver).toBe(4);
  });
});
