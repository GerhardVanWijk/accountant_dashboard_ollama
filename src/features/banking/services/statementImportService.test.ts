import { describe, it, expect } from 'vitest';
import { StatementImportService, hashStatementLines, computeBalanceCheck } from './statementImportService';
import { MockBankStatementRepository } from '../repositories/MockBankStatementRepository';
import { MockBankStatementLineRepository } from '../repositories/MockBankStatementLineRepository';
import type { ParsedStatement, ParsedStatementLine } from '../types';

const BANK_ACCOUNT_ID = 'bank-account-1';

function line(overrides: Partial<ParsedStatementLine>): ParsedStatementLine {
  return {
    sourceRowId: 'r',
    date: '2026-08-05T00:00:00.000Z',
    description: 'Customer payment',
    amount: 100,
    direction: 'debit',
    raw: {},
    ...overrides,
  };
}

/** MT940 with :60F:/:62F: that foots exactly: 10000 + 1500 - 25 = 11475. */
const MT940_BALANCED = [
  ':20:AUG',
  ':60F:C260801ZAR10000,00',
  ':61:2608050805C1500,00NMSCREC-1',
  ':86:Customer receipt',
  ':61:2608060806D25,00NMSCFEE-1',
  ':86:Service fee',
  ':62F:C260831ZAR11475,00',
].join('\n');

/** Same lines, closing balance deliberately wrong by 100. */
const MT940_UNBALANCED = MT940_BALANCED.replace('11475,00', '11575,00');

/** CSV — no opening/closing metadata at all. */
const CSV_NO_META = ['Date,Description,Amount', '05/08/2026,Customer payment,100.00', '06/08/2026,Bank fee,-25.00'].join('\n');

function setup() {
  const statementRepo = new MockBankStatementRepository();
  const lineRepo = new MockBankStatementLineRepository();
  const service = new StatementImportService(statementRepo, lineRepo);
  return { service, statementRepo, lineRepo };
}

describe('hashStatementLines', () => {
  it('is stable when the same lines are supplied in a different order', () => {
    const a = [line({ date: '2026-08-01T00:00:00.000Z', amount: 10 }), line({ date: '2026-08-02T00:00:00.000Z', amount: 20 })];
    const b = [a[1], a[0]];
    expect(hashStatementLines(a)).toBe(hashStatementLines(b));
  });

  it('changes when an amount changes', () => {
    const a = [line({ amount: 10 })];
    const b = [line({ amount: 10.01 })];
    expect(hashStatementLines(a)).not.toBe(hashStatementLines(b));
  });
});

describe('computeBalanceCheck', () => {
  const base: ParsedStatement = { lines: [line({ amount: 1500, direction: 'debit' }), line({ amount: 25, direction: 'credit' })], parseErrors: [], format: 'mt940' };

  it('ok when opening + net == closing', () => {
    const result = computeBalanceCheck({ ...base, openingBalance: 10000, closingBalance: 11475 });
    expect(result.ok).toBe(true);
    expect(result.impliedClosing).toBe(11475);
    expect(result.delta).toBe(0);
  });

  it('not ok when the statement does not foot, reporting the delta', () => {
    const result = computeBalanceCheck({ ...base, openingBalance: 10000, closingBalance: 11575 });
    expect(result.ok).toBe(false);
    expect(result.delta).toBe(-100);
  });

  it('null when the file carries no opening/closing pair', () => {
    expect(computeBalanceCheck({ ...base }).ok).toBeNull();
  });
});

describe('StatementImportService.previewImport', () => {
  it('parses without writing, returns hash + balanceCheck ok', async () => {
    const { service, statementRepo, lineRepo } = setup();
    const preview = await service.previewImport(BANK_ACCOUNT_ID, 'aug.mt940', MT940_BALANCED);
    expect(preview.parsed.lines).toHaveLength(2);
    expect(preview.contentHash).toHaveLength(64);
    expect(preview.balanceCheck.ok).toBe(true);
    expect(preview.duplicateOf).toBeUndefined();
    expect(await statementRepo.getByCompany()).toHaveLength(0);
    expect(await lineRepo.getByStatement('any')).toHaveLength(0);
  });

  it('flags balanceCheck.ok === false for a statement that does not foot', async () => {
    const { service } = setup();
    const preview = await service.previewImport(BANK_ACCOUNT_ID, 'aug.mt940', MT940_UNBALANCED);
    expect(preview.balanceCheck.ok).toBe(false);
    expect(preview.balanceCheck.delta).toBe(-100);
  });

  it('returns balanceCheck.ok === null for a CSV with no opening/closing', async () => {
    const { service } = setup();
    const preview = await service.previewImport(BANK_ACCOUNT_ID, 'aug.csv', CSV_NO_META);
    expect(preview.balanceCheck.ok).toBeNull();
  });

  it('surfaces a previously-imported statement as duplicateOf', async () => {
    const { service } = setup();
    const first = await service.previewImport(BANK_ACCOUNT_ID, 'aug.mt940', MT940_BALANCED);
    await service.confirmImport(BANK_ACCOUNT_ID, first, 'tester');

    const second = await service.previewImport(BANK_ACCOUNT_ID, 'aug-again.mt940', MT940_BALANCED);
    expect(second.duplicateOf).toBeDefined();
    expect(second.duplicateOf?.sourceFilename).toBe('aug.mt940');
  });

  it('throws when the format cannot be determined', async () => {
    const { service } = setup();
    await expect(service.previewImport(BANK_ACCOUNT_ID, 'statement.pdf', 'x')).rejects.toThrow(/format/i);
  });
});

describe('StatementImportService.confirmImport', () => {
  it('persists exactly one statement and N lines, with no GL / bank_transaction side effects', async () => {
    const { service, statementRepo, lineRepo } = setup();
    const preview = await service.previewImport(BANK_ACCOUNT_ID, 'aug.mt940', MT940_BALANCED);
    const result = await service.confirmImport(BANK_ACCOUNT_ID, preview, 'system (test)');

    expect(result.lineCount).toBe(2);
    const statements = await statementRepo.getByCompany();
    expect(statements).toHaveLength(1);
    expect(statements[0].importStatus).toBe('imported');
    expect(statements[0].reconciliationStatus).toBe('not_started');
    expect(statements[0].lineCount).toBe(2);
    expect(statements[0].contentHash).toBe(preview.contentHash);
    expect(statements[0].balanceCheckOk).toBe(true);
    expect(statements[0].openingBalance).toBe(10000);
    expect(statements[0].closingBalance).toBe(11475);

    const lines = await lineRepo.getByStatement(result.statement.id);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.sequence)).toEqual([1, 2]);
    expect(lines.every((l) => l.lineState === 'unmatched')).toBe(true);
    expect(lines.every((l) => l.matchedBankTransactionId === undefined)).toBe(true);
    expect(lines[0].rawSource).toBeTruthy();

    // The service is constructed with only statement + line repositories — it
    // has no journal or bank-transaction dependency to create anything else.
    expect((service as unknown as Record<string, unknown>).journalEntryService).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).bankTransactionRepository).toBeUndefined();
  });

  it('refuses a duplicate unless allowDuplicate is set', async () => {
    const { service, statementRepo } = setup();
    const first = await service.previewImport(BANK_ACCOUNT_ID, 'aug.mt940', MT940_BALANCED);
    await service.confirmImport(BANK_ACCOUNT_ID, first, 'tester');

    const dupPreview = await service.previewImport(BANK_ACCOUNT_ID, 'aug.mt940', MT940_BALANCED);
    await expect(service.confirmImport(BANK_ACCOUNT_ID, dupPreview, 'tester')).rejects.toThrow(/already imported/i);

    const forced = await service.confirmImport(BANK_ACCOUNT_ID, dupPreview, 'tester', { allowDuplicate: true });
    expect(forced.lineCount).toBe(2);
    expect(await statementRepo.getByCompany()).toHaveLength(2);
  });

  it('derives period + closing balance from the lines when the file carries no metadata', async () => {
    const { service } = setup();
    const preview = await service.previewImport(BANK_ACCOUNT_ID, 'aug.csv', CSV_NO_META);
    const { statement } = await service.confirmImport(BANK_ACCOUNT_ID, preview, 'tester');
    expect(statement.periodStart).toBe('2026-08-05T00:00:00.000Z');
    expect(statement.periodEnd).toBe('2026-08-06T00:00:00.000Z');
    expect(statement.openingBalance).toBe(0);
    expect(statement.closingBalance).toBe(75); // 0 + 100 - 25
    expect(statement.balanceCheckOk).toBeUndefined(); // null check -> not stored
  });
});
