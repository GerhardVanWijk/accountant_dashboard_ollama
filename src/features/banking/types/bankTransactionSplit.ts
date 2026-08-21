import type { BankTransaction, ID } from '@/types';

/**
 * One split-allocation line on a bank transaction: a portion of the
 * transaction's gross amount posted to a specific Chart of Accounts GL
 * account, with its own VAT treatment (docs/SA_ACCOUNTING_MASTER_SPEC.md —
 * Standard 15% / Zero-Rated / Exempt / Non-Deductible, via the shared
 * `TaxRate` model at src/types/taxRate.ts — never a parallel hardcoded tax
 * model, per docs/DO_NOT_BREAK.md "Tax & Accounting Logic").
 *
 * `netAmount` is the line amount before VAT; `taxAmount` is derived from
 * `netAmount` and the referenced TaxRate (0 when taxRateId is unset or the
 * rate is 0%). Across every allocation on one transaction,
 * sum(netAmount + taxAmount) must equal the transaction's `amount` —
 * enforced by bankTransactionService, not left to UI-only validation.
 */
export interface BankTransactionAllocation {
  id: ID;
  /** Chart of Accounts GL account this portion posts against. */
  glAccountId: ID;
  description?: string;
  netAmount: number;
  taxRateId?: ID;
  taxAmount: number;
}

/**
 * A BankTransaction together with its feature-local split-allocation lines.
 * Kept as a feature-local extension (rather than a field on the shared
 * `BankTransaction` type) so src/types never depends on a feature module —
 * see src/types/bankTransaction.ts's doc comments for the additive fields
 * that DO live on the shared type (journalEntryId, transferPairId,
 * reconciliationId, source).
 */
export interface BankTransactionWithAllocations extends BankTransaction {
  allocations: BankTransactionAllocation[];
}
