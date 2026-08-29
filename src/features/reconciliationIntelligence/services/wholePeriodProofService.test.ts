import { describe, expect, it } from 'vitest';
import { proveWholePeriod } from './wholePeriodProofService';
import type { InvestigationCandidate } from '../types';

function line(o: Partial<InvestigationCandidate>): InvestigationCandidate {
  return {
    id: o.id ?? 'l1',
    side: 'bank',
    kind: 'statement_line',
    date: '2026-08-10',
    description: 'Statement line',
    amountCents: 100000,
    bankStatementLineId: o.id ?? 'l1',
    ...o,
  };
}

function book(o: Partial<InvestigationCandidate>): InvestigationCandidate {
  return {
    id: o.id ?? 'k1',
    side: 'books',
    kind: 'bank_transaction',
    date: '2026-08-10',
    description: 'Books entry',
    amountCents: 100000,
    bankTransactionId: o.id ?? 'k1',
    ...o,
  };
}

describe('proveWholePeriod', () => {
  const windowStart = '2026-08-01';
  const windowEnd = '2026-08-31';

  const statementLineCandidates: InvestigationCandidate[] = [
    line({ id: 'lineA', amountCents: 100000, date: '2026-08-10', description: 'Customer receipt ABC', reference: 'R1' }),
    line({ id: 'lineD', amountCents: -50000, date: '2026-08-15', description: 'Rent EFT', reference: 'RENT' }),
    line({ id: 'lineFee', amountCents: -8500, date: '2026-08-22', description: 'Cash handling fee', reference: 'FEE' }),
  ];

  const booksCandidates: InvestigationCandidate[] = [
    book({ id: 'bookA', amountCents: 100000, date: '2026-08-10', description: 'Customer receipt ABC', reference: 'R1' }),
    book({ id: 'bookD1', amountCents: -50000, date: '2026-08-15', description: 'Rent EFT', reference: 'RENT' }),
    book({ id: 'bookD2', amountCents: -50000, date: '2026-08-15', description: 'Rent EFT', reference: 'RENT' }),
    book({ id: 'bookOutstanding', amountCents: -20000, date: '2026-08-28', description: 'Cheque 5001' }),
  ];

  it('statement -> books: flags a statement line with no accounting counterpart', () => {
    const proof = proveWholePeriod({ windowStart, windowEnd, statementLineCandidates, booksCandidates });

    const fee = proof.statementToBooks.items.find((i) => i.lineId === 'lineFee');
    expect(fee).toEqual({ lineId: 'lineFee', hasCounterpart: false, reason: 'none' });
    expect(proof.statementToBooks.withoutCounterpart).toBe(1);
    expect(proof.statementToBooks.withCounterpart).toBe(2); // lineA + lineD matched 1:1

    const matched = proof.statementToBooks.items.find((i) => i.lineId === 'lineA');
    expect(matched?.reason).toBe('matched');
    expect(matched?.counterpartId).toBe('bookA');
  });

  it('books -> statement: finds an outstanding-timing item and a duplicate books entry', () => {
    const proof = proveWholePeriod({ windowStart, windowEnd, statementLineCandidates, booksCandidates });

    const outstanding = proof.booksToStatement.items.find((i) => i.booksId === 'bookOutstanding');
    expect(outstanding?.hasStatementLine).toBe(false);
    expect(outstanding?.reason).toBe('outstanding_timing');

    const duplicate = proof.booksToStatement.items.find((i) => i.booksId === 'bookD2');
    expect(duplicate?.hasStatementLine).toBe(false);
    expect(duplicate?.reason).toBe('duplicate');

    // The real leg is matched.
    expect(proof.booksToStatement.items.find((i) => i.booksId === 'bookD1')?.reason).toBe('matched');
    expect(proof.booksToStatement.withoutStatementLine).toBe(2); // bookD2 + bookOutstanding
  });

  it('spots a wrong-bank-account posting when a match exists on another account', () => {
    const proof = proveWholePeriod({
      windowStart,
      windowEnd,
      statementLineCandidates: [statementLineCandidates[0]],
      booksCandidates: [book({ id: 'misdirected', amountCents: -3300, date: '2026-08-19', description: 'Parking bay' })],
      otherAccountCandidates: [line({ id: 'otherAcc', amountCents: -3300, date: '2026-08-19', description: 'Parking bay' })],
    });

    expect(proof.booksToStatement.items.find((i) => i.booksId === 'misdirected')?.reason).toBe('wrong_account');
  });
});
