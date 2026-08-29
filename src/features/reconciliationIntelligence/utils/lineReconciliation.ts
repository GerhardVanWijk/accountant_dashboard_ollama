import type { BankStatementLine, DebitCredit, ID, ReconciliationIssue } from '@/types';

/**
 * Pure helpers behind the side-by-side reconciliation workspace (P2.2). The
 * workspace resolves the *records* (statement line ↔ bank transaction ↔
 * journal) from live data; these functions turn a resolved pair into the
 * COMPARISON rows, the document-PROOFING answers, and the per-line candidate
 * list — all deterministic, all unit-testable without React.
 */

export type Verdict = 'ok' | 'warn' | 'bad' | 'na';

export interface ComparisonRow {
  key: string;
  label: string;
  verdict: Verdict;
  /** Bank-statement-side value. */
  statementValue: string;
  /** Accounting-counterpart-side value. */
  booksValue: string;
  /** The delta / note, e.g. "R0.16" or "1 day later". */
  delta?: string;
}

export interface ProofItem {
  key: string;
  question: string;
  answer: 'yes' | 'no' | 'na';
  detail?: string;
}

/** The accounting counterpart the workspace believes matches a statement line. */
export interface LineCounterpart {
  sourceLabel: string;
  sourceNumber?: string;
  contact?: string;
  accountingDate?: string;
  reference?: string;
  /** Signed rand — positive = money into the bank account. */
  amountSigned: number;
  direction?: DebitCredit;
  glAccountLabels: string[];
  journalNumber?: string;
  journalEntryId?: ID;
  bankTransactionId?: ID;
  vatAmount: number;
  status?: string;
  reconciliationState: string;
  /** True when the linked journal entry's debits equal its credits. */
  journalBalanced?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Signed rand for a statement line — positive = money in (inflow). */
export function signedLineAmount(line: Pick<BankStatementLine, 'amount' | 'direction'>): number {
  return line.direction === 'debit' ? line.amount : -line.amount;
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10)).getTime();
  const db = new Date(b.slice(0, 10)).getTime();
  return Math.round(Math.abs(da - db) / 86_400_000);
}

function normalizeRef(ref?: string): string {
  return (ref ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Exact / Similar / Different verdict for two reference strings. Prefers the
 * engine's own `referenceSimilarity` (0–1) when the caller has an issue for
 * this line; falls back to a token/substring comparison.
 */
export function referenceVerdict(a?: string, b?: string, similarity?: number): Extract<Verdict, 'ok' | 'warn' | 'bad' | 'na'> {
  const na = a == null || a === '' || b == null || b === '';
  if (typeof similarity === 'number') {
    if (similarity >= 0.999) return 'ok';
    if (similarity >= 0.5) return 'warn';
    return na ? 'na' : 'bad';
  }
  if (na) return 'na';
  const na2 = normalizeRef(a);
  const nb2 = normalizeRef(b);
  if (!na2 || !nb2) return 'na';
  if (na2 === nb2) return 'ok';
  if (na2.includes(nb2) || nb2.includes(na2)) return 'warn';
  return 'bad';
}

const verdictWord: Record<Exclude<Verdict, 'na'>, string> = {
  ok: 'Exact',
  warn: 'Similar',
  bad: 'Different',
};

export function referenceVerdictLabel(v: Verdict): string {
  return v === 'na' ? 'Not comparable' : verdictWord[v];
}

export interface BuildComparisonInput {
  line: Pick<BankStatementLine, 'amount' | 'direction' | 'txnDate' | 'reference'>;
  counterpart: LineCounterpart | null;
  /** When the workspace has an investigation issue for this line, its structured evidence. */
  referenceSimilarity?: number;
  amountDifferenceCents?: number;
  dateDifferenceDays?: number;
}

/**
 * COMPARISON block (PART B) — amount / date / reference / direction / account
 * / VAT, each with a ✓ / ⚠ / ✗ verdict and the delta.
 */
export function buildComparison({ line, counterpart, referenceSimilarity, amountDifferenceCents, dateDifferenceDays }: BuildComparisonInput): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const bankSigned = signedLineAmount(line);

  if (!counterpart) {
    return [
      {
        key: 'counterpart',
        label: 'Accounting counterpart',
        verdict: 'bad',
        statementValue: 'On the bank statement',
        booksValue: 'Not found in Vertex',
      },
    ];
  }

  const amountDelta =
    typeof amountDifferenceCents === 'number'
      ? round2(amountDifferenceCents / 100)
      : round2(bankSigned - counterpart.amountSigned);
  rows.push({
    key: 'amount',
    label: 'Amount',
    verdict: Math.abs(amountDelta) < 0.005 ? 'ok' : 'bad',
    statementValue: bankSigned.toFixed(2),
    booksValue: counterpart.amountSigned.toFixed(2),
    delta: Math.abs(amountDelta) < 0.005 ? 'Match' : `R${Math.abs(amountDelta).toFixed(2)} difference`,
  });

  const dateDelta = typeof dateDifferenceDays === 'number' ? Math.abs(dateDifferenceDays) : counterpart.accountingDate ? daysBetween(line.txnDate, counterpart.accountingDate) : undefined;
  rows.push({
    key: 'date',
    label: 'Date',
    verdict: dateDelta === undefined ? 'na' : dateDelta === 0 ? 'ok' : dateDelta <= 2 ? 'warn' : 'bad',
    statementValue: line.txnDate.slice(0, 10),
    booksValue: counterpart.accountingDate?.slice(0, 10) ?? '—',
    delta: dateDelta === undefined ? undefined : dateDelta === 0 ? 'Same day' : `${dateDelta} day${dateDelta === 1 ? '' : 's'} apart`,
  });

  const refV = referenceVerdict(line.reference, counterpart.reference, referenceSimilarity);
  rows.push({
    key: 'reference',
    label: 'Reference',
    verdict: refV,
    statementValue: line.reference || '—',
    booksValue: counterpart.reference || '—',
    delta: referenceVerdictLabel(refV),
  });

  const sameDirection = counterpart.direction ? counterpart.direction === line.direction : Math.sign(bankSigned) === Math.sign(counterpart.amountSigned);
  rows.push({
    key: 'direction',
    label: 'Direction',
    verdict: sameDirection ? 'ok' : 'bad',
    statementValue: line.direction === 'debit' ? 'Money in' : 'Money out',
    booksValue: counterpart.amountSigned >= 0 ? 'Money in' : 'Money out',
    delta: sameDirection ? 'Agree' : 'Opposite signs',
  });

  rows.push({
    key: 'account',
    label: 'Account',
    verdict: counterpart.glAccountLabels.length > 0 ? 'ok' : 'warn',
    statementValue: 'Bank account',
    booksValue: counterpart.glAccountLabels.length > 0 ? counterpart.glAccountLabels.join(', ') : 'Not yet coded',
    delta: counterpart.glAccountLabels.length > 0 ? 'Posted' : 'Needs a GL account',
  });

  if (counterpart.vatAmount !== 0) {
    rows.push({
      key: 'vat',
      label: 'VAT',
      verdict: 'na',
      statementValue: 'Not shown on statement',
      booksValue: `R${Math.abs(counterpart.vatAmount).toFixed(2)}`,
      delta: 'VAT recorded on the accounting entry only',
    });
  }

  return rows;
}

export interface BuildProofInput {
  line: Pick<BankStatementLine, 'amount' | 'direction' | 'txnDate' | 'reference' | 'lineState'>;
  counterpart: LineCounterpart | null;
  /** From the whole-period proof: does Vertex hold an entry with no matching statement line for this window. */
  hasBooksOnlyEntries?: boolean;
  referenceSimilarity?: number;
  amountDifferenceCents?: number;
  dateDifferenceDays?: number;
}

/**
 * PART F — the compact "Proof" checklist. Plain-language yes/no/N-A answers a
 * non-accountant can read, each derived from the resolved pair.
 */
export function buildProof({ line, counterpart, hasBooksOnlyEntries, referenceSimilarity, amountDifferenceCents, dateDifferenceDays }: BuildProofInput): ProofItem[] {
  const items: ProofItem[] = [];
  const bankSigned = signedLineAmount(line);

  items.push({
    key: 'exists-in-vertex',
    question: 'Does this bank line exist in Vertex?',
    answer: counterpart ? 'yes' : 'no',
    detail: counterpart ? `Matched to ${counterpart.sourceLabel}${counterpart.sourceNumber ? ` ${counterpart.sourceNumber}` : ''}` : 'No corresponding accounting entry found',
  });

  items.push({
    key: 'books-only',
    question: 'Does Vertex have something not on this statement?',
    answer: hasBooksOnlyEntries === undefined ? 'na' : hasBooksOnlyEntries ? 'yes' : 'no',
    detail: hasBooksOnlyEntries ? 'See the whole-period proof for outstanding items' : undefined,
  });

  if (counterpart) {
    const amountDelta = typeof amountDifferenceCents === 'number' ? Math.abs(amountDifferenceCents / 100) : Math.abs(bankSigned - counterpart.amountSigned);
    items.push({
      key: 'amounts-agree',
      question: 'Do the amounts agree?',
      answer: amountDelta < 0.005 ? 'yes' : 'no',
      detail: amountDelta < 0.005 ? undefined : `Out by R${amountDelta.toFixed(2)}`,
    });

    const sameDirection = counterpart.direction ? counterpart.direction === line.direction : Math.sign(bankSigned) === Math.sign(counterpart.amountSigned);
    items.push({
      key: 'directions-agree',
      question: 'Do the directions agree?',
      answer: sameDirection ? 'yes' : 'no',
      detail: sameDirection ? undefined : 'One side is a receipt, the other a payment',
    });

    const refV = referenceVerdict(line.reference, counterpart.reference, referenceSimilarity);
    items.push({
      key: 'reference-agrees',
      question: 'Does the reference agree?',
      answer: refV === 'ok' ? 'yes' : refV === 'na' ? 'na' : 'no',
      detail: referenceVerdictLabel(refV),
    });

    const dateDelta = typeof dateDifferenceDays === 'number' ? Math.abs(dateDifferenceDays) : counterpart.accountingDate ? daysBetween(line.txnDate, counterpart.accountingDate) : undefined;
    items.push({
      key: 'date-agrees',
      question: 'Does the date agree?',
      answer: dateDelta === undefined ? 'na' : dateDelta === 0 ? 'yes' : 'no',
      detail: dateDelta === undefined ? undefined : dateDelta === 0 ? 'Same day' : `${dateDelta} day${dateDelta === 1 ? '' : 's'} apart`,
    });

    items.push({
      key: 'posting-balances',
      question: 'Does the linked posting balance?',
      answer: counterpart.glAccountLabels.length === 0 ? 'na' : 'yes',
      detail: counterpart.glAccountLabels.length === 0 ? 'Not yet coded to a GL account' : counterpart.glAccountLabels.join(', '),
    });

    items.push({
      key: 'journal-balanced',
      question: 'Is the underlying journal balanced?',
      answer: counterpart.journalBalanced === undefined ? 'na' : counterpart.journalBalanced ? 'yes' : 'no',
      detail: counterpart.journalNumber ? `Journal ${counterpart.journalNumber}` : counterpart.journalEntryId ? 'Linked journal entry' : 'No journal posted yet',
    });

    items.push({
      key: 'vat-consistent',
      question: 'Is VAT relevant and consistent?',
      answer: counterpart.vatAmount === 0 ? 'na' : 'yes',
      detail: counterpart.vatAmount === 0 ? 'No VAT on this transaction' : `R${Math.abs(counterpart.vatAmount).toFixed(2)} VAT recorded`,
    });
  }

  return items;
}

/**
 * The investigation issues that concern one statement line — matched by the
 * line id carried in `evidenceData.candidateSourceId`, or by the line's
 * matched bank transaction appearing in the issue's related ids. The engine
 * already returns `issues` in deterministic rank order, so this only filters.
 */
export function selectLineCandidates(issues: ReconciliationIssue[], line: Pick<BankStatementLine, 'id' | 'matchedBankTransactionId'>): ReconciliationIssue[] {
  const lineId = line.id;
  const matchedTxn = line.matchedBankTransactionId;
  return issues.filter((issue) => {
    if (issue.evidenceData?.candidateSourceType === 'statement_line' && issue.evidenceData.candidateSourceId === lineId) return true;
    if (issue.relatedBankTransactionIds.includes(lineId)) return true;
    if (issue.relatedSourceDocumentIds.includes(lineId)) return true;
    if (matchedTxn && issue.relatedBankTransactionIds.includes(matchedTxn)) return true;
    return false;
  });
}
