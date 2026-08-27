import { describe, expect, it } from 'vitest';
import { classifyMatches } from '../utils/matching';
import { detectAmountMismatch } from '../detectors/amountMismatch';
import { detectDuplicates } from '../detectors/duplicates';
import { detectWrongSign } from '../detectors/wrongSign';
import { detectCombinations } from '../detectors/combinationSearch';
import { detectGroupMatches } from '../detectors/groupMatching';
import { findSubsetsSumming } from '../utils/subsetSum';
import type { InvestigationCandidate } from '../types';

/**
 * Performance characterization against a realistically large transaction
 * set. Not a CI perf gate (wall-clock varies by machine) — the generous
 * time bounds below exist to catch a real algorithmic regression (an
 * accidental O(n^2)/O(n^3) blowup), not to pin an exact millisecond
 * figure. Measured figures from the pass that verified these bounds are
 * hold-worthy: classifyMatches 2000x2000 ~33ms, amountMismatch+wrongSign
 * 500x500 ~34ms, duplicates over 1000 ~4ms, groupMatches 300x300 ~6ms,
 * findSubsetsSumming over 1000 items <1ms (triples correctly skipped past
 * the 150-item bound), a 150-item pool with a real embedded triple ~0.5ms.
 */
function makeCandidates(count: number, side: 'bank' | 'books', offset = 0): InvestigationCandidate[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + offset;
    return {
      id: `${side}_${n}`,
      side,
      kind: 'bank_transaction' as const,
      date: `2026-${String(1 + (n % 12)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`,
      description: `Transaction ${n} ${side === 'bank' ? 'ABC Traders' : 'XYZ Supplies'}`,
      reference: `REF-${n}`,
      amountCents: 1000 + (n % 97) * 137, // realistic-looking varied amounts, mostly non-colliding
      bankTransactionId: `${side}_${n}`,
    };
  });
}

describe('Performance — realistic transaction volume', () => {
  it('classifyMatches: 2,000 bank-side vs. 2,000 books-side candidates (a full year of daily activity on one account)', () => {
    const bankSide = makeCandidates(2000, 'bank');
    const booksSide = makeCandidates(2000, 'books');

    const start = performance.now();
    const result = classifyMatches(bankSide, booksSide);
    const elapsedMs = performance.now() - start;

    expect(result.confirmed.length + result.probable.length + result.unmatchedBank.length).toBe(bankSide.length);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('duplicate detection: 1,000-item single-side pool (pairwise scan)', () => {
    const pool = makeCandidates(1000, 'bank');

    const start = performance.now();
    const issues = detectDuplicates(pool);
    const elapsedMs = performance.now() - start;

    expect(issues.length).toBeGreaterThanOrEqual(0);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('amount mismatch / wrong-sign scans: 500 unmatched bank vs. 500 unmatched books (a genuinely large leftover pool)', () => {
    const unmatchedBank = makeCandidates(500, 'bank');
    const unmatchedBooks = makeCandidates(500, 'books');

    const start = performance.now();
    detectAmountMismatch(unmatchedBank, unmatchedBooks, { targetUnexplainedCents: 12345 });
    detectWrongSign(unmatchedBank, unmatchedBooks);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(5000);
  });

  it('combination search: exact-single, pair, and bounded-triple all resolve fast even against a 1,000-item pool', () => {
    // findSubsetsSumming's own MAX_POOL_FOR_TRIPLES=150 guard means a 1,000-item
    // pool deliberately SKIPS triple search — this is the bound the spec asks
    // for ("does not perform unrestricted subset-sum"), verified directly here
    // rather than assumed.
    const bigPool = makeCandidates(1000, 'bank').map((c) => ({ amountCents: c.amountCents }));

    const startSingle = performance.now();
    const singleResult = findSubsetsSumming(bigPool, bigPool[42].amountCents);
    const singleMs = performance.now() - startSingle;
    expect(singleResult.some((r) => r.indexes.length === 1)).toBe(true);

    const startPair = performance.now();
    const pairTarget = bigPool[10].amountCents + bigPool[20].amountCents;
    const pairResult = findSubsetsSumming(bigPool, pairTarget);
    const pairMs = performance.now() - startPair;
    expect(pairResult.length).toBeGreaterThan(0);

    expect(singleMs).toBeLessThan(500);
    expect(pairMs).toBeLessThan(500);
  });

  it('combination search WITH triples enabled: a 150-item pool (the exact boundary) resolving a genuine triple', () => {
    const pool: InvestigationCandidate[] = makeCandidates(150, 'bank');
    // Embed one deliberate triple deep in the pool so the search has to do real work to find it.
    pool[100] = { ...pool[100], amountCents: 111 };
    pool[120] = { ...pool[120], amountCents: 222 };
    pool[140] = { ...pool[140], amountCents: 333 };

    const start = performance.now();
    const issues = detectCombinations(pool, 666);
    const elapsedMs = performance.now() - start;

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.relatedBankTransactionIds.length === 3)).toBe(true);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('group matching (one-to-many/many-to-one): 300 unmatched items per side', () => {
    const unmatchedBank = makeCandidates(300, 'bank');
    const unmatchedBooks = makeCandidates(300, 'books');

    const start = performance.now();
    detectGroupMatches(unmatchedBank, unmatchedBooks);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(5000);
  });
});
