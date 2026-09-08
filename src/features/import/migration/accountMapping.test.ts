import { describe, it, expect } from 'vitest';
import { suggestAccountMappings, restoreAccountMappingSelections } from './accountMapping';

describe('suggestAccountMappings', () => {
  const accounts = [
    { id: 'acc_1', code: '1000', name: 'Bank' },
    { id: 'acc_2', code: '4000', name: 'Sales Revenue' },
  ];

  it('suggests an exact (normalized) code match', () => {
    const result = suggestAccountMappings([{ code: ' 1000 ' }], accounts);
    expect(result[0].suggestedAccountId).toBe('acc_1');
  });

  it('leaves an unmatched code unresolved — no fuzzy/name-similarity guessing', () => {
    const result = suggestAccountMappings([{ code: '1000A' }, { code: 'Bank Account' }], accounts);
    expect(result[0].suggestedAccountId).toBeUndefined();
    expect(result[1].suggestedAccountId).toBeUndefined();
  });

  it('never matches on name similarity alone', () => {
    const result = suggestAccountMappings([{ code: '9999', name: 'Sales Revenue' }], accounts);
    expect(result[0].suggestedAccountId).toBeUndefined();
  });
});

describe('restoreAccountMappingSelections', () => {
  const accounts = [
    { id: 'acc_1', code: '1000', name: 'Bank' },
    { id: 'acc_2', code: '4000', name: 'Sales Revenue' },
  ];
  const refs = [{ code: '1000' }, { code: '4000' }, { code: '5000' }];

  it('restores a saved "existing" choice for a code present in this import', () => {
    const restored = restoreAccountMappingSelections({ '1000': { action: 'existing', accountId: 'acc_1' } }, refs, accounts);
    expect(restored['1000']).toEqual({ action: 'existing', accountId: 'acc_1' });
  });

  it('restores a saved "ignore"/"create" choice as-is', () => {
    const restored = restoreAccountMappingSelections(
      {
        '1000': { action: 'ignore' },
        '4000': { action: 'create', accountType: 'expense', code: '4000', name: 'New Expense' },
      },
      refs,
      accounts,
    );
    expect(restored['1000']).toEqual({ action: 'ignore' });
    expect(restored['4000']).toEqual({ action: 'create', accountType: 'expense', code: '4000', name: 'New Expense' });
  });

  it('drops an "existing" choice whose account id no longer appears in the current mappable list — deactivated or deleted (invalid/deactivated destination)', () => {
    // Deactivated accounts are already filtered out of getMappableAccounts()'s output before this ever sees them (see trialBalanceImportAdapter.ts) — so "not in `accounts`" IS what "deactivated" looks like here.
    const restored = restoreAccountMappingSelections({ '1000': { action: 'existing', accountId: 'acc_deactivated' } }, refs, accounts);
    expect(restored['1000']).toBeUndefined();
  });

  it('drops an "existing" choice whose account id belongs to a different company (company isolation)', () => {
    // `accounts` here stands in for THIS company's RLS-scoped getMappableAccounts() result — an id from another company's chart (even if it was a valid, active account there) simply never appears in it.
    const restored = restoreAccountMappingSelections({ '1000': { action: 'existing', accountId: 'acc_other_company' } }, refs, accounts);
    expect(restored['1000']).toBeUndefined();
  });

  it('never restores by name or partial-code similarity — only an exact stored code (no fuzzy fallback)', () => {
    const restored = restoreAccountMappingSelections(
      { 'Bank Account': { action: 'existing', accountId: 'acc_1' }, '100': { action: 'existing', accountId: 'acc_1' } },
      refs,
      accounts,
    );
    expect(restored['1000']).toBeUndefined();
    expect(Object.keys(restored)).toHaveLength(0);
  });

  it('ignores a code from the profile that is not part of this import, and a malformed stored entry', () => {
    const restored = restoreAccountMappingSelections(
      { '9999': { action: 'existing', accountId: 'acc_1' }, '5000': { action: 'not-a-real-action' } },
      refs,
      accounts,
    );
    expect(restored).toEqual({});
  });
});
