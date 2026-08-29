import { AccountService } from './accountService';
import { JournalEntryService } from './journalEntryService';
import { AccountingPeriodService } from './accountingPeriodService';
import { FinancialYearService } from './financialYearService';
import { AccountMappingService } from './accountMappingService';
import { CategoryAccountMappingService } from './categoryAccountMappingService';
import { SupabaseAccountRepository } from '../repositories/SupabaseAccountRepository';
import { SupabaseCategoryAccountMappingRepository } from '../repositories/SupabaseCategoryAccountMappingRepository';
import { SupabaseJournalEntryRepository } from '../repositories/SupabaseJournalEntryRepository';
import { SupabaseAccountingPeriodRepository } from '../repositories/SupabaseAccountingPeriodRepository';
import { SupabaseFinancialYearRepository } from '../repositories/SupabaseFinancialYearRepository';
import { supabase } from '@/config/supabase';
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
export type { AccountMappingKey, AccountMapper } from './accountMappingService';
export { AccountMappingService } from './accountMappingService';
export type { CategoryAccountResolver, ResolvedCategoryAccounts } from './categoryAccountMappingService';
export { CategoryAccountMappingService, nullCategoryAccountResolver } from './categoryAccountMappingService';
export { bucketByAccount, roundToCents } from './journalAccountSplit';
export type { AccountBucket, AccountContribution } from './journalAccountSplit';

/**
 * Wires the services to their Phase 0-style mock repositories, shared so a
 * posting made through journalEntryService is immediately visible to
 * accountService.hasPostings() and subject to accountingPeriodService's
 * period-open rule. Hooks depend on these singletons instead of importing
 * repositories directly.
 */
// Phase B (docs/SUPABASE_MIGRATION_GUIDE.md): Account, AccountingPeriod, and
// FinancialYear are Supabase-backed. Phase C: JournalEntry is Supabase-backed
// too now, with append-only enforcement at the DB layer (RLS + revoked
// UPDATE/DELETE grants) and an atomic header+lines RPC insert.
const accountRepository = new SupabaseAccountRepository(supabase);
const journalRepository = new SupabaseJournalEntryRepository(supabase);
const periodRepository = new SupabaseAccountingPeriodRepository(supabase);
const financialYearRepository = new SupabaseFinancialYearRepository(supabase);

export const accountService = new AccountService(accountRepository, journalRepository);
export const accountingPeriodService = new AccountingPeriodService(periodRepository, auditLogService);
export const financialYearService = new FinancialYearService(financialYearRepository, auditLogService);
export const journalEntryService = new JournalEntryService(
  journalRepository,
  accountRepository,
  periodRepository,
  auditLogService,
);
/**
 * Phase E.5 (docs/SUPABASE_MIGRATION_GUIDE.md): resolves the hardcoded
 * `acc_XXXX` account-id constants Sales/Purchases posting services used to
 * carry into real Chart of Accounts lookups by code. See
 * accountMappingService.ts's doc comment for what this does and doesn't
 * cover.
 */
export const accountMappingService = new AccountMappingService(accountService);
/**
 * Phase 21.3 (docs/OFFICE_NATIONAL_DEMO_TASKS.md): resolves a
 * `products.category` value to the granular revenue / COGS / inventory
 * accounts its postings should use, backed by the company-scoped
 * `category_account_mappings` table. The four posting paths
 * (invoice / credit note / bill / their COGS+inventory legs) resolve
 * per-line accounts through this, falling back to `accountMappingService`'s
 * generic `SALES_REVENUE` / `COGS` / `INVENTORY` keys when a line has no
 * product, no category, or an unmapped category.
 */
export const categoryAccountMappingService = new CategoryAccountMappingService(
  new SupabaseCategoryAccountMappingRepository(supabase),
);
