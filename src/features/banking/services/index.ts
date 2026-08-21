import { BankAccountService } from './bankAccountService';
import { BankTransactionService } from './bankTransactionService';
import { BankReconciliationService } from './bankReconciliationService';
import { MockBankAccountRepository } from '../repositories/MockBankAccountRepository';
import { MockBankTransactionRepository } from '../repositories/MockBankTransactionRepository';
import { MockBankReconciliationRepository } from '../repositories/MockBankReconciliationRepository';
import { journalEntryService } from '@/features/accounting/services';
import { auditLogService } from '@/services/auditLogService';

export type { CreateBankAccountDTO } from './bankAccountService';
export type {
  AllocationInput,
  CreateDirectTransactionInput,
  CreateTransferInput,
  TransferResult,
  JournalPoster,
} from './bankTransactionService';
export type { ReconciliationSummary } from './bankReconciliationService';
export { BankAccountService } from './bankAccountService';
export { BankTransactionService } from './bankTransactionService';
export { BankReconciliationService } from './bankReconciliationService';

/**
 * Wires the Banking services to their Phase 0-style mock repositories,
 * shared singletons so a transaction posted through bankTransactionService
 * is immediately visible to bankReconciliationService's balance
 * computation. Hooks/components depend on these instead of importing
 * repositories directly (docs/DO_NOT_BREAK.md "Repositories"). GL posting
 * goes through the real `journalEntryService` singleton imported from
 * `@/features/accounting/services` — an import only, never an edit to
 * anything under src/features/accounting, per this dispatch's scope
 * boundary.
 */
const bankAccountRepository = new MockBankAccountRepository();
const bankTransactionRepository = new MockBankTransactionRepository();
const bankReconciliationRepository = new MockBankReconciliationRepository();

export const bankAccountService = new BankAccountService(bankAccountRepository, bankTransactionRepository);
export const bankTransactionService = new BankTransactionService(
  bankTransactionRepository,
  bankAccountRepository,
  journalEntryService,
);
export const bankReconciliationService = new BankReconciliationService(
  bankReconciliationRepository,
  bankTransactionRepository,
  bankAccountRepository,
  auditLogService,
);
