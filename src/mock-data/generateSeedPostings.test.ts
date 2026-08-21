import { describe, it, expect } from 'vitest';
import { generateSeedPostings } from './generateSeedPostings';
import { seedInvoices } from './invoices';
import { seedBills } from './bills';
import { seedCreditNotes } from './creditNotes';
import { seedJournalEntryId } from './seedJournalEntryId';

describe('generateSeedPostings', () => {
  const entries = generateSeedPostings(seedInvoices, seedBills, seedCreditNotes, 2);

  it('produces a balanced entry (sum debit === sum credit) for every generated posting', () => {
    for (const entry of entries) {
      const totalDebit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredit = entry.lines.reduce((sum, l) => sum + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit, 2);
    }
  });

  it('generates exactly one entry per non-draft/non-void invoice and bill', () => {
    const nonDraftInvoices = seedInvoices.filter((i) => i.status !== 'draft' && i.status !== 'void');
    const nonDraftBills = seedBills.filter((b) => b.status !== 'draft' && b.status !== 'void');
    const nonDraftCreditNotes = seedCreditNotes.filter((c) => c.status !== 'draft' && c.status !== 'void');

    expect(entries).toHaveLength(nonDraftInvoices.length + nonDraftBills.length + nonDraftCreditNotes.length);
  });

  it('matches each seed document\'s journalEntryId to its generated entry', () => {
    for (const invoice of seedInvoices) {
      if (invoice.status === 'draft' || invoice.status === 'void') continue;
      expect(invoice.journalEntryId).toBe(seedJournalEntryId(invoice.id));
      expect(entries.find((e) => e.id === invoice.journalEntryId)).toBeDefined();
    }
    for (const bill of seedBills) {
      if (bill.status === 'draft' || bill.status === 'void') continue;
      expect(bill.journalEntryId).toBe(seedJournalEntryId(bill.id));
      expect(entries.find((e) => e.id === bill.journalEntryId)).toBeDefined();
    }
  });

  it('posts an invoice as debit AR / credit Sales Revenue + VAT Output, matching the real total', () => {
    const invoice = seedInvoices.find((i) => i.status === 'sent');
    expect(invoice).toBeDefined();
    const entry = entries.find((e) => e.id === invoice!.journalEntryId);
    expect(entry).toBeDefined();

    const ar = entry!.lines.find((l) => l.accountId === 'acc_1100');
    const revenue = entry!.lines.find((l) => l.accountId === 'acc_4000');
    const vatOutput = entry!.lines.find((l) => l.accountId === 'acc_2100');

    expect(ar?.debit).toBe(invoice!.total);
    expect(revenue?.credit).toBe(invoice!.subtotal);
    expect(vatOutput?.credit).toBe(invoice!.taxTotal);
  });

  it('posts a bill as debit Expense / credit AP, matching the real total (all seed bills are fully deductible standard-rate)', () => {
    const bill = seedBills.find((b) => b.status === 'awaiting_payment');
    expect(bill).toBeDefined();
    const entry = entries.find((e) => e.id === bill!.journalEntryId);
    expect(entry).toBeDefined();

    const expense = entry!.lines.find((l) => l.accountId === 'acc_5100');
    const vatInput = entry!.lines.find((l) => l.accountId === 'acc_2110');
    const ap = entry!.lines.find((l) => l.accountId === 'acc_2000');

    expect(expense?.debit).toBe(bill!.subtotal);
    expect(vatInput?.debit).toBe(bill!.taxTotal);
    expect(ap?.credit).toBe(bill!.total);
  });
});
