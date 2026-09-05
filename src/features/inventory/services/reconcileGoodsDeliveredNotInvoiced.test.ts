import { describe, expect, it } from 'vitest';
import type { DeliveryNote, DeliveryNoteLineItem, DocumentLineItem, Invoice, Product, ReturnNote, ReturnNoteLineItem, StockMovement } from '@/types';
import { reconcileGoodsDeliveredNotInvoiced, type ControlAccountLedger } from './reconcileGoodsDeliveredNotInvoiced';

function dnLine(overrides: Partial<DeliveryNoteLineItem> = {}): DeliveryNoteLineItem {
  return { id: 'dnl_1', salesOrderLineId: 'sol_1', productId: 'p1', description: 'Printer', quantity: 4, unitPrice: 5750, taxAmount: 0, lineTotal: 0, ...overrides };
}

function deliveryNote(overrides: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: 'dn_1', deliveryNoteNumber: 'DN-1', salesOrderId: 'so_1', customerId: 'cust_1', warehouseId: 'wh_1',
    deliveryDate: '2026-09-05', status: 'posted', lineItems: [dnLine()], createdAt: '', updatedAt: '', ...overrides,
  };
}

function invoiceLine(overrides: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return { id: 'il_1', description: 'Printer', quantity: 0, unitPrice: 5750, taxAmount: 0, lineTotal: 0, ...overrides };
}

function invoice(lineItems: DocumentLineItem[], overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_1', invoiceNumber: 'INV-1', customerId: 'cust_1', issueDate: '2026-09-06', dueDate: '2026-10-06',
    lineItems, subtotal: 0, taxTotal: 0, total: 0, amountPaid: 0, currency: 'ZAR', status: 'sent', createdAt: '', updatedAt: '', ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'mv_1', productId: 'p1', warehouseId: 'wh_1', type: 'delivery', quantityDelta: -4, unitCost: 3200, totalCost: 12800,
    sourceDocumentType: 'delivery_note', sourceDocumentId: 'dn_1', sourceDocumentLineId: 'dnl_1', createdAt: '', updatedAt: '', ...overrides,
  };
}

function returnNoteLine(overrides: Partial<ReturnNoteLineItem> = {}): ReturnNoteLineItem {
  return { id: 'rnl_1', deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'sol_1', productId: 'p1', description: 'Printer', quantity: 1, unitCost: 3200, unitPrice: 5750, taxAmount: 0, lineTotal: 0, ...overrides };
}

function returnNote(overrides: Partial<ReturnNote> = {}): ReturnNote {
  return {
    id: 'rn_1', returnNoteNumber: 'RN-1', deliveryNoteId: 'dn_1', salesOrderId: 'so_1', customerId: 'cust_1', warehouseId: 'wh_1',
    returnDate: '2026-09-06', status: 'posted', lineItems: [returnNoteLine()], createdAt: '', updatedAt: '', ...overrides,
  };
}

const PRODUCT: Product = { id: 'p1', sku: 'PRN', name: 'Printer', type: 'good', unitPrice: 5750, costPrice: 3200, trackInventory: true, quantityOnHand: 0, status: 'active', createdAt: '', updatedAt: '' };

const accounts = { getAccountId: async () => 'acc_1220' };

function ledger(runningBalance: number): ControlAccountLedger {
  return { getAccountLedger: async () => [{ runningBalance }] };
}

describe('reconcileGoodsDeliveredNotInvoiced', () => {
  it('a fully-uninvoiced posted delivery is entirely outstanding, valued at the frozen cost', async () => {
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [], products: [PRODUCT], stockMovements: [movement()] },
      accounts,
      ledger(12800),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].outstandingQty).toBe(4);
    expect(result.rows[0].frozenUnitCost).toBe(3200);
    expect(result.rows[0].outstandingCost).toBe(12800);
    expect(result.totalOutstandingCost).toBe(12800);
    expect(result.glBalance).toBe(12800);
    expect(result.difference).toBe(0);
    expect(result.isReconciled).toBe(true);
  });

  it('a fully-invoiced delivery line has NOTHING outstanding', async () => {
    const inv = invoice([invoiceLine({ quantity: 4, deliveryNoteLineId: 'dnl_1' })]);
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [inv], products: [PRODUCT], stockMovements: [movement()] },
      accounts,
      ledger(0),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.totalOutstandingCost).toBe(0);
    expect(result.isReconciled).toBe(true);
  });

  it('a partially-invoiced delivery leaves exactly the outstanding remainder, at the SAME frozen unit cost', async () => {
    const inv = invoice([invoiceLine({ quantity: 2, deliveryNoteLineId: 'dnl_1' })]);
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [inv], products: [PRODUCT], stockMovements: [movement()] },
      accounts,
      ledger(6400),
    );
    expect(result.rows[0].outstandingQty).toBe(2);
    expect(result.rows[0].outstandingCost).toBe(6400); // 2 x frozen 3200, NOT product.costPrice re-derived
    expect(result.isReconciled).toBe(true);
  });

  it('a draft delivery note contributes nothing — only posted evidence counts', async () => {
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote({ status: 'draft' })], invoices: [], products: [PRODUCT], stockMovements: [] },
      accounts,
      ledger(0),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('a direct (non-delivery-linked) invoice line never appears in this report', async () => {
    const inv = invoice([invoiceLine({ quantity: 3 })]); // no deliveryNoteLineId
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [inv], products: [PRODUCT], stockMovements: [movement()] },
      accounts,
      ledger(12800),
    );
    expect(result.rows[0].outstandingQty).toBe(4); // unaffected by the direct invoice
  });

  it('a posted Return Note nets its quantity out of outstanding (Phase 5D) — leaves the correct remainder at the SAME frozen cost', async () => {
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [], products: [PRODUCT], stockMovements: [movement()], returnNotes: [returnNote({ lineItems: [returnNoteLine({ quantity: 1 })] })] },
      accounts,
      ledger(9600), // 3 units remain in 1220 after the return reversed 1 unit's frozen cost out
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].returnedQty).toBe(1);
    expect(result.rows[0].outstandingQty).toBe(3); // 4 delivered - 0 invoiced - 1 returned
    expect(result.rows[0].outstandingCost).toBe(9600); // 3 x frozen 3200
    expect(result.isReconciled).toBe(true);
  });

  it('a fully-returned delivery line has NOTHING outstanding, same as a fully-invoiced one', async () => {
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [], products: [PRODUCT], stockMovements: [movement()], returnNotes: [returnNote({ lineItems: [returnNoteLine({ quantity: 4 })] })] },
      accounts,
      ledger(0),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.isReconciled).toBe(true);
  });

  it('a DRAFT return note contributes nothing — only posted evidence counts', async () => {
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [], products: [PRODUCT], stockMovements: [movement()], returnNotes: [returnNote({ status: 'draft' })] },
      accounts,
      ledger(12800),
    );
    expect(result.rows[0].returnedQty).toBe(0);
    expect(result.rows[0].outstandingQty).toBe(4);
  });

  it('omitting returnNotes entirely (pre-5D caller) is byte-identical to passing []', async () => {
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [], products: [PRODUCT], stockMovements: [movement()] },
      accounts,
      ledger(12800),
    );
    expect(result.rows[0].returnedQty).toBe(0);
    expect(result.rows[0].outstandingQty).toBe(4);
  });

  it('reports a genuine difference (not silently reconciled) when the GL balance disagrees', async () => {
    const result = await reconcileGoodsDeliveredNotInvoiced(
      { deliveryNotes: [deliveryNote()], invoices: [], products: [PRODUCT], stockMovements: [movement()] },
      accounts,
      ledger(9000), // wrong on purpose
    );
    expect(result.difference).toBeCloseTo(3800);
    expect(result.isReconciled).toBe(false);
  });
});
