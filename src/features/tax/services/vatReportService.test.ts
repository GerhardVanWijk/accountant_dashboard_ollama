import { describe, it, expect } from 'vitest';
import { computeVatReport, listVatTransactions, reconcileVatControlAccounts } from './vatReportService';
import type { Bill, CreditNote, Invoice, TaxRate, VatSourceEntry } from '@/types';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { seedJournalEntries } from '@/mock-data/journalEntries';
import { seedInvoices } from '@/mock-data/invoices';
import { seedBills } from '@/mock-data/bills';
import { seedCreditNotes } from '@/mock-data/creditNotes';
import { seedTaxRates } from '@/mock-data/taxRates';
import type { AccountingPeriod } from '@/types';

const STD_RATE: TaxRate = {
  id: 'tax_std',
  code: 'STD',
  name: 'Standard Rate (15%)',
  treatment: 'standard_rated',
  rate: 15,
  appliesTo: 'both',
  effectiveFrom: '2018-04-01T00:00:00.000Z',
  jurisdiction: 'ZA',
  sourceReference: 'test',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ZERO_RATE: TaxRate = {
  ...STD_RATE,
  id: 'tax_zero',
  code: 'ZERO',
  name: 'Zero-Rated',
  treatment: 'zero_rated',
  rate: 0,
};

const NODEDUCT_RATE: TaxRate = {
  ...STD_RATE,
  id: 'tax_nodeduct',
  code: 'NODEDUCT',
  name: 'Non-Deductible VAT',
  treatment: 'non_deductible',
};

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_1',
    invoiceNumber: 'INV-0001',
    customerId: 'cust_1',
    issueDate: '2026-08-10T00:00:00.000Z',
    dueDate: '2026-09-09T00:00:00.000Z',
    lineItems: [{ id: 'li_1', description: 'Widget', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std', taxAmount: 150, lineTotal: 1000 }],
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
    issueDate: '2026-08-15T00:00:00.000Z',
    reason: 'return',
    lineItems: [{ id: 'li_2', description: 'Returned widget', quantity: 1, unitPrice: 200, taxRateId: 'tax_std', taxAmount: 30, lineTotal: 200 }],
    subtotal: 200,
    taxTotal: 30,
    total: 230,
    amountAllocated: 0,
    currency: 'ZAR',
    status: 'issued',
    allocations: [],
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill_1',
    billNumber: 'BILL-0001',
    supplierId: 'sup_1',
    issueDate: '2026-08-05T00:00:00.000Z',
    dueDate: '2026-09-04T00:00:00.000Z',
    lineItems: [{ id: 'li_3', description: 'Supplies', quantity: 1, unitPrice: 500, taxRateId: 'tax_std', taxAmount: 75, lineTotal: 500 }],
    subtotal: 500,
    taxTotal: 75,
    total: 575,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'awaiting_payment',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

const AUG_2026 = { start: new Date('2026-08-01'), end: new Date('2026-08-31') };
const ALL_RATES = [STD_RATE, ZERO_RATE, NODEDUCT_RATE];

describe('computeVatReport', () => {
  it('sums output VAT from a posted invoice and input VAT from a posted bill', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [invoice()], [], [bill()], ALL_RATES);

    expect(report.outputVat.total).toBe(150);
    expect(report.inputVat.total).toBe(75);
    expect(report.netVatPayable).toBe(75);
    expect(report.unresolvedLineCount).toBe(0);
  });

  it('excludes draft and void invoices/bills entirely', () => {
    const report = computeVatReport(
      AUG_2026.start,
      AUG_2026.end,
      [invoice({ id: 'draft', status: 'draft' }), invoice({ id: 'void', status: 'void' })],
      [],
      [bill({ id: 'draft_bill', status: 'draft' })],
      ALL_RATES,
    );

    expect(report.outputVat.total).toBe(0);
    expect(report.inputVat.total).toBe(0);
  });

  it('reduces output VAT by an issued credit note', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [invoice()], [creditNote()], [], ALL_RATES);
    expect(report.outputVat.total).toBe(150 - 30);
  });

  it('does not let a draft credit note reduce output VAT', () => {
    const report = computeVatReport(
      AUG_2026.start,
      AUG_2026.end,
      [invoice()],
      [creditNote({ status: 'draft' })],
      [],
      ALL_RATES,
    );
    expect(report.outputVat.total).toBe(150);
  });

  it('excludes documents outside the period', () => {
    const report = computeVatReport(
      new Date('2026-09-01'),
      new Date('2026-09-30'),
      [invoice()],
      [],
      [bill()],
      ALL_RATES,
    );
    expect(report.outputVat.total).toBe(0);
    expect(report.inputVat.total).toBe(0);
  });

  it('reports non-deductible input VAT separately, excluded from the claimable total', () => {
    const report = computeVatReport(
      AUG_2026.start,
      AUG_2026.end,
      [],
      [],
      [
        bill({
          id: 'bill_entertainment',
          lineItems: [
            { id: 'li_4', description: 'Client entertainment', quantity: 1, unitPrice: 400, taxRateId: 'tax_nodeduct', taxAmount: 60, lineTotal: 400 },
          ],
        }),
      ],
      ALL_RATES,
    );

    expect(report.inputVat.total).toBe(0);
    expect(report.inputVat.nonDeductibleTotal).toBe(60);
    expect(report.inputVat.byTreatment.find((r) => r.treatment === 'non_deductible')).toBeUndefined();
  });

  it('breaks output VAT down by treatment, including zero-rated lines with zero VAT', () => {
    const report = computeVatReport(
      AUG_2026.start,
      AUG_2026.end,
      [
        invoice({
          id: 'mixed',
          lineItems: [
            { id: 'li_a', description: 'Standard item', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std', taxAmount: 150, lineTotal: 1000 },
            { id: 'li_b', description: 'Export item', quantity: 1, unitPrice: 500, taxRateId: 'tax_zero', taxAmount: 0, lineTotal: 500 },
          ],
        }),
      ],
      [],
      [],
      ALL_RATES,
    );

    const std = report.outputVat.byTreatment.find((r) => r.treatment === 'standard_rated');
    const zero = report.outputVat.byTreatment.find((r) => r.treatment === 'zero_rated');
    expect(std).toEqual({ treatment: 'standard_rated', taxBase: 1000, vatAmount: 150 });
    expect(zero).toEqual({ treatment: 'zero_rated', taxBase: 500, vatAmount: 0 });
  });

  it('flags a line whose taxRateId does not resolve to any known TaxRate, rather than silently dropping it', () => {
    const report = computeVatReport(
      AUG_2026.start,
      AUG_2026.end,
      [
        invoice({
          lineItems: [{ id: 'li_x', description: 'Mystery item', quantity: 1, unitPrice: 100, taxRateId: 'tax_does_not_exist', taxAmount: 15, lineTotal: 100 }],
        }),
      ],
      [],
      [],
      ALL_RATES,
    );
    expect(report.unresolvedLineCount).toBe(1);
  });
});

function vatSource(overrides: Partial<VatSourceEntry> = {}): VatSourceEntry {
  return {
    id: 'vse_1',
    sourceType: 'asset_disposal',
    sourceId: 'disp_1',
    transactionDate: '2026-08-12T00:00:00.000Z',
    taxRateId: 'tax_std',
    treatment: 'standard_rated',
    direction: 'output',
    taxableAmount: 40000,
    vatAmount: 6000,
    grossAmount: 46000,
    classification: 'capital_goods',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeVatReport — persisted VAT source entries (fixed-asset disposals etc.)', () => {
  it('folds a taxable disposal into Output VAT by treatment, alongside document sources', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [invoice()], [], [], ALL_RATES, [vatSource()]);
    expect(report.outputVat.total).toBe(150 + 6000);
    const std = report.outputVat.byTreatment.find((r) => r.treatment === 'standard_rated');
    expect(std).toEqual({ treatment: 'standard_rated', taxBase: 1000 + 40000, vatAmount: 150 + 6000 });
  });

  it('excludes a source entry dated outside the period', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [], [], [], ALL_RATES, [
      vatSource({ transactionDate: '2026-09-03T00:00:00.000Z' }),
    ]);
    expect(report.outputVat.total).toBe(0);
  });

  it('a contra (reversal) source entry nets the original out', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [], [], [], ALL_RATES, [
      vatSource(),
      vatSource({ id: 'vse_2', reversesEntryId: 'vse_1', taxableAmount: -40000, vatAmount: -6000, grossAmount: -46000 }),
    ]);
    expect(report.outputVat.total).toBe(0);
  });

  // Review 4 Item M — the capital-goods sub-bucket must actually reflect a
  // taxable disposal's classification, not merely persist it unused.
  it('a taxable disposal (classification: capital_goods) lands in outputVat.capitalGoods', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [], [], [], ALL_RATES, [vatSource()]);
    expect(report.outputVat.capitalGoods).toEqual({ taxBase: 40000, vatAmount: 6000 });
    expect(report.inputVat.capitalGoods).toEqual({ taxBase: 0, vatAmount: 0 });
  });

  it('an ordinary standard-rated invoice does NOT land in capitalGoods', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [invoice()], [], [], ALL_RATES, []);
    expect(report.outputVat.capitalGoods).toEqual({ taxBase: 0, vatAmount: 0 });
  });

  // Review 4 Item N — capitalGoods is a breakdown, not an addition: the
  // grand total must equal invoice VAT + disposal VAT exactly once, and the
  // capital-goods sub-bucket must contain ONLY the disposal's portion.
  it('does not double-count: total = ordinary invoice + disposal, exactly once; capitalGoods holds only the disposal', () => {
    const report = computeVatReport(AUG_2026.start, AUG_2026.end, [invoice()], [], [], ALL_RATES, [vatSource()]);
    expect(report.outputVat.total).toBe(150 + 6000); // invoice VAT + disposal VAT, once each
    expect(report.outputVat.capitalGoods.vatAmount).toBe(6000); // disposal only, not 150 + 6000
    expect(report.outputVat.capitalGoods.taxBase).toBe(40000); // disposal only, not 1000 + 40000
  });
});

describe('listVatTransactions', () => {
  it('lists a posted invoice as an output-VAT row and a posted bill as an input-VAT row', () => {
    const rows = listVatTransactions(AUG_2026.start, AUG_2026.end, [invoice()], [], [bill()], ALL_RATES);

    expect(rows).toHaveLength(2);
    const invoiceRow = rows.find((r) => r.documentType === 'invoice');
    const billRow = rows.find((r) => r.documentType === 'bill');
    expect(invoiceRow).toMatchObject({ documentNumber: 'INV-0001', direction: 'output', taxBase: 1000, vatAmount: 150, treatment: 'standard_rated' });
    expect(billRow).toMatchObject({ documentNumber: 'BILL-0001', direction: 'input', taxBase: 500, vatAmount: 75, treatment: 'standard_rated' });
  });

  it('lists an issued credit note as a negative output-VAT row (it reduces output VAT)', () => {
    const rows = listVatTransactions(AUG_2026.start, AUG_2026.end, [], [creditNote()], [], ALL_RATES);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ documentType: 'credit_note', documentNumber: 'CN-0001', direction: 'output', taxBase: -200, vatAmount: -30 });
  });

  it('excludes draft/void documents and zero-VAT documents, same as computeVatReport', () => {
    const rows = listVatTransactions(
      AUG_2026.start,
      AUG_2026.end,
      [invoice({ id: 'draft', status: 'draft' }), invoice({ id: 'zero', taxTotal: 0, lineItems: [] })],
      [],
      [bill({ id: 'void_bill', status: 'void' })],
      ALL_RATES,
    );

    expect(rows).toHaveLength(0);
  });

  it('excludes documents outside the period', () => {
    const rows = listVatTransactions(AUG_2026.start, AUG_2026.end, [invoice({ issueDate: '2026-09-15T00:00:00.000Z' })], [], [], ALL_RATES);
    expect(rows).toHaveLength(0);
  });

  it('lists a taxable disposal VAT source entry as an output row', () => {
    const rows = listVatTransactions(AUG_2026.start, AUG_2026.end, [], [], [], ALL_RATES, [vatSource()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ documentType: 'vat_source', direction: 'output', treatment: 'standard_rated', taxBase: 40000, vatAmount: 6000 });
  });

  it('sorts rows by date ascending', () => {
    const rows = listVatTransactions(
      AUG_2026.start,
      AUG_2026.end,
      [invoice({ id: 'later', issueDate: '2026-08-20T00:00:00.000Z', invoiceNumber: 'INV-LATER' })],
      [],
      [bill({ id: 'earlier', issueDate: '2026-08-02T00:00:00.000Z', billNumber: 'BILL-EARLIER' })],
      ALL_RATES,
    );
    expect(rows.map((r) => r.documentNumber)).toEqual(['BILL-EARLIER', 'INV-LATER']);
  });
});

describe('reconcileVatControlAccounts against real seed data', () => {
  it('reconciles cleanly across all of 2026 — proves generateSeedPostings.ts actually matches computeVatReport()', async () => {
    const journalRepository = new MockJournalEntryRepository(seedJournalEntries);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const wideOpenPeriod: AccountingPeriod = {
      id: 'period_test_open',
      companyId: 'comp_test',
      financialYearId: 'fy_test',
      name: '2026 (test)',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:59.999Z',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const periodRepository = new MockAccountingPeriodRepository([wideOpenPeriod]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

    const periodStart = new Date('2026-01-01');
    const periodEnd = new Date('2026-12-31');
    const report = computeVatReport(periodStart, periodEnd, seedInvoices, seedCreditNotes, seedBills, seedTaxRates);
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    const reconciliation = await reconcileVatControlAccounts(journalEntryService, accountMapper, periodStart, periodEnd, report);

    expect(reconciliation.outputVat.isReconciled).toBe(true);
    expect(reconciliation.inputVat.isReconciled).toBe(true);
  });
});
