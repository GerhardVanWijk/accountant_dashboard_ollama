import type { Account } from '@/types';

/** Chart of Accounts entries, keyed by id, for BankAccountTable's "Ledger" line — pure reshaping, no lookups against a live service. */
export function buildGlAccountCodeMap(accounts: Account[]): Map<string, string> {
  return new Map(accounts.map((a) => [a.id, a.code]));
}
