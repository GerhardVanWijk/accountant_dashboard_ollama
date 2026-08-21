import { describe, it, expect } from 'vitest';
import { BankTransactionService } from './bankTransactionService';
import { MockBankTransactionRepository } from '../repositories/MockBankTransactionRepository';
import { MockBankAccountRepository } from '../repositories/MockBankAccountRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { seedBankAccounts } from '@/mock-data/bankAccounts';
import { seedTaxRates } from '@/mock-data/taxRates';
import type { AccountingPeriod } from '@/types';

/** A single accounting period wide open enough to cover every date these tests use. */
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

/**
 * Wires a REAL JournalEntryService (the actual ledger posting engine, not a
 * stub) so these tests prove BankTransactionService produces genuinely
 * balanced journal entries — postJournalEntry() throws on anything that
 * doesn't sum to zero (docs/LEDGER_ARCHITECTURE.md), so a passing test here
 * is real evidence of a correct double-entry mapping, not a mocked
 * assertion.
 */
function setup() {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

  const bankAccountRepository = new MockBankAccountRepository(seedBankAccounts.map((a) => ({ ...a })));
  const bankTransactionRepository = new MockBankTransactionRepository([]);
  const service = new BankTransactionService(
    bankTransactionRepository,
    bankAccountRepository,
    journalEntryService,
    seedTaxRates,
  );

  return { service, journalEntryService, bankTransactionRepository, bankAccountRepository };
}

const FNB_CURRENT = 'bank_fnb_current';
const STD_SAVINGS = 'bank_standardbank_savings';

describe('BankTransactionService', () => {
  describe('createDirectTransaction — receipts', () => {
    it('posts a balanced journal entry for a standard-rated receipt', async () => {
      const { service, journalEntryService } = setup();

      const txn = await service.createDirectTransaction({
        bankAccountId: FNB_CURRENT,
        date: '2026-03-01T00:00:00.000Z',
        description: 'Customer payment',
        amount: 1150,
        direction: 'debit',
        allocations: [{ glAccountId: 'acc_4000', netAmount: 1000, taxRateId: 'tax_std_15' }],
      });

      expect(txn.status).toBe('matched');
      expect(txn.journalEntryId).toBeDefined();

      const entry = await journalEntryService.getEntry(txn.journalEntryId!);
      expect(entry).toBeDefined();
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(1150);

      // Bank line debited, revenue line credited 1000, VAT Output credited 150.
      const bankLine = entry!.lines.find((l) => l.accountId === 'acc_1000');
      const revenueLine = entry!.lines.find((l) => l.accountId === 'acc_4000');
      const vatLine = entry!.lines.find((l) => l.accountId === 'acc_2100');
      expect(bankLine?.debit).toBeCloseTo(1150);
      expect(revenueLine?.credit).toBeCloseTo(1000);
      expect(vatLine?.credit).toBeCloseTo(150);
    });

    it('folds Non-Deductible VAT into the expense line with no separate VAT account line', async () => {
      const { service, journalEntryService } = setup();

      const txn = await service.createDirectTransaction({
        bankAccountId: FNB_CURRENT,
        date: '2026-03-02T00:00:00.000Z',
        description: 'Client entertainment',
        amount: 500,
        direction: 'credit',
        allocations: [{ glAccountId: 'acc_5100', netAmount: 500, taxRateId: 'tax_nondeductible' }],
      });

      const entry = await journalEntryService.getEntry(txn.journalEntryId!);
      const vatInputLine = entry!.lines.find((l) => l.accountId === 'acc_2110');
      expect(vatInputLine).toBeUndefined();

      const expenseLine = entry!.lines.find((l) => l.accountId === 'acc_5100');
      expect(expenseLine?.debit).toBeCloseTo(500);

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
    });

    it('rejects allocations that do not sum to the transaction amount', async () => {
      const { service } = setup();
      await expect(
        service.createDirectTransaction({
          bankAccountId: FNB_CURRENT,
          date: '2026-03-01T00:00:00.000Z',
          description: 'Mismatched split',
          amount: 1000,
          direction: 'credit',
          allocations: [{ glAccountId: 'acc_5100', netAmount: 500 }],
        }),
      ).rejects.toThrow(/total/i);
    });

    it('rejects a transaction with no allocation lines', async () => {
      const { service } = setup();
      await expect(
        service.createDirectTransaction({
          bankAccountId: FNB_CURRENT,
          date: '2026-03-01T00:00:00.000Z',
          description: 'No lines',
          amount: 100,
          direction: 'debit',
          allocations: [],
        }),
      ).rejects.toThrow(/allocation/i);
    });

    it('does not create a BankTransaction row if GL posting fails', async () => {
      const { service, bankTransactionRepository } = setup();
      await expect(
        service.createDirectTransaction({
          bankAccountId: FNB_CURRENT,
          date: '2026-03-01T00:00:00.000Z',
          description: 'Bad account',
          amount: 100,
          direction: 'debit',
          allocations: [{ glAccountId: 'acc_does_not_exist', netAmount: 100 }],
        }),
      ).rejects.toThrow();

      const all = await bankTransactionRepository.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('createTransfer', () => {
    it('creates two linked legs: debit destination, credit source', async () => {
      const { service } = setup();
      const result = await service.createTransfer({
        fromBankAccountId: FNB_CURRENT,
        toBankAccountId: STD_SAVINGS,
        date: '2026-03-05T00:00:00.000Z',
        amount: 5000,
      });

      expect(result.outLeg.bankAccountId).toBe(FNB_CURRENT);
      expect(result.outLeg.direction).toBe('credit');
      expect(result.inLeg.bankAccountId).toBe(STD_SAVINGS);
      expect(result.inLeg.direction).toBe('debit');
      expect(result.outLeg.transferPairId).toBe(result.inLeg.id);
      expect(result.inLeg.transferPairId).toBe(result.outLeg.id);
      // Both accounts share the same GL control account in seed data, so no GL entry is expected.
      expect(result.journalEntryId).toBeUndefined();
    });

    it('creates no revenue/expense allocation lines for a transfer', async () => {
      const { service } = setup();
      const result = await service.createTransfer({
        fromBankAccountId: FNB_CURRENT,
        toBankAccountId: STD_SAVINGS,
        date: '2026-03-05T00:00:00.000Z',
        amount: 1000,
      });
      expect(result.outLeg.allocations).toEqual([]);
      expect(result.inLeg.allocations).toEqual([]);
    });

    it('rejects a transfer to the same account', async () => {
      const { service } = setup();
      await expect(
        service.createTransfer({
          fromBankAccountId: FNB_CURRENT,
          toBankAccountId: FNB_CURRENT,
          date: '2026-03-05T00:00:00.000Z',
          amount: 100,
        }),
      ).rejects.toThrow(/different/i);
    });

    it('posts a single balanced journal entry when accounts map to different GL accounts', async () => {
      const { service, journalEntryService, bankAccountRepository } = setup();
      // Give the savings account a distinct GL control account so a real GL entry is expected.
      await bankAccountRepository.update(STD_SAVINGS, { glAccountId: 'acc_1100' });

      const result = await service.createTransfer({
        fromBankAccountId: FNB_CURRENT,
        toBankAccountId: STD_SAVINGS,
        date: '2026-03-06T00:00:00.000Z',
        amount: 2500,
      });

      expect(result.journalEntryId).toBeDefined();
      const entry = await journalEntryService.getEntry(result.journalEntryId!);
      expect(entry!.lines).toHaveLength(2);
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(2500);

      const destLine = entry!.lines.find((l) => l.accountId === 'acc_1100');
      const sourceLine = entry!.lines.find((l) => l.accountId === 'acc_1000');
      expect(destLine?.debit).toBeCloseTo(2500);
      expect(sourceLine?.credit).toBeCloseTo(2500);
    });
  });

  describe('deleteTransaction', () => {
    it('refuses to delete a reconciled transaction', async () => {
      const { service, bankTransactionRepository } = setup();
      const txn = await service.createDirectTransaction({
        bankAccountId: FNB_CURRENT,
        date: '2026-03-01T00:00:00.000Z',
        description: 'Recorded',
        amount: 100,
        direction: 'debit',
        allocations: [{ glAccountId: 'acc_4000', netAmount: 100 }],
      });
      await bankTransactionRepository.update(txn.id, { status: 'reconciled' });

      await expect(service.deleteTransaction(txn.id)).rejects.toThrow(/reconciled/i);
    });

    it('deletes both legs of a transfer together', async () => {
      const { service, bankTransactionRepository } = setup();
      const result = await service.createTransfer({
        fromBankAccountId: FNB_CURRENT,
        toBankAccountId: STD_SAVINGS,
        date: '2026-03-05T00:00:00.000Z',
        amount: 1000,
      });

      await service.deleteTransaction(result.outLeg.id);

      expect(await bankTransactionRepository.getById(result.outLeg.id)).toBeUndefined();
      expect(await bankTransactionRepository.getById(result.inLeg.id)).toBeUndefined();
    });
  });

  describe('importStatementLines', () => {
    it('imports lines as unreconciled, unallocated transactions', async () => {
      const { service } = setup();
      const imported = await service.importStatementLines(FNB_CURRENT, [
        { sourceRowId: 'row1', date: '2026-03-10T00:00:00.000Z', description: 'POS settlement', amount: 250, direction: 'debit' },
      ]);
      expect(imported).toHaveLength(1);
      expect(imported[0].status).toBe('unreconciled');
      expect(imported[0].allocations).toEqual([]);
      expect(imported[0].source).toBe('import');
    });

    it('skips a line whose reference already exists for the account', async () => {
      const { service } = setup();
      await service.importStatementLines(FNB_CURRENT, [
        { sourceRowId: 'row1', date: '2026-03-10T00:00:00.000Z', description: 'A', reference: 'REF-1', amount: 100, direction: 'debit' },
      ]);
      const second = await service.importStatementLines(FNB_CURRENT, [
        { sourceRowId: 'row2', date: '2026-03-11T00:00:00.000Z', description: 'A dup', reference: 'REF-1', amount: 100, direction: 'debit' },
      ]);
      expect(second).toHaveLength(0);
    });
  });

  describe('allocateTransaction', () => {
    it('allocates and posts an imported transaction that had no allocation', async () => {
      const { service, journalEntryService } = setup();
      const [imported] = await service.importStatementLines(FNB_CURRENT, [
        { sourceRowId: 'row1', date: '2026-03-10T00:00:00.000Z', description: 'POS settlement', amount: 230, direction: 'debit' },
      ]);

      const allocated = await service.allocateTransaction(imported.id, [
        { glAccountId: 'acc_4000', netAmount: 200, taxRateId: 'tax_std_15' },
      ]);

      expect(allocated.status).toBe('matched');
      expect(allocated.journalEntryId).toBeDefined();
      const entry = await journalEntryService.getEntry(allocated.journalEntryId!);
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(230);
    });

    it('refuses to re-allocate an already-reconciled transaction', async () => {
      const { service, bankTransactionRepository } = setup();
      const [imported] = await service.importStatementLines(FNB_CURRENT, [
        { sourceRowId: 'row1', date: '2026-03-10T00:00:00.000Z', description: 'POS settlement', amount: 100, direction: 'debit' },
      ]);
      await bankTransactionRepository.update(imported.id, { status: 'reconciled' });

      await expect(
        service.allocateTransaction(imported.id, [{ glAccountId: 'acc_4000', netAmount: 100 }]),
      ).rejects.toThrow(/reconciled/i);
    });
  });
});
