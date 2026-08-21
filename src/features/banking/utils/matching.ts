import type { BankTransactionWithAllocations } from '../types';
import type { MatchCandidate, ParsedStatementLine } from '../types';

const DEFAULT_DATE_TOLERANCE_DAYS = 5;

function daysBetween(a: string, b: string): number {
  const diffMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diffMs / (1000 * 60 * 60 * 24);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function tokenOverlapRatio(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const t of setA) {
    if (setB.has(t)) overlap += 1;
  }
  return overlap / Math.max(setA.size, setB.size);
}

/**
 * Smart matching: scores every candidate existing BankTransaction against
 * one parsed statement line by date proximity, amount, reference, and
 * description overlap — used by the statement-import UI to suggest "this
 * imported line is probably the same as that already-recorded transaction"
 * rather than creating a duplicate. Amount and direction must match exactly
 * (a hard filter, not scored) since a statement line can only ever
 * correspond to a transaction of the same magnitude and sense; everything
 * else is a fuzzy signal. Returns candidates sorted best-first.
 */
export function findMatchCandidates(
  line: ParsedStatementLine,
  existing: BankTransactionWithAllocations[],
  options: { dateToleranceDays?: number } = {},
): MatchCandidate[] {
  const dateTolerance = options.dateToleranceDays ?? DEFAULT_DATE_TOLERANCE_DAYS;
  const candidates: MatchCandidate[] = [];

  for (const txn of existing) {
    if (Math.abs(txn.amount - line.amount) > 0.01) continue;
    if (txn.direction !== line.direction) continue;

    const daysDiff = daysBetween(txn.date, line.date);
    if (daysDiff > dateTolerance) continue;

    const reasons: string[] = ['Amount matches exactly'];
    let score = 40;

    const dateScore = Math.max(0, 20 - (daysDiff / dateTolerance) * 20);
    score += dateScore;
    reasons.push(daysDiff === 0 ? 'Same date' : `${daysDiff.toFixed(1)} day(s) apart`);

    if (line.reference && txn.reference) {
      const refA = line.reference.trim().toLowerCase();
      const refB = txn.reference.trim().toLowerCase();
      if (refA === refB) {
        score += 25;
        reasons.push('Reference matches exactly');
      } else if (refA.includes(refB) || refB.includes(refA)) {
        score += 12;
        reasons.push('Reference partially matches');
      }
    }

    const descScore = tokenOverlapRatio(line.description, txn.description) * 15;
    if (descScore > 0) {
      score += descScore;
      reasons.push('Description text overlaps');
    }

    candidates.push({ transactionId: txn.id, score: Math.round(score), reasons });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
