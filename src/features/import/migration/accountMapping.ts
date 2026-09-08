import type { AccountMappingChoice, AccountMappingSelections, ExternalAccountRef } from '../types';

/** One row of the Account Mapping step's table — a suggestion, never applied automatically (Part 25/7: exact-code match only, always shown for confirmation). */
export interface AccountMappingSuggestion {
  ref: ExternalAccountRef;
  /** Set only when the external code matches an existing Vertex account's code EXACTLY (case/whitespace-insensitive) — never a name-similarity guess. */
  suggestedAccountId?: string;
}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Safe auto-mapping (Part 7): an external account code that matches an
 * existing Vertex account's `code` exactly becomes a pre-filled suggestion —
 * still shown to the user on the Account Mapping step for confirmation,
 * never applied silently. Everything else is left unmapped ("Requires
 * review"). No name-similarity/fuzzy matching anywhere in this function.
 */
export function suggestAccountMappings(
  refs: ExternalAccountRef[],
  accounts: { id: string; code: string; name: string }[],
): AccountMappingSuggestion[] {
  const byCode = new Map(accounts.map((a) => [normalizeCode(a.code), a.id]));
  return refs.map((ref) => ({
    ref,
    suggestedAccountId: byCode.get(normalizeCode(ref.code)),
  }));
}

function isWellFormedChoice(value: unknown): value is AccountMappingChoice {
  if (!value || typeof value !== 'object') return false;
  const action = (value as { action?: unknown }).action;
  if (action === 'ignore') return true;
  if (action === 'existing') return typeof (value as { accountId?: unknown }).accountId === 'string';
  if (action === 'create') {
    const v = value as { accountType?: unknown; code?: unknown; name?: unknown };
    return (
      typeof v.code === 'string' &&
      typeof v.name === 'string' &&
      typeof v.accountType === 'string' &&
      ['asset', 'liability', 'equity', 'revenue', 'expense'].includes(v.accountType)
    );
  }
  return false;
}

/**
 * Restores a saved mapping profile's `accountMappings` for the external
 * codes actually present in THIS import (`refs`) — used to pre-fill the
 * Account Mapping step from a profile instead of only fresh
 * `suggestAccountMappings()` guesses. Still just pre-filled form state:
 * the step always renders for explicit user confirmation before `execute()`
 * runs (Part 25's "always shown for confirmation" applies equally to a
 * restored choice, not only a freshly suggested one).
 *
 * Safety (Part 7/25, "no silent fuzzy accounting mapping", extended to
 * stale profiles): an `'existing'` choice is honored ONLY when its
 * `accountId` is still present in `accounts` — the SAME company-scoped,
 * currently-mappable list `getMappableAccounts(ctx)` hands the step today.
 * That one membership check does triple duty: an account deleted since the
 * profile was saved, one since deactivated (adapters only offer active
 * accounts — see trialBalanceImportAdapter/glDetailImportAdapter), and one
 * belonging to a different company entirely (a profile's JSON can only ever
 * be read back through this company's own RLS-scoped `accounts` list) all
 * fail the same way: the id simply isn't in `accounts`, so the stored
 * choice is dropped rather than trusted, and the code falls back to
 * whatever `suggestAccountMappings` would otherwise offer (usually "Requires
 * review"). Matching is by exact stored `code` only — never by name or
 * partial code, same rule as `suggestAccountMappings`.
 */
export function restoreAccountMappingSelections(
  stored: Record<string, unknown>,
  refs: ExternalAccountRef[],
  accounts: { id: string; code: string; name: string }[],
): AccountMappingSelections {
  const validAccountIds = new Set(accounts.map((a) => a.id));
  const result: AccountMappingSelections = {};
  for (const ref of refs) {
    const choice = stored[ref.code];
    if (!isWellFormedChoice(choice)) continue;
    if (choice.action === 'existing' && !validAccountIds.has(choice.accountId)) continue;
    result[ref.code] = choice;
  }
  return result;
}
