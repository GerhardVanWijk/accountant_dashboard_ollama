import { describe, expect, it } from 'vitest';
import type { AccountingPeriod, DividendDeclaration } from '@/types';
import { computeExpectedDividendsTaxMovements, reconcileDividendsTaxControlAccounts } from './dividendsTaxReconciliationService';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

function makeOpenPeriod(): AccountingPeriod {
  return {
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
}

function makeDeclaration(overrides: Partial<DividendDeclaration> = {}): DividendDeclaration {
  return {
    id: 'divd_1',
    declarationDate: '2026-06-01T00:00:00.000Z',
    totalAmount: 100000,
    exemptPortion: 0,
    status: 'remitted',
    taxableAmount: 100000,
    ratePercentApplied: 20,
    dividendsTaxWithheld: 20000,
    netPayableToShareholders: 80000,
    declarationJournalEntryId: 'je_declare',
    paymentJournalEntryId: 'je_pay',
    paidDate: '2026-06-15T00:00:00.000Z',
    remittanceJournalEntryId: 'je_remit',
    remittedDate: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeHarness() {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  return { journalEntryService, accountMapper };
}

const PERIOD_START = new Date('2026-01-01');
const PERIOD_END = new Date('2026-12-31');

describe('computeExpectedDividendsTaxMovements', () => {
  it('derives declare/pay/remit as three independently-dated movements, never re-reading the GL', () => {
    const declaration = makeDeclaration();
    const result = computeExpectedDividendsTaxMovements([declaration], PERIOD_START, PERIOD_END);

    // Dividends Payable: +100000 (declare) - 100000 (pay) = 0 net for the year.
    expect(result.dividendsPayable).toBeCloseTo(0, 2);
    // Dividends Tax Payable: +20000 (pay) - 20000 (remit) = 0 net for the year.
    expect(result.dividendsTaxPayable).toBeCloseTo(0, 2);
    expect(result.events).toHaveLength(4);
    expect(result.events.map((e) => e.event)).toEqual(['declare', 'pay', 'pay', 'remit']);
  });

  it('excludes an event dated outside the period (future-period exclusion)', () => {
    const declaration = makeDeclaration({ remittedDate: '2027-01-05T00:00:00.000Z' });
    const result = computeExpectedDividendsTaxMovements([declaration], PERIOD_START, PERIOD_END);

    // remit() falls in 2027 — excluded from the 2026 window, so Dividends Tax Payable shows the un-remitted +20000.
    expect(result.dividendsTaxPayable).toBeCloseTo(20000, 2);
    expect(result.events.some((e) => e.event === 'remit')).toBe(false);
  });

  it('ignores a declaration with no posted journal for a transition (draft-only, or a transition genuinely never reached)', () => {
    const draft = makeDeclaration({
      status: 'draft',
      declarationJournalEntryId: undefined,
      paymentJournalEntryId: undefined,
      paidDate: undefined,
      remittanceJournalEntryId: undefined,
      remittedDate: undefined,
    });
    const result = computeExpectedDividendsTaxMovements([draft], PERIOD_START, PERIOD_END);
    expect(result.dividendsPayable).toBe(0);
    expect(result.dividendsTaxPayable).toBe(0);
    expect(result.events).toHaveLength(0);
  });
});

describe('reconcileDividendsTaxControlAccounts', () => {
  it('reconciles cleanly to R0.00 when the GL matches exactly what the register expects', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    const [dividendsPayableId, cashId, dividendsTaxPayableId, retainedEarningsId] = await Promise.all([
      accountMapper.getAccountId('DIVIDENDS_PAYABLE'),
      accountMapper.getAccountId('CASH_AND_BANK'),
      accountMapper.getAccountId('DIVIDENDS_TAX_PAYABLE'),
      accountMapper.getAccountId('RETAINED_EARNINGS'),
    ]);

    // Post the SAME three journals declare()/pay()/remitToSars() would post — independently of the reconciliation code, proving two real sides.
    const declareEntry = await journalEntryService.postJournalEntry({
      date: '2026-06-01', source: 'dividend_declaration',
      lines: [{ accountId: retainedEarningsId, debit: 100000, credit: 0 }, { accountId: dividendsPayableId, debit: 0, credit: 100000 }],
    });
    const payEntry = await journalEntryService.postJournalEntry({
      date: '2026-06-15', source: 'dividend_payment',
      lines: [
        { accountId: dividendsPayableId, debit: 100000, credit: 0 },
        { accountId: cashId, debit: 0, credit: 80000 },
        { accountId: dividendsTaxPayableId, debit: 0, credit: 20000 },
      ],
    });
    const remitEntry = await journalEntryService.postJournalEntry({
      date: '2026-07-20', source: 'dividend_tax_remittance',
      lines: [{ accountId: dividendsTaxPayableId, debit: 20000, credit: 0 }, { accountId: cashId, debit: 0, credit: 20000 }],
    });

    const declaration = makeDeclaration({
      declarationJournalEntryId: declareEntry.id,
      paymentJournalEntryId: payEntry.id,
      remittanceJournalEntryId: remitEntry.id,
    });

    const reconciliation = await reconcileDividendsTaxControlAccounts(journalEntryService, accountMapper, PERIOD_START, PERIOD_END, [declaration]);

    expect(reconciliation.dividendsPayable.isReconciled).toBe(true);
    expect(reconciliation.dividendsPayable.variance).toBeCloseTo(0, 2);
    expect(reconciliation.dividendsTaxPayable.isReconciled).toBe(true);
    expect(reconciliation.dividendsTaxPayable.variance).toBeCloseTo(0, 2);
  });

  it('surfaces a real variance when a journal touches the control account that the register does not account for (tampered/stray GL entry)', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    const [dividendsPayableId, cashId] = await Promise.all([
      accountMapper.getAccountId('DIVIDENDS_PAYABLE'),
      accountMapper.getAccountId('CASH_AND_BANK'),
    ]);

    // A stray/manual journal that credits Dividends Payable with no matching register event — simulates a tampered/out-of-band posting.
    await journalEntryService.postJournalEntry({
      date: '2026-08-01', source: 'manual',
      lines: [{ accountId: cashId, debit: 5000, credit: 0 }, { accountId: dividendsPayableId, debit: 0, credit: 5000 }],
    });

    const reconciliation = await reconcileDividendsTaxControlAccounts(journalEntryService, accountMapper, PERIOD_START, PERIOD_END, []);

    expect(reconciliation.dividendsPayable.isReconciled).toBe(false);
    expect(reconciliation.dividendsPayable.expectedMovement).toBe(0);
    expect(reconciliation.dividendsPayable.glMovement).toBeCloseTo(5000, 2);
    expect(reconciliation.dividendsPayable.variance).toBeCloseTo(5000, 2);
  });
});
