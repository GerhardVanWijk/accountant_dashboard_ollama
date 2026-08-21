import { AccountService } from './accountService';
import { JournalEntryService } from './journalEntryService';
import { AccountingPeriodService } from './accountingPeriodService';
import { FinancialYearService } from './financialYearService';
import { MockAccountRepository } from '../repositories/MockAccountRepository';
import { MockJournalEntryRepository } from '../repositories/MockJournalEntryRepository';
import { MockAccountingPeriodRepository } from '../repositories/MockAccountingPeriodRepository';
import { MockFinancialYearRepository } from '../repositories/MockFinancialYearRepository';
import { auditLogService } from '@/services/auditLogService';

export type { CreateAccountDTO } from './accountService';
export type {
  NewJournalEntryInput,
  NewJournalLineInput,
  JournalValidationResult,
  TrialBalance,
  TrialBalanceRow,
  LedgerRow,
} from './journalEntryService';
export { AccountService } from './accountService';
export { JournalEntryService, SYSTEM_USER_ID } from './journalEntryService';
export { AccountingPeriodService } from './accountingPeriodService';
export { FinancialYearService } from './financialYearService';

/**
 * Wires the services to their Phase 0-style mock repositories, shared so a
 * posting made through journalEntryService is immediately visible to
 * accountService.hasPostings() and subject to accountingPeriodService's
 * period-open rule. Hooks depend on these singletons instead of importing
 * repositories directly.
 */
const accountRepository = new MockAccountRepository();
const journalRepository = new MockJournalEntryRepository();
const periodRepository = new MockAccountingPeriodRepository();
const financialYearRepository = new MockFinancialYearRepository();

export const accountService = new AccountService(accountRepository, journalRepository);
export const accountingPeriodService = new AccountingPeriodService(periodRepository, auditLogService);
export const financialYearService = new FinancialYearService(financialYearRepository, auditLogService);
export const journalEntryService = new JournalEntryService(
  journalRepository,
  accountRepository,
  periodRepository,
  auditLogService,
);
