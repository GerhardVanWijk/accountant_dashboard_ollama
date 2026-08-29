import { describe, expect, it } from 'vitest';
import type { CreditNote, CustomerReceipt, Invoice } from '@/types';
import type { AccountMapper } from './accountMappingService';
import type { JournalEntryService } from './journalEntryService';
import { reconcileAccountsReceivable } from './subledgerReconciliation';

/**
 * Phase 21.2 regression suite — the 8 scenarios from the brief that
 * `reconcileAccountsReceivable()` must now handle by netting credit notes
 * and customer receipts, not just open invoices.
 *
 * Each scenario builds the invoices/credit-notes/receipts, stubs the GL AR
 * control-account balance to the value those documents imply (Σ posted
 * invoice total − Σ receipt amount − Σ posted credit-note total — every
 * posting that would actually hit account 1100), and asserts:
 *   - variance ≈ 0 (GL-consistent subledger ties to the control by construction)
 *   - the bridge decomposition (unallocatedReceipts / creditNoteImpact / other)
 *     is exactly right, with `other` ≈ 0 for every consistent dataset.
 */

const EPS = 0.005;

function stubLedger(balance: number): Pick<JournalEntryService, 'getAccountLedger'> {
  return {
    getAccountLedger: async () =>
      [{ runningBalance: balance }] as Awaited<ReturnType<JournalEntryService['getAccountLedger']>>,
  };
}

const accountMapper: AccountMapper = {
  getAccountId: async () => 'acc_ar',
} as AccountMapper;

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_1',
    invoiceNumber: 'INV-0001',
    customerId: 'cust_1',
    issueDate: '2026-08-10T00:00:00.000Z',
    dueDate: '2026-09-09T00:00:00.000Z',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function creditNote(overrides: Partial<CreditNote> = {}): CreditNote {
  return {
    id: 'cn_1',
    creditNoteNumber: 'CN-0001',
    customerId: 'cust_1',
    issueDate: '2026-08-12T00:00:00.000Z',
    reason: 'return',
    lineItems: [],
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    amountAllocated: 0,
    currency: 'ZAR',
    status: 'issued',
    allocations: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

function receipt(overrides: Partial<CustomerReceipt> = {}): CustomerReceipt {
  return {
    id: 'rec_1',
    receiptNumber: 'REC-0001',
    customerId: 'cust_1',
    date: '2026-08-15T00:00:00.000Z',
    method: 'eft',
    amount: 0,
    allocations: [],
    unallocatedAmount: 0,
    currency: 'ZAR',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

/** Every posting that would hit AR (1100) for the given documents. */
function impliedGl(invoices: Invoice[], creditNotes: CreditNote[], receipts: CustomerReceipt[]): number {
  const inv = invoices.filter((i) => i.status !== 'draft' && i.status !== 'void').reduce((s, i) => s + i.total, 0);
  const cn = creditNotes.filter((c) => c.status === 'issued' || c.status === 'allocated').reduce((s, c) => s + c.total, 0);
  const rec = receipts.reduce((s, r) => s + r.amount, 0);
  return inv - rec - cn;
}

async function run(invoices: Invoice[], creditNotes: CreditNote[], receipts: CustomerReceipt[]) {
  return reconcileAccountsReceivable(stubLedger(impliedGl(invoices, creditNotes, receipts)), accountMapper, invoices, creditNotes, receipts);
}

describe('reconcileAccountsReceivable — credit notes + receipts (8 scenarios)', () => {
  it('1. invoice only', async () => {
    const invoices = [invoice()];
    const r = await run(invoices, [], []);
    expect(r.subledgerTotal).toBeCloseTo(1150, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(1150, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.isReconciled).toBe(true);
    expect(r.bridge).toEqual({ unallocatedReceipts: 0, creditNoteImpact: 0, other: 0 });
  });

  it('2. fully paid invoice', async () => {
    const invoices = [invoice({ amountPaid: 1150, status: 'paid' })];
    const receipts = [receipt({ amount: 1150, allocations: [{ invoiceId: 'inv_1', amount: 1150 }] })];
    const r = await run(invoices, [], receipts);
    expect(r.subledgerTotal).toBeCloseTo(0, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(0, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.bridge).toEqual({ unallocatedReceipts: 0, creditNoteImpact: 0, other: 0 });
  });

  it('3. partially paid invoice', async () => {
    const invoices = [invoice({ amountPaid: 400, status: 'partially_paid' })];
    const receipts = [receipt({ amount: 400, allocations: [{ invoiceId: 'inv_1', amount: 400 }] })];
    const r = await run(invoices, [], receipts);
    expect(r.subledgerTotal).toBeCloseTo(750, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(750, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.bridge).toEqual({ unallocatedReceipts: 0, creditNoteImpact: 0, other: 0 });
  });

  it('4. credit note (issued, unallocated) — standalone customer credit', async () => {
    const invoices = [invoice()];
    const creditNotes = [creditNote({ total: 200, subtotal: 200, status: 'issued', amountAllocated: 0, allocations: [] })];
    const r = await run(invoices, creditNotes, []);
    expect(r.subledgerTotal).toBeCloseTo(950, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(1150, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.bridge.unallocatedReceipts).toBeCloseTo(0, 2);
    expect(r.bridge.creditNoteImpact).toBeCloseTo(200, 2);
    expect(r.bridge.other).toBeCloseTo(0, 2);
  });

  it('5. partially credited invoice (CN allocated, invoice.amountPaid bumped)', async () => {
    const invoices = [invoice({ amountPaid: 200, status: 'partially_paid' })];
    const creditNotes = [
      creditNote({ total: 200, subtotal: 200, status: 'allocated', amountAllocated: 200, allocations: [{ invoiceId: 'inv_1', amount: 200, allocatedAt: '2026-08-12T00:00:00.000Z' }] }),
    ];
    const r = await run(invoices, creditNotes, []);
    expect(r.subledgerTotal).toBeCloseTo(950, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(950, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.bridge.creditNoteImpact).toBeCloseTo(0, 2);
    expect(r.bridge.other).toBeCloseTo(0, 2);
  });

  it('6. receipt + credit note on the same invoice', async () => {
    const invoices = [invoice({ amountPaid: 650, status: 'partially_paid' })];
    const creditNotes = [
      creditNote({ total: 150, subtotal: 150, status: 'allocated', amountAllocated: 150, allocations: [{ invoiceId: 'inv_1', amount: 150, allocatedAt: '2026-08-12T00:00:00.000Z' }] }),
    ];
    const receipts = [receipt({ amount: 500, allocations: [{ invoiceId: 'inv_1', amount: 500 }] })];
    const r = await run(invoices, creditNotes, receipts);
    expect(r.subledgerTotal).toBeCloseTo(500, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(500, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.bridge).toEqual({ unallocatedReceipts: 0, creditNoteImpact: 0, other: 0 });
  });

  it('7. unallocated receipt (money on account)', async () => {
    const invoices = [invoice()];
    const receipts = [receipt({ amount: 800, unallocatedAmount: 800, allocations: [] })];
    const r = await run(invoices, [], receipts);
    expect(r.subledgerTotal).toBeCloseTo(350, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(1150, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.bridge.unallocatedReceipts).toBeCloseTo(800, 2);
    expect(r.bridge.creditNoteImpact).toBeCloseTo(0, 2);
    expect(r.bridge.other).toBeCloseTo(0, 2);
  });

  it('8. one receipt allocated across multiple invoices', async () => {
    const invoices = [
      invoice({ id: 'inv_a', invoiceNumber: 'INV-A', total: 500, subtotal: 500, taxTotal: 0, amountPaid: 500, status: 'paid' }),
      invoice({ id: 'inv_b', invoiceNumber: 'INV-B', total: 300, subtotal: 300, taxTotal: 0, amountPaid: 300, status: 'paid' }),
      invoice({ id: 'inv_c', invoiceNumber: 'INV-C', total: 200, subtotal: 200, taxTotal: 0, amountPaid: 200, status: 'paid' }),
    ];
    const receipts = [
      receipt({
        amount: 1000,
        allocations: [
          { invoiceId: 'inv_a', amount: 500 },
          { invoiceId: 'inv_b', amount: 300 },
          { invoiceId: 'inv_c', amount: 200 },
        ],
      }),
    ];
    const r = await run(invoices, [], receipts);
    expect(r.subledgerTotal).toBeCloseTo(0, 2);
    expect(r.agingSubledgerTotal).toBeCloseTo(0, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(Math.abs(r.bridge.other)).toBeLessThanOrEqual(EPS);
  });
});
