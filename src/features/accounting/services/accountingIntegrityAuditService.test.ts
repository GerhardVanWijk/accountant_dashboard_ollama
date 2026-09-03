import { describe, expect, it } from 'vitest';
import type { Account, AccountingPeriod, Bill, CreditNote, CustomerReceipt, ID, Invoice, JournalEntry, Payment, Product, StockMovement, TaxRate } from '@/types';
import type { BankAccount } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import type { JournalEntryService, LedgerRow, TrialBalance } from './journalEntryService';
import type { AccountMapper, AccountMappingKey } from './accountMappingService';
import { AccountingIntegrityAuditService, type AccountingIntegrityAuditInput, type AuditCheckResult } from './accountingIntegrityAuditService';

/**
 * Minimal Chart of Accounts covering every code AccountMappingService
 * resolves for the checks this service composes (AR, AP, VAT_OUTPUT,
 * VAT_INPUT, INVENTORY, CASH_AND_BANK) plus a revenue/expense/equity
 * account to balance journal entries against.
 */
function buildAccounts(): Account[] {
  const base = (id: string, code: string, name: string, type: Account['type'], normalBalance: Account['normalBalance']): Account => ({
    id,
    code,
    name,
    type,
    normalBalance,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  return [
    base('acc_1000', '1000', 'Cash and Bank', 'asset', 'debit'),
    base('acc_1100', '1100', 'Accounts Receivable', 'asset', 'debit'),
    base('acc_1200', '1200', 'Inventory', 'asset', 'debit'),
    base('acc_2000', '2000', 'Accounts Payable', 'liability', 'credit'),
    base('acc_2600', '2600', 'Customer Deposits', 'liability', 'credit'),
    base('acc_2100', '2100', 'VAT Output', 'liability', 'credit'),
    base('acc_2110', '2110', 'VAT Input', 'asset', 'debit'),
    base('acc_3000', '3000', 'Share Capital', 'equity', 'credit'),
    base('acc_4000', '4000', 'Sales Revenue', 'revenue', 'credit'),
    base('acc_5100', '5100', 'Operating Expenses', 'expense', 'debit'),
  ];
}

function buildAccountMapper(accounts: Account[]): AccountMapper {
  const codeByKey: Partial<Record<AccountMappingKey, string>> = {
    AR: '1100',
    CUSTOMER_DEPOSIT: '2600',
    AP: '2000',
    VAT_OUTPUT: '2100',
    VAT_INPUT: '2110',
    INVENTORY: '1200',
    CASH_AND_BANK: '1000',
    SALES_REVENUE: '4000',
    EXPENSE: '5100',
  };
  return {
    async getAccountId(key: AccountMappingKey): Promise<ID> {
      const code = codeByKey[key];
      const account = accounts.find((a) => a.code === code);
      if (!account) throw new Error(`test AccountMapper: no account for key "${key}"`);
      return account.id;
    },
  };
}

/**
 * A hand-rolled stand-in for JournalEntryService's read surface, computed
 * with the exact same algorithm as the real service (see
 * journalEntryService.ts's computeTrialBalance/getAccountLedger) — but,
 * unlike MockJournalEntryRepository, it does NOT reject unbalanced entries
 * or entries dated outside any period at construction time. That escape
 * hatch is deliberate: several checks below exist precisely to catch data
 * that bypassed the service layer (see checkJournalEntriesBalance's own
 * doc comment), so the tests need a way to hand the audit service exactly
 * that kind of corrupted data.
 */
function buildFakeJournalEntryService(entries: JournalEntry[], accounts: Account[]): Pick<JournalEntryService, 'getEntries' | 'computeTrialBalance' | 'getAccountLedger'> {
  const posted = entries.filter((e) => e.status === 'posted').sort((a, b) => a.date.localeCompare(b.date));

  return {
    async getEntries() {
      return entries;
    },
    async computeTrialBalance(): Promise<TrialBalance> {
      const netByAccount = new Map<ID, number>();
      for (const entry of posted) {
        for (const line of entry.lines) {
          netByAccount.set(line.accountId, (netByAccount.get(line.accountId) ?? 0) + line.debit - line.credit);
        }
      }
      const rows = [];
      let totalDebits = 0;
      let totalCredits = 0;
      for (const account of accounts) {
        const net = netByAccount.get(account.id) ?? 0;
        if (net === 0) continue;
        const debit = net > 0 ? net : 0;
        const credit = net < 0 ? -net : 0;
        rows.push({ accountId: account.id, code: account.code, name: account.name, debit, credit });
        totalDebits += debit;
        totalCredits += credit;
      }
      return { rows, totalDebits, totalCredits, balanced: Math.abs(totalDebits - totalCredits) <= 0.005 };
    },
    async getAccountLedger(accountId: ID): Promise<LedgerRow[]> {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) throw new Error(`Account "${accountId}" not found.`);
      const direction = account.normalBalance === 'debit' ? 1 : -1;
      let runningBalance = 0;
      const rows: LedgerRow[] = [];
      for (const entry of posted) {
        for (const line of entry.lines) {
          if (line.accountId !== accountId) continue;
          runningBalance += direction * (line.debit - line.credit);
          rows.push({
            entryId: entry.id,
            entryNumber: entry.entryNumber,
            date: entry.date,
            memo: line.description ?? entry.memo,
            debit: line.debit,
            credit: line.credit,
            runningBalance,
          });
        }
      }
      return rows;
    },
  };
}

function je(overrides: Partial<JournalEntry> & Pick<JournalEntry, 'entryNumber' | 'lines'>): JournalEntry {
  return {
    id: overrides.entryNumber,
    date: '2026-08-15',
    status: 'posted',
    source: 'manual',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function period(overrides: Partial<AccountingPeriod> = {}): AccountingPeriod {
  return {
    id: 'period_aug',
    companyId: 'company_test',
    financialYearId: 'fy_test',
    name: 'August 2026',
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function taxRate(): TaxRate {
  return {
    id: 'tax_std',
    code: 'STD',
    name: 'Standard Rate',
    treatment: 'standard_rated',
    rate: 15,
    appliesTo: 'both',
    effectiveFrom: '2018-04-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'SARS VAT Act',
    isActive: true,
    createdAt: '2018-04-01T00:00:00.000Z',
    updatedAt: '2018-04-01T00:00:00.000Z',
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_1',
    invoiceNumber: 'INV-0001',
    customerId: 'cust_1',
    issueDate: '2026-08-15',
    dueDate: '2026-09-14',
    lineItems: [{ id: 'l1', description: 'Widget', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std', taxAmount: 150, lineTotal: 1000 }],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    journalEntryId: 'je_inv1',
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
    issueDate: '2026-08-15',
    dueDate: '2026-09-14',
    lineItems: [{ id: 'l1', description: 'Supplies', quantity: 1, unitPrice: 500, taxRateId: 'tax_std', taxAmount: 75, lineTotal: 500 }],
    subtotal: 500,
    taxTotal: 75,
    total: 575,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'awaiting_payment',
    journalEntryId: 'je_bill1',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'FUR-001',
    name: 'Office Chair',
    type: 'good',
    unitPrice: 100,
    costPrice: 50,
    trackInventory: true,
    quantityOnHand: 10,
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function stockMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'mv_1',
    productId: 'prod_1',
    warehouseId: 'wh_1',
    type: 'opening',
    quantityDelta: 10,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function bankAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'bank_1',
    name: 'Operating Account',
    bankName: 'FNB',
    accountNumber: '123456789',
    accountType: 'checking',
    currency: 'ZAR',
    openingBalance: 0,
    currentBalance: 1000,
    glAccountId: 'acc_1000',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function bankTransaction(overrides: Partial<BankTransactionWithAllocations> = {}): BankTransactionWithAllocations {
  return {
    id: 'btx_1',
    bankAccountId: 'bank_1',
    date: '2026-08-01',
    description: 'Opening deposit',
    amount: 1000,
    direction: 'debit',
    status: 'reconciled',
    allocations: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A fully self-consistent "happy path" company: every check should PASS. */
function buildHappyPathFixtures() {
  const accounts = buildAccounts();
  const entries: JournalEntry[] = [
    je({
      entryNumber: 'JE-0001',
      date: '2026-08-01',
      source: 'opening_balance',
      lines: [
        { id: 'l1', accountId: 'acc_1000', debit: 1000, credit: 0 },
        { id: 'l2', accountId: 'acc_1200', debit: 500, credit: 0 },
        { id: 'l3', accountId: 'acc_3000', debit: 0, credit: 1500 },
      ],
    }),
    je({
      entryNumber: 'JE-1001',
      id: 'je_inv1',
      date: '2026-08-15',
      source: 'invoice',
      lines: [
        { id: 'l1', accountId: 'acc_1100', debit: 1150, credit: 0 },
        { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 1000 },
        { id: 'l3', accountId: 'acc_2100', debit: 0, credit: 150 },
      ],
    }),
    je({
      entryNumber: 'JE-2001',
      id: 'je_bill1',
      date: '2026-08-15',
      source: 'bill',
      lines: [
        { id: 'l1', accountId: 'acc_5100', debit: 500, credit: 0 },
        { id: 'l2', accountId: 'acc_2110', debit: 75, credit: 0 },
        { id: 'l3', accountId: 'acc_2000', debit: 0, credit: 575 },
      ],
    }),
  ];
  const periods = [period()];
  const journalEntryService = buildFakeJournalEntryService(entries, accounts);
  const accountRepository = { async getAll() { return accounts; } };
  const periodRepository = { async getAll() { return periods; } };
  const accountMapper = buildAccountMapper(accounts);

  const service = new AccountingIntegrityAuditService(journalEntryService, accountRepository, accountMapper, periodRepository);

  const input: AccountingIntegrityAuditInput = {
    invoices: [invoice()],
    bills: [bill()],
    creditNotes: [],
    customerReceipts: [],
    payments: [],
    products: [product()],
    stockMovements: [stockMovement()],
    taxRates: [taxRate()],
    bankAccount: bankAccount(),
    bankTransactions: [bankTransaction()],
  };

  return { accounts, entries, periods, journalEntryService, accountRepository, periodRepository, accountMapper, service, input };
}

function find(results: AuditCheckResult[], checkNamePart: string): AuditCheckResult {
  const result = results.find((r) => r.check.includes(checkNamePart));
  if (!result) throw new Error(`No check result found containing "${checkNamePart}". Got: ${results.map((r) => r.check).join(' | ')}`);
  return result;
}

describe('AccountingIntegrityAuditService — happy path', () => {
  it('reports PASS on every check for a fully self-consistent set of books', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run(input);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.status, `${result.check}: ${result.detail}`).toBe('PASS');
    }
  });
});

describe('AccountingIntegrityAuditService — double-entry balance', () => {
  it('FAILs when a posted journal entry does not balance', async () => {
    const { accounts, entries, accountRepository, periodRepository, accountMapper, input } = buildHappyPathFixtures();
    const unbalanced = [
      ...entries,
      je({
        entryNumber: 'JE-9999',
        date: '2026-08-20',
        lines: [
          { id: 'l1', accountId: 'acc_1000', debit: 200, credit: 0 },
          { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 150 },
        ],
      }),
    ];
    const journalEntryService = buildFakeJournalEntryService(unbalanced, accounts);
    const service = new AccountingIntegrityAuditService(journalEntryService, accountRepository, accountMapper, periodRepository);

    const results = await service.run(input);
    const result = find(results, 'Double-entry balance');

    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('JE-9999');
  });
});

describe('AccountingIntegrityAuditService — trial balance', () => {
  it('FAILs when the trial balance does not net to zero', async () => {
    const { accounts, accountRepository, periodRepository, accountMapper, input } = buildHappyPathFixtures();
    // A single one-sided "entry" (only possible via the escape-hatch fake service) breaks the trial balance.
    const brokenEntries: JournalEntry[] = [
      je({ entryNumber: 'JE-0001', date: '2026-08-01', lines: [{ id: 'l1', accountId: 'acc_1000', debit: 500, credit: 0 }] }),
    ];
    const journalEntryService = buildFakeJournalEntryService(brokenEntries, accounts);
    const service = new AccountingIntegrityAuditService(journalEntryService, accountRepository, accountMapper, periodRepository);

    const results = await service.run(input);
    const result = find(results, 'Trial balance');

    expect(result.status).toBe('FAIL');
  });
});

describe('AccountingIntegrityAuditService — AR / AP control vs subledger', () => {
  it('WARNs when the AR control account balance does not match the GL-consistent customer subledger', async () => {
    const { service, input } = buildHappyPathFixtures();
    // A customer receipt ALLOCATED to an invoice but with no matching GL
    // credit — the GL still shows the full R1,150 AR, but the GL-consistent
    // subledger nets the applied portion of the receipt.
    const orphanReceipt: CustomerReceipt = {
      id: 'rec_orphan',
      receiptNumber: 'REC-9999',
      customerId: 'cust_1',
      date: '2026-08-20',
      method: 'eft',
      amount: 300,
      allocations: [{ invoiceId: 'inv_1', amount: 300 }],
      unallocatedAmount: 0,
      currency: 'ZAR',
      journalEntryId: 'je_rec_orphan',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    };
    const results = await service.run({ ...input, customerReceipts: [orphanReceipt] });
    const result = find(results, 'AR control');

    expect(result.status).toBe('WARNING');
    expect(result.detail).toContain('variance');
  });

  it('WARNs when the AP control account balance does not match the GL-consistent supplier subledger', async () => {
    const { service, input } = buildHappyPathFixtures();
    const orphanPayment: Payment = {
      id: 'pay_orphan',
      paymentNumber: 'PAY-9999',
      supplierId: 'sup_1',
      date: '2026-08-20',
      method: 'eft',
      amount: 200,
      allocations: [],
      unallocatedAmount: 200,
      currency: 'ZAR',
      journalEntryId: 'je_pay_orphan',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    };
    const results = await service.run({ ...input, payments: [orphanPayment] });
    const result = find(results, 'AP control');

    expect(result.status).toBe('WARNING');
  });
});

describe('AccountingIntegrityAuditService — VAT control accounts', () => {
  it('WARNs when computed output VAT does not match what was posted to the VAT Output control account', async () => {
    const { service, input } = buildHappyPathFixtures();
    // Invoice claims R150 output VAT but the GL only ever received R150 from the one seeded JE;
    // bump the reported tax so the computed figure diverges from the control account movement.
    const results = await service.run({
      ...input,
      invoices: [invoice({ taxTotal: 300, total: 1300, lineItems: [{ id: 'l1', description: 'Widget', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std', taxAmount: 300, lineTotal: 1000 }] })],
    });
    const result = find(results, 'VAT Output control');

    expect(result.status).toBe('WARNING');
  });

  it('PASSes when computed VAT matches the control account movement', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run(input);
    expect(find(results, 'VAT Output control').status).toBe('PASS');
    expect(find(results, 'VAT Input control').status).toBe('PASS');
  });
});

describe('AccountingIntegrityAuditService — bank GL vs bank_transactions subledger', () => {
  it('PASSes and is distinct from statement reconciliation status', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run(input);
    const result = find(results, 'Bank GL');

    expect(result.status).toBe('PASS');
    expect(result.detail).toContain('reconciled');
  });

  it('WARNs when the bank GL balance does not match the bank_transactions subledger total', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run({ ...input, bankTransactions: [bankTransaction({ amount: 400 })] });
    const result = find(results, 'Bank GL');

    expect(result.status).toBe('WARNING');
  });

  it('is skipped entirely when no bank account is supplied', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run({ ...input, bankAccount: undefined, bankTransactions: undefined });
    expect(results.some((r) => r.check.includes('Bank GL'))).toBe(false);
  });
});

describe('AccountingIntegrityAuditService — inventory', () => {
  it('WARNs when Inventory GL balance does not match Σ(quantityOnHand × costPrice)', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run({ ...input, products: [product({ quantityOnHand: 999 })] });
    const result = find(results, 'Inventory GL');

    expect(result.status).toBe('WARNING');
  });

  it('WARNs when a product\'s stock movements do not net to its quantityOnHand', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run({ ...input, stockMovements: [stockMovement({ quantityDelta: 3 })] });
    const result = find(results, 'Stock movements net to quantity on hand');

    expect(result.status).toBe('WARNING');
    expect(result.detail).toContain('FUR-001');
  });
});

describe('AccountingIntegrityAuditService — source-to-GL traceability', () => {
  it('WARNs when a posted-status invoice carries no journalEntryId', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run({ ...input, invoices: [invoice({ journalEntryId: undefined })] });
    const result = find(results, 'Invoices → journal entry');

    expect(result.status).toBe('WARNING');
    expect(result.detail).toContain('INV-0001');
  });

  it('WARNs when a bill carries no journalEntryId', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run({ ...input, bills: [bill({ journalEntryId: undefined })] });
    expect(find(results, 'Bills → journal entry').status).toBe('WARNING');
  });

  it('WARNs when two source documents reference the same journal entry (duplicate posting)', async () => {
    const { service, input } = buildHappyPathFixtures();
    const results = await service.run({ ...input, bills: [bill({ journalEntryId: 'je_inv1' })] });
    const result = find(results, 'No journal entry referenced by more than one');

    expect(result.status).toBe('WARNING');
  });

  it('PASSes traceability checks for credit notes / receipts / payments with proper journal links', async () => {
    const { service, input } = buildHappyPathFixtures();
    const creditNotes: CreditNote[] = [
      {
        id: 'cn_1',
        creditNoteNumber: 'CN-0001',
        customerId: 'cust_1',
        issueDate: '2026-08-16',
        reason: 'return',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'issued',
        allocations: [],
        journalEntryId: 'je_cn1',
        createdAt: '2026-08-16T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
      },
    ];
    const customerReceipts: CustomerReceipt[] = [
      {
        id: 'rec_1',
        receiptNumber: 'REC-0001',
        customerId: 'cust_1',
        date: '2026-08-17',
        method: 'eft',
        amount: 100,
        allocations: [],
        unallocatedAmount: 100,
        currency: 'ZAR',
        journalEntryId: 'je_rec1',
        createdAt: '2026-08-17T00:00:00.000Z',
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
    ];
    const payments: Payment[] = [
      {
        id: 'pay_1',
        paymentNumber: 'PAY-0001',
        supplierId: 'sup_1',
        date: '2026-08-18',
        method: 'eft',
        amount: 100,
        allocations: [],
        unallocatedAmount: 100,
        currency: 'ZAR',
        journalEntryId: 'je_pay1',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    ];

    const results = await service.run({ ...input, creditNotes, customerReceipts, payments });

    expect(find(results, 'Credit notes → journal entry').status).toBe('PASS');
    expect(find(results, 'Customer receipts → journal entry').status).toBe('PASS');
    expect(find(results, 'Supplier payments → journal entry').status).toBe('PASS');
  });
});

describe('AccountingIntegrityAuditService — orphan journal lines / company isolation', () => {
  it('FAILs both checks when a journal line references an unknown account id', async () => {
    const { accounts, accountRepository, periodRepository, accountMapper, input } = buildHappyPathFixtures();
    const entries: JournalEntry[] = [
      je({
        entryNumber: 'JE-0001',
        date: '2026-08-01',
        lines: [
          { id: 'l1', accountId: 'acc_from_another_company', debit: 100, credit: 0 },
          { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 100 },
        ],
      }),
    ];
    const journalEntryService = buildFakeJournalEntryService(entries, accounts);
    const service = new AccountingIntegrityAuditService(journalEntryService, accountRepository, accountMapper, periodRepository);

    const results = await service.run(input);

    expect(find(results, 'Journal lines reference a real').status).toBe('FAIL');
    expect(find(results, 'Company isolation').status).toBe('FAIL');
  });
});

describe('AccountingIntegrityAuditService — financial period integrity', () => {
  it('FAILs when a posted entry has no accounting period covering its date', async () => {
    const { accounts, periods, accountRepository, periodRepository, accountMapper, input } = buildHappyPathFixtures();
    const entries: JournalEntry[] = [
      je({
        entryNumber: 'JE-0001',
        date: '2025-01-01', // well outside the single 'August 2026' period fixture
        lines: [
          { id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 },
          { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 100 },
        ],
      }),
    ];
    const journalEntryService = buildFakeJournalEntryService(entries, accounts);
    const service = new AccountingIntegrityAuditService(journalEntryService, accountRepository, accountMapper, periodRepository);
    void periods;
    const results = await service.run(input);
    expect(find(results, 'falls within a defined accounting period').status).toBe('FAIL');
  });

  it('WARNs when a posted entry sits inside a period that is not open (e.g. closed)', async () => {
    const { accounts, entries, accountRepository, accountMapper, input } = buildHappyPathFixtures();
    const closedPeriodRepository = { async getAll() { return [period({ status: 'closed' })]; } };
    const journalEntryService = buildFakeJournalEntryService(entries, accounts);
    const service = new AccountingIntegrityAuditService(journalEntryService, accountRepository, accountMapper, closedPeriodRepository);

    const results = await service.run(input);
    const result = find(results, 'sit in an open-status period');

    expect(result.status).toBe('WARNING');
  });
});
