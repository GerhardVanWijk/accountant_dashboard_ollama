import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ParsedStatement } from '../types';
import type { StatementImportPreview } from '../services';

const { previewImport, confirmImport } = vi.hoisted(() => ({
  previewImport: vi.fn(),
  confirmImport: vi.fn(),
}));

vi.mock('../services', () => ({
  statementImportService: { previewImport, confirmImport },
}));
vi.mock('@/features/accounting/services', () => ({ SYSTEM_USER_ID: 'system' }));

import { useStatementImport } from './useStatementImport';

const parsed: ParsedStatement = {
  lines: [
    { sourceRowId: 'r1', date: '2026-08-05T00:00:00.000Z', description: 'Customer payment', amount: 100, direction: 'debit', raw: {} },
    { sourceRowId: 'r2', date: '2026-08-06T00:00:00.000Z', description: 'Bank fee', amount: 25, direction: 'credit', raw: {} },
  ],
  openingBalance: 1000,
  closingBalance: 1075,
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-08-31T00:00:00.000Z',
  format: 'csv',
  parseErrors: [],
};

function makePreview(overrides: Partial<StatementImportPreview> = {}): StatementImportPreview {
  return {
    bankAccountId: 'ba1',
    fileName: 'aug.csv',
    format: 'csv',
    parsed,
    contentHash: 'a'.repeat(64),
    balanceCheck: { ok: true, expectedClosing: 1075, impliedClosing: 1075, delta: 0 },
    ...overrides,
  };
}

const statement = { id: 'stmt1', lineCount: 2 } as StatementImportPreview['duplicateOf'];

function fakeFile(name = 'aug.csv', text = 'Date,Description,Amount\n'): File {
  return { name, text: async () => text } as unknown as File;
}

beforeEach(() => {
  previewImport.mockReset();
  confirmImport.mockReset();
});

describe('useStatementImport', () => {
  it('preview populates the preview result and moves to preview-ready', async () => {
    previewImport.mockResolvedValue(makePreview());
    const { result } = renderHook(() => useStatementImport());

    expect(result.current.status).toBe('idle');
    await act(async () => {
      await result.current.runPreview(fakeFile(), 'ba1');
    });

    expect(previewImport).toHaveBeenCalledWith('ba1', 'aug.csv', 'Date,Description,Amount\n', undefined);
    expect(result.current.status).toBe('preview-ready');
    expect(result.current.preview?.parsed.lines).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('passes a format override through to the service', async () => {
    previewImport.mockResolvedValue(makePreview());
    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.runPreview(fakeFile('aug.txt'), 'ba1', 'mt940');
    });
    expect(previewImport).toHaveBeenCalledWith('ba1', 'aug.txt', expect.any(String), 'mt940');
  });

  it('surfaces a failed preview as an error state', async () => {
    previewImport.mockRejectedValue(new Error('Could not determine the statement format'));
    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.runPreview(fakeFile('x.pdf'), 'ba1');
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/format/i);
    expect(result.current.preview).toBeNull();
  });

  it('surfaces a previously-imported statement as preview.duplicateOf', async () => {
    previewImport.mockResolvedValue(makePreview({ duplicateOf: statement }));
    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.runPreview(fakeFile(), 'ba1');
    });
    expect(result.current.preview?.duplicateOf).toBeDefined();
  });

  it('a duplicate confirm without allowDuplicate stays blocked (service rejects, error state, no statement)', async () => {
    previewImport.mockResolvedValue(makePreview({ duplicateOf: statement }));
    confirmImport.mockImplementation((_id, _preview, _by, opts?: { allowDuplicate?: boolean }) => {
      if (!opts?.allowDuplicate) return Promise.reject(new Error('This statement was already imported'));
      return Promise.resolve({ statement: { id: 'stmt2', lineCount: 2 }, lineCount: 2 });
    });
    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.runPreview(fakeFile(), 'ba1');
    });

    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/already imported/i);
    expect(result.current.statement).toBeNull();

    await act(async () => {
      await result.current.confirm({ allowDuplicate: true });
    });
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.statement).toEqual({ id: 'stmt2', lineCount: 2 });
    expect(result.current.lineCount).toBe(2);
  });

  it('confirm passes an importedBy actor and reaches done with the created statement', async () => {
    previewImport.mockResolvedValue(makePreview());
    confirmImport.mockResolvedValue({ statement: { id: 'stmtX', lineCount: 2 }, lineCount: 2 });
    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.runPreview(fakeFile(), 'ba1');
    });
    await act(async () => {
      await result.current.confirm();
    });
    expect(confirmImport).toHaveBeenCalledWith('ba1', expect.objectContaining({ contentHash: 'a'.repeat(64) }), 'system', undefined);
    expect(result.current.status).toBe('done');
  });

  it('confirm before a preview exists is a no-op error, never calls the service', async () => {
    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.confirm();
    });
    expect(confirmImport).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
  });

  it('reset clears preview, statement and error back to idle', async () => {
    previewImport.mockResolvedValue(makePreview());
    confirmImport.mockResolvedValue({ statement: { id: 'stmtX', lineCount: 2 }, lineCount: 2 });
    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.runPreview(fakeFile(), 'ba1');
    });
    await act(async () => {
      await result.current.confirm();
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.preview).toBeNull();
    expect(result.current.statement).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
