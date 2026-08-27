import { describe, expect, it } from 'vitest';
import { checkJournalEntriesBalance, checkOrphanedPostedDocuments, checkDuplicateGlPosting, checkTrialBalance } from './checks';
import type { JournalEntry } from '@/types';
import type { PostableDocumentLike } from './checks';

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    entryNumber: 'JE-0001',
    date: '2026-08-01',
    status: 'posted',
    source: 'manual',
    lines: [
      { id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 },
      { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 100 },
    ],
    ...overrides,
  };
}

describe('checkJournalEntriesBalance', () => {
  it('passes when every posted entry balances', () => {
    const result = checkJournalEntriesBalance([entry()]);
    expect(result.status).toBe('pass');
  });

  it('flags an entry where debits do not equal credits', () => {
    const bad = entry({
      id: 'je2',
      entryNumber: 'JE-0002',
      lines: [
        { id: 'l1', accountId: 'acc_1000', debit: 150, credit: 0 },
        { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 100 },
      ],
    });

    const result = checkJournalEntriesBalance([entry(), bad]);

    expect(result.status).toBe('warning');
    expect(result.detail).toContain('JE-0002');
  });
});

describe('checkTrialBalance', () => {
  it('passes when the trial balance is balanced', () => {
    expect(checkTrialBalance({ rows: [], totalDebits: 100, totalCredits: 100, balanced: true }).status).toBe('pass');
  });

  it('warns when the trial balance is not balanced', () => {
    expect(checkTrialBalance({ rows: [], totalDebits: 100, totalCredits: 90, balanced: false }).status).toBe('warning');
  });
});

describe('checkOrphanedPostedDocuments', () => {
  it('flags a document with a posted status but no journal entry', () => {
    const docs: PostableDocumentLike[] = [
      { id: '1', documentNumber: 'INV-0001', status: 'sent', journalEntryId: 'je1' },
      { id: '2', documentNumber: 'INV-0002', status: 'sent' },
    ];

    const result = checkOrphanedPostedDocuments('Invoices', 'invoice_gl_presence', docs, ['sent']);

    expect(result.status).toBe('warning');
    expect(result.detail).toContain('INV-0002');
  });

  it('passes when every posted-status document carries a journal entry', () => {
    const docs: PostableDocumentLike[] = [{ id: '1', documentNumber: 'INV-0001', status: 'sent', journalEntryId: 'je1' }];
    expect(checkOrphanedPostedDocuments('Invoices', 'invoice_gl_presence', docs, ['sent']).status).toBe('pass');
  });
});

describe('checkDuplicateGlPosting', () => {
  it('flags two documents pointing at the same journal entry', () => {
    const docs: PostableDocumentLike[] = [
      { id: '1', documentNumber: 'INV-0001', status: 'sent', journalEntryId: 'je1' },
      { id: '2', documentNumber: 'INV-0002', status: 'sent', journalEntryId: 'je1' },
    ];

    expect(checkDuplicateGlPosting('Invoices', 'invoice_duplicate_gl', docs).status).toBe('warning');
  });

  it('passes when every journal entry is referenced once', () => {
    const docs: PostableDocumentLike[] = [
      { id: '1', documentNumber: 'INV-0001', status: 'sent', journalEntryId: 'je1' },
      { id: '2', documentNumber: 'INV-0002', status: 'sent', journalEntryId: 'je2' },
    ];

    expect(checkDuplicateGlPosting('Invoices', 'invoice_duplicate_gl', docs).status).toBe('pass');
  });
});
