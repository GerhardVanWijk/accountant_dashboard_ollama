import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Account } from '@/types';
import { chartOfAccountsImportAdapter } from './chartOfAccountsImportAdapter';
import { accountService } from '@/features/accounting/services';
import type { ImportRowResult } from '../types';
import type { ChartOfAccountsImportContext, ChartOfAccountsImportRow } from './chartOfAccountsImportAdapter';

vi.mock('@/features/accounting/services', () => ({
  accountService: { getAccounts: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), hasPostings: vi.fn() },
}));

const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;
const mockedCreateAccount = accountService.createAccount as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateAccount = accountService.updateAccount as unknown as ReturnType<typeof vi.fn>;
const mockedHasPostings = accountService.hasPostings as unknown as ReturnType<typeof vi.fn>;

function makeAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acc_1', code: '1000', name: 'Bank', type: 'asset', normalBalance: 'debit', isActive: true, createdAt: '', updatedAt: '', ...overrides };
}

describe('chartOfAccountsImportAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAccounts.mockResolvedValue([]);
    mockedHasPostings.mockResolvedValue(false);
    mockedCreateAccount.mockImplementation(async (dto) => ({ id: `acc_${dto.code}`, ...dto, createdAt: '', updatedAt: '' }));
  });

  describe('normalizeRow', () => {
    it('accepts a valid row', async () => {
      const ctx = await chartOfAccountsImportAdapter.loadContext();
      const { normalized, messages } = chartOfAccountsImportAdapter.normalizeRow({ code: '4000', name: 'Sales', type: 'Revenue' }, 2, ctx);
      expect(normalized).toMatchObject({ code: '4000', name: 'Sales', type: 'revenue' });
      expect(messages).toEqual([]);
    });

    it('rejects an unrecognized account type', async () => {
      const ctx = await chartOfAccountsImportAdapter.loadContext();
      const { normalized, messages } = chartOfAccountsImportAdapter.normalizeRow({ code: '4000', name: 'Sales', type: 'Nonsense' }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.field === 'type' && m.severity === 'error')).toBe(true);
    });

    it('rejects an account that is its own parent', async () => {
      const ctx = await chartOfAccountsImportAdapter.loadContext();
      const { normalized, messages } = chartOfAccountsImportAdapter.normalizeRow({ code: '4000', name: 'Sales', type: 'revenue', parentCode: '4000' }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.severity === 'error')).toBe(true);
    });
  });

  describe('detectDuplicates', () => {
    it('errors on a code repeated within the same file', async () => {
      const ctx: ChartOfAccountsImportContext = { existingByCode: new Map() };
      const rows: ImportRowResult<ChartOfAccountsImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { code: '4000', name: 'Sales', type: 'revenue', active: true }, severity: 'valid', messages: [] },
        { rowNumber: 3, raw: {}, normalized: { code: '4000', name: 'Sales Duplicate', type: 'revenue', active: true }, severity: 'valid', messages: [] },
      ];
      const result = chartOfAccountsImportAdapter.detectDuplicates(rows, ctx);
      expect(result[1].severity).toBe('error');
    });

    it('flags an existing account code as duplicate', async () => {
      const existing = makeAccount({ id: 'acc_x', code: '4000' });
      const ctx: ChartOfAccountsImportContext = { existingByCode: new Map([['4000', existing]]) };
      const rows: ImportRowResult<ChartOfAccountsImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { code: '4000', name: 'Sales', type: 'revenue', active: true }, severity: 'valid', messages: [] },
      ];
      const result = chartOfAccountsImportAdapter.detectDuplicates(rows, ctx);
      expect(result[0].severity).toBe('duplicate');
    });
  });

  describe('execute', () => {
    it('blocks the whole batch on a circular parent hierarchy', async () => {
      const ctx: ChartOfAccountsImportContext = { existingByCode: new Map() };
      const rows: ImportRowResult<ChartOfAccountsImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { code: 'A', name: 'A', type: 'asset', parentCode: 'B', active: true }, severity: 'valid', messages: [] },
        { rowNumber: 3, raw: {}, normalized: { code: 'B', name: 'B', type: 'asset', parentCode: 'A', active: true }, severity: 'valid', messages: [] },
      ];
      const summary = await chartOfAccountsImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'u1', params: {} });
      expect(summary.errored).toBe(2);
      expect(summary.imported).toBe(0);
      expect(mockedCreateAccount).not.toHaveBeenCalled();
    });

    it('creates new accounts and links parents in a second pass', async () => {
      const ctx: ChartOfAccountsImportContext = { existingByCode: new Map() };
      const rows: ImportRowResult<ChartOfAccountsImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { code: '1000', name: 'Assets', type: 'asset', active: true }, severity: 'valid', messages: [] },
        { rowNumber: 3, raw: {}, normalized: { code: '1100', name: 'Bank', type: 'asset', parentCode: '1000', active: true }, severity: 'valid', messages: [] },
      ];
      const summary = await chartOfAccountsImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'u1', params: {} });
      expect(summary.imported).toBe(2);
      expect(mockedCreateAccount).toHaveBeenCalledTimes(2);
      expect(mockedUpdateAccount).toHaveBeenCalledWith('acc_1100', { parentAccountId: 'acc_1000' });
    });

    it('never overwrites the type of an account with posted history', async () => {
      const existing = makeAccount({ id: 'acc_x', code: '4000', type: 'revenue' });
      mockedHasPostings.mockResolvedValue(true);
      const ctx: ChartOfAccountsImportContext = { existingByCode: new Map([['4000', existing]]) };
      const rows: ImportRowResult<ChartOfAccountsImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { code: '4000', name: 'Sales Renamed', type: 'expense', active: true }, severity: 'duplicate', messages: [] },
      ];
      await chartOfAccountsImportAdapter.execute(rows, ctx, { duplicateStrategy: 'update', actorUserId: 'u1', params: {} });
      const patch = mockedUpdateAccount.mock.calls[0][1];
      expect(patch.type).toBeUndefined();
      expect(patch.name).toBe('Sales Renamed');
    });
  });
});
