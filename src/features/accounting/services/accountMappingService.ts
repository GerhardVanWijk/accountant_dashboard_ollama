import type { ID } from '@/types';
import type { AccountService } from './accountService';

/**
 * Semantic Chart of Accounts roles this codebase's posting/reporting code
 * needs to resolve to a real account id. Every key here corresponds 1:1 to
 * a `const XXX_ACCOUNT_ID = 'acc_XXXX'` constant that existed somewhere in
 * this codebase before Phase E.5/F-Preamble (docs/SUPABASE_MIGRATION_GUIDE.md)
 * — those constants only ever worked because Mock's in-memory account ids
 * literally equalled these strings; under Supabase, `accounts.id` is a
 * real `uuid` and `'acc_1100'` isn't valid UUID syntax at all (reproduced
 * live in Phase E).
 *
 * First 11 keys (AR..FIXED_ASSET) landed in Phase E.5 for the six
 * Sales/Purchases posting services. Everything below that landed in the
 * Phase F Preamble, covering the other ~20 files a full-codebase audit
 * found (Fixed Assets, ECL, Payroll, Leases, every Tax module, subledger
 * reconciliation, VAT/financial-statement reporting, the dashboard) — see
 * that section of the migration guide for exactly which file uses which
 * key. Many keys are intentionally shared across multiple files that
 * already posted/read against the identical account code (e.g.
 * `DEPRECIATION_EXPENSE` covers fixedAssetService, cashFlowStatementService,
 * AND taxComputationCalculations — one key, one source of truth, not three
 * near-duplicates).
 */
export type AccountMappingKey =
  | 'AR' // Accounts Receivable
  | 'AP' // Accounts Payable
  | 'SALES_REVENUE'
  | 'VAT_OUTPUT' // VAT Output (Payable)
  | 'VAT_INPUT' // VAT Input (Receivable)
  | 'COGS' // Cost of Goods Sold
  | 'INVENTORY'
  | 'INVENTORY_ADJUSTMENT' // 5050 — write-offs / shrinkage / damage / stock gains (physical stock differences)
  | 'PURCHASE_PRICE_VARIANCE' // 5060 — supplier credit/refund value vs WAC carrying cost (purchasing gain/loss)
  | 'INVENTORY_IN_TRANSIT' // 1210 — inter-warehouse transfers in transit
  | 'OPENING_BALANCE_EQUITY' // 3950 — opening-stock suspense
  | 'EXPENSE' // Operating Expenses
  | 'CASH_AND_BANK'
  | 'GRNI' // Goods Received Not Invoiced
  | 'FIXED_ASSET'
  | 'ACCUMULATED_DEPRECIATION'
  | 'DEPRECIATION_EXPENSE'
  | 'GAIN_ON_DISPOSAL'
  | 'LOSS_ON_DISPOSAL'
  | 'ALLOWANCE_FOR_DOUBTFUL_DEBTS'
  | 'IMPAIRMENT_LOSS'
  | 'SALARIES_EXPENSE'
  | 'UIF_EMPLOYER_EXPENSE'
  | 'SDL_EXPENSE'
  | 'PAYE_PAYABLE'
  | 'UIF_EMPLOYEE_PAYABLE'
  | 'UIF_EMPLOYER_PAYABLE'
  | 'SDL_PAYABLE'
  | 'OTHER_DEDUCTIONS_PAYABLE'
  | 'RIGHT_OF_USE_ASSET'
  | 'LEASE_LIABILITY'
  | 'ACCUMULATED_DEPRECIATION_ROU'
  | 'DEPRECIATION_EXPENSE_ROU'
  | 'INTEREST_EXPENSE_LEASE'
  | 'INCOME_TAX_PAYABLE'
  | 'INCOME_TAX_EXPENSE'
  | 'DEFERRED_TAX_ASSET'
  | 'DEFERRED_TAX_LIABILITY'
  | 'DEFERRED_TAX_EXPENSE'
  | 'RETAINED_EARNINGS'
  | 'DIVIDENDS_PAYABLE'
  | 'DIVIDENDS_TAX_PAYABLE'
  | 'OWNERS_EQUITY';

/**
 * The actual Chart of Accounts code convention every `acc_XXXX` constant
 * in this codebase already assumed (acc_1100 = code "1100" = Accounts
 * Receivable, etc.) — centralized here instead of duplicated per service.
 * This is still a hardcoded mapping, not a real configurable-per-company
 * mapping table (the "Known gap" docs/LEDGER_ARCHITECTURE.md already
 * flagged) — what changed is WHAT it resolves to (a real account looked
 * up by code, not a Mock-only literal id), not that a fixed code
 * convention exists at all. Building a genuine configurable mapping
 * (company-specific, UI-editable) is a separate, larger feature.
 */
const ACCOUNT_CODE_BY_KEY: Record<AccountMappingKey, string> = {
  AR: '1100',
  AP: '2000',
  SALES_REVENUE: '4000',
  VAT_OUTPUT: '2100',
  VAT_INPUT: '2110',
  COGS: '5000',
  INVENTORY: '1200',
  INVENTORY_ADJUSTMENT: '5050',
  PURCHASE_PRICE_VARIANCE: '5060',
  INVENTORY_IN_TRANSIT: '1210',
  OPENING_BALANCE_EQUITY: '3950',
  EXPENSE: '5100',
  CASH_AND_BANK: '1000',
  GRNI: '2050',
  FIXED_ASSET: '1500',
  ACCUMULATED_DEPRECIATION: '1590',
  DEPRECIATION_EXPENSE: '5200',
  GAIN_ON_DISPOSAL: '4200',
  LOSS_ON_DISPOSAL: '5300',
  ALLOWANCE_FOR_DOUBTFUL_DEBTS: '1150',
  IMPAIRMENT_LOSS: '5700',
  SALARIES_EXPENSE: '5400',
  UIF_EMPLOYER_EXPENSE: '5410',
  SDL_EXPENSE: '5420',
  PAYE_PAYABLE: '2200',
  UIF_EMPLOYEE_PAYABLE: '2210',
  UIF_EMPLOYER_PAYABLE: '2220',
  SDL_PAYABLE: '2230',
  OTHER_DEDUCTIONS_PAYABLE: '2240',
  RIGHT_OF_USE_ASSET: '1700',
  LEASE_LIABILITY: '2450',
  ACCUMULATED_DEPRECIATION_ROU: '1790',
  DEPRECIATION_EXPENSE_ROU: '5800',
  INTEREST_EXPENSE_LEASE: '5810',
  INCOME_TAX_PAYABLE: '2300',
  INCOME_TAX_EXPENSE: '5500',
  DEFERRED_TAX_ASSET: '1600',
  DEFERRED_TAX_LIABILITY: '2400',
  DEFERRED_TAX_EXPENSE: '5600',
  RETAINED_EARNINGS: '3900',
  DIVIDENDS_PAYABLE: '2500',
  DIVIDENDS_TAX_PAYABLE: '2510',
  OWNERS_EQUITY: '3000',
};

/**
 * Minimal surface every posting service depends on — an interface, not the
 * concrete class, matching this codebase's established pattern for
 * cross-service dependencies (JournalPoster, InventoryMover, TaxRateResolver,
 * etc. in billService.ts/invoiceService.ts). Lets each service stay
 * unit-testable with a stub instead of reaching into
 * AccountMappingService/AccountService internals.
 */
export interface AccountMapper {
  getAccountId(key: AccountMappingKey): Promise<ID>;
}

/**
 * Resolves a semantic Chart of Accounts role (see AccountMappingKey) to the
 * real account id a posting service should use — replaces the hardcoded
 * `acc_XXXX` constants every Sales/Purchases posting service carried before
 * Phase E.5.
 *
 * Caches the whole Chart of Accounts after its first successful fetch (one
 * network round trip for the service instance's lifetime, not one per
 * journal line) rather than re-fetching per key. Known limitation, same
 * class as every other single-tenant "resolve once" cache in this codebase
 * (SupabaseAccountRepository's company-id cache, etc.): if this is first
 * called before a Chart of Accounts exists yet, and one is created later in
 * the same session, the cache won't pick up the new accounts without an
 * app reload. Acceptable for now — a real company's Chart of Accounts is
 * set up once, near the start of onboarding, not edited account-by-account
 * mid-session while postings are already happening.
 */
export class AccountMappingService {
  private cachedByCode: Map<string, ID> | undefined;

  constructor(private readonly accountService: AccountService) {}

  private async ensureCache(): Promise<Map<string, ID>> {
    if (this.cachedByCode) return this.cachedByCode;
    const accounts = await this.accountService.getAccounts();
    this.cachedByCode = new Map(accounts.map((account) => [account.code, account.id]));
    return this.cachedByCode;
  }

  async getAccountId(key: AccountMappingKey): Promise<ID> {
    const byCode = await this.ensureCache();
    const code = ACCOUNT_CODE_BY_KEY[key];
    const id = byCode.get(code);
    if (!id) {
      throw new Error(
        `AccountMappingService: no Chart of Accounts entry with code "${code}" (${key}) exists yet — create it before posting.`,
      );
    }
    return id;
  }
}
