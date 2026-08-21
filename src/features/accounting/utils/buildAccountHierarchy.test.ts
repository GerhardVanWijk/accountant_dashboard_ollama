import { describe, expect, it } from 'vitest';
import type { Account } from '@/types';
import { buildAccountHierarchy } from './buildAccountHierarchy';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_x',
    code: '1000',
    name: 'Account X',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildAccountHierarchy', () => {
  it('groups accounts by master type in Assets/Liabilities/Equity/Revenue/Expenses order', () => {
    const accounts: Account[] = [
      makeAccount({ id: 'acc_rev', code: '4000', type: 'revenue' }),
      makeAccount({ id: 'acc_asset', code: '1000', type: 'asset' }),
      makeAccount({ id: 'acc_liab', code: '2000', type: 'liability' }),
    ];
    const groups = buildAccountHierarchy(accounts);
    expect(groups.map((g) => g.type)).toEqual(['asset', 'liability', 'revenue']);
  });

  it('omits groups with no accounts', () => {
    const accounts: Account[] = [makeAccount({ id: 'acc_asset', type: 'asset' })];
    const groups = buildAccountHierarchy(accounts);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('asset');
  });

  it('orders parent accounts before their children with increasing depth', () => {
    const accounts: Account[] = [
      makeAccount({ id: 'acc_child', code: '1010', name: 'Petty Cash', parentAccountId: 'acc_parent' }),
      makeAccount({ id: 'acc_parent', code: '1000', name: 'Cash and Bank' }),
    ];
    const groups = buildAccountHierarchy(accounts);
    const rows = groups[0].rows;
    expect(rows.map((r) => r.account.id)).toEqual(['acc_parent', 'acc_child']);
    expect(rows[0].depth).toBe(0);
    expect(rows[1].depth).toBe(1);
  });

  it('treats a dangling parentAccountId (parent not found) as top-level', () => {
    const accounts: Account[] = [makeAccount({ id: 'acc_orphan', parentAccountId: 'does_not_exist' })];
    const groups = buildAccountHierarchy(accounts);
    expect(groups[0].rows[0].depth).toBe(0);
  });

  it('never infinite-loops on a cyclic parent chain', () => {
    const accounts: Account[] = [
      makeAccount({ id: 'acc_a', code: '1000', parentAccountId: 'acc_b' }),
      makeAccount({ id: 'acc_b', code: '1001', parentAccountId: 'acc_a' }),
    ];
    const groups = buildAccountHierarchy(accounts);
    // Both accounts are mutually parented — neither can ever be reached from
    // the top-level walk, so the hierarchy legitimately renders neither
    // rather than looping forever.
    expect(groups).toEqual([]);
  });
});
