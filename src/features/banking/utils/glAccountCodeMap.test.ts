import { describe, it, expect } from 'vitest';
import type { Account } from '@/types';
import { buildGlAccountCodeMap } from './glAccountCodeMap';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_1000',
    code: '1000',
    name: 'Cash and Bank',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildGlAccountCodeMap', () => {
  it('maps each account id to its code', () => {
    const map = buildGlAccountCodeMap([
      makeAccount(),
      makeAccount({ id: 'acc_4000', code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit' }),
    ]);

    expect(map.get('acc_1000')).toBe('1000');
    expect(map.get('acc_4000')).toBe('4000');
  });

  it('returns an empty map for no accounts', () => {
    expect(buildGlAccountCodeMap([]).size).toBe(0);
  });
});
