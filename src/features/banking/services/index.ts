import { BankAccountService } from './bankAccountService';
import { BankTransactionService } from './bankTransactionService';
import { BankReconciliationService } from './bankReconciliationService';
import { SupabaseBankAccountRepository } from '../repositories/SupabaseBankAccountRepository';
import { SupabaseBankTransactionRepository } from '../repositories/SupabaseBankTransactionRepository';
import { SupabaseBankReconciliationRepository } from '../repositories/SupabaseBankReconciliationRepository';
import { accountMappingService, journalEntryService } from '@/features/accounting/services';
import { auditLogService } from '@/services/auditLogService';
import { supabase } from '@/config/supabase';

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
 * Wires the Banking services to their repositories, shared singletons so a
 * transaction posted through bankTransactionService is immediately visible
 * to bankReconciliationService's balance computation. Hooks/components
 * depend on these instead of importing repositories directly
 * (docs/DO_NOT_BREAK.md "Repositories"). GL posting goes through the real
 * `journalEntryService` singleton imported from
 * `@/features/accounting/services` — an import only, never an edit to
 * anything under src/features/accounting, per this dispatch's scope
 * boundary.
 *
 * `bankAccountRepository` (master data, Phase D), `bankTransactionRepository`
 * (transactional, Phase E), and `bankReconciliationRepository`
 * (reconciliation persistence — `reconciliations` table, RLS append-only,
 * see docs/SUPABASE_MIGRATION_GUIDE.md) are all Supabase-backed.
 */
const bankAccountRepository = new SupabaseBankAccountRepository(supabase);
const bankTransactionRepository = new SupabaseBankTransactionRepository(supabase);
const bankReconciliationRepository = new SupabaseBankReconciliationRepository(supabase);

export const bankAccountService = new BankAccountService(bankAccountRepository, bankTransactionRepository);
export const bankTransactionService = new BankTransactionService(
  bankTransactionRepository,
  bankAccountRepository,
  journalEntryService,
  accountMappingService,
);
export const bankReconciliationService = new BankReconciliationService(
  bankReconciliationRepository,
  bankTransactionRepository,
  bankAccountRepository,
  auditLogService,
);
