import type { BankAccount, BankStatementLine, ID, ReconciliationIssue, ReconciliationIssueType } from '@/types';
import type { BankReconciliation, BankTransactionWithAllocations } from '@/features/banking/types';
import type { ReconciliationSummary } from '@/features/banking/services';
import type { JournalEntryService } from '@/features/accounting/services';
import type { IReconciliationIssueRepository } from '../repositories/IReconciliationIssueRepository';
import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import {
  buildBankSideCandidates,
  buildBankSideCandidatesFromStatementLines,
  buildBooksSideCandidatesFromTransactions,
  buildOrphanedLedgerCandidates,
} from '../utils/candidates';
import { classifyMatches } from '../utils/matching';
import { toCents } from '../utils/money';
import { detectDateOffsetTiming } from '../detectors/dateOffsetTiming';
import { detectAmountMismatch } from '../detectors/amountMismatch';
import { detectDuplicates } from '../detectors/duplicates';
import { detectMissingEntries } from '../detectors/missingEntries';
import { detectGroupMatches } from '../detectors/groupMatching';
import { detectCombinations } from '../detectors/combinationSearch';
import { detectWrongSign } from '../detectors/wrongSign';
import { detectWrongBankAccount, type OtherAccountPool } from '../detectors/wrongBankAccount';
import { detectVatDifferences } from '../detectors/vatDifference';
import { detectRounding } from '../detectors/rounding';
import { detectOpeningBalanceProblem } from '../detectors/openingBalance';
import { buildDifferenceTimeline, type DifferenceTimeline } from '../detectors/timeline';
import { detectEditedAfterReconciliation } from '../detectors/editedAfterReconciliation';
import { computeReconciliationHealth, type ReconciliationHealth } from './reconciliationHealthService';

/** Bounds the candidate pool when no prior reconciliation exists to anchor the window start — keeps the search "relevant period" scoped per the spec's performance guidance, not an unbounded full-history scan. */
const DEFAULT_LOOKBACK_DAYS = 180;

export interface BankAccountLookup {
  getBankAccount(id: ID): Promise<BankAccount | undefined>;
  getBankAccounts(): Promise<BankAccount[]>;
}

export interface BankTransactionLookup {
  /** Matches bankTransactionService.getTransactions()'s real signature — omit bankAccountId for every account, pass it to scope to one. */
  getTransactions(bankAccountId?: ID): Promise<BankTransactionWithAllocations[]>;
}

export interface BankReconciliationLookup {
  /** Matches bankReconciliationService.getHistory()'s real signature. */
  getHistory(bankAccountId: ID): Promise<BankReconciliation[]>;
}

/**
 * The `bank_statement_lines` repo (migration 0020, built by Agent 16) — the
 * real bank side. Optional on the constructor: when supplied AND a statement
 * covers the window, statement lines are the bank side; otherwise the
 * investigator falls back to `bank_transactions` with `source='import'`
 * (documented legacy path, kept so existing behaviour/tests don't break).
 */
export interface BankStatementLineLookup {
  getByAccountInWindow(bankAccountId: ID, from: string, to: string): Promise<BankStatementLine[]>;
}

export interface SummaryComputer {
  computeSummary(bankAccountId: ID, statementDate: string, statementBalance: number, clearedTransactionIds: ID[]): Promise<ReconciliationSummary>;
}

/**
 * PART H — the persisted issues, pre-sorted into the sections the workspace
 * renders. An issue can legitimately appear in more than one section (a
 * sum-exact combination is both an exact cause and a combination
 * explanation); each array is independently a deterministic slice of
 * `issues`.
 */
export interface InvestigationSections {
  /** `effectAmount` exactly equals the (then-)unexplained variance, or the detector marked it `explainsVarianceExactly`. */
  exactCauses: ReconciliationIssue[];
  /** Confidence ≥ 75, evidence-backed, not an exact cause. */
  strongCandidates: ReconciliationIssue[];
  /** Genuine not-yet-cleared timing items (`date_offset_timing`, or an auto-resolution-safe `missing_*`). */
  timingItems: ReconciliationIssue[];
  /** duplicate / wrong-sign / wrong-bank-account / vat / opening-balance / edited-after-reconciliation. */
  structuralIssues: ReconciliationIssue[];
  /** combination / rounding — carry the arithmetic string in `explanation`. */
  combinationExplanations: ReconciliationIssue[];
}

export interface InvestigationResult {
  summary: ReconciliationSummary;
  fullyExplained: boolean;
  issues: ReconciliationIssue[];
  sections: InvestigationSections;
  health: ReconciliationHealth;
  timeline: DifferenceTimeline;
}

const EXACT_CAUSE_TYPES = new Set<ReconciliationIssueType>([
  'amount_mismatch',
  'transposition_error',
  'missing_ledger_side',
  'missing_bank_side',
  'combination_match',
  'rounding_variance',
]);
const STRUCTURAL_TYPES = new Set<ReconciliationIssueType>([
  'duplicate_transaction',
  'wrong_sign',
  'wrong_bank_account',
  'vat_difference',
  'opening_balance_discrepancy',
  'edited_after_reconciliation',
]);
const COMBINATION_TYPES = new Set<ReconciliationIssueType>(['combination_match', 'rounding_variance']);

/** `confidence DESC, |effectAmount| DESC, issueType ASC, dedupeKey ASC` — a total order, identical across runs. */
function rankIssues<T extends Pick<ReconciliationIssue, 'confidence' | 'effectAmount' | 'issueType' | 'dedupeKey'>>(issues: T[]): T[] {
  return [...issues].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      Math.abs(b.effectAmount ?? 0) - Math.abs(a.effectAmount ?? 0) ||
      a.issueType.localeCompare(b.issueType) ||
      (a.dedupeKey ?? '').localeCompare(b.dedupeKey ?? ''),
  );
}

function explainsVarianceExactly(issue: ReconciliationIssue, varianceCents: number): boolean {
  if (issue.evidenceData?.explainsVarianceExactly) return true;
  const effectCents = Math.round((issue.effectAmount ?? 0) * 100);
  return effectCents !== 0 && Math.abs(effectCents) === Math.abs(varianceCents);
}

function classifySections(issues: ReconciliationIssue[], varianceCents: number): InvestigationSections {
  return {
    exactCauses: issues.filter((i) => EXACT_CAUSE_TYPES.has(i.issueType) && explainsVarianceExactly(i, varianceCents)),
    strongCandidates: issues.filter((i) => i.confidence >= 75 && i.evidence.length > 0 && !explainsVarianceExactly(i, varianceCents)),
    timingItems: issues.filter(
      (i) =>
        i.issueType === 'date_offset_timing' ||
        ((i.issueType === 'missing_bank_side' || i.issueType === 'missing_ledger_side') && i.autoResolutionSafe),
    ),
    structuralIssues: issues.filter((i) => STRUCTURAL_TYPES.has(i.issueType)),
    combinationExplanations: issues.filter((i) => COMBINATION_TYPES.has(i.issueType)),
  };
}

const EMPTY_SECTIONS: InvestigationSections = {
  exactCauses: [],
  strongCandidates: [],
  timingItems: [],
  structuralIssues: [],
  combinationExplanations: [],
};

function windowBounds(reconciliationHistory: BankReconciliation[], bankAccount: BankAccount, statementDate: string): { start: string; end: string } {
  const priorFinalized = reconciliationHistory.filter((r) => r.statementDate < statementDate).sort((a, b) => b.statementDate.localeCompare(a.statementDate))[0];
  if (priorFinalized) return { start: priorFinalized.statementDate, end: statementDate };

  const fallback = new Date(statementDate);
  fallback.setDate(fallback.getDate() - DEFAULT_LOOKBACK_DAYS);
  const fallbackStart = fallback.toISOString().slice(0, 10);
  const accountCreated = bankAccount.createdAt.slice(0, 10);
  return { start: accountCreated > fallbackStart ? accountCreated : fallbackStart, end: statementDate };
}

/**
 * Stable idempotency key (docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md §6):
 * `detectorType | statementDate::date | sorted(relatedBankTransactionIds ∪
 * relatedJournalEntryIds ∪ statement-line ids)`. The statement-line id, when
 * the issue came off a statement line, is carried in
 * `evidenceData.candidateSourceId` with `candidateSourceType === 'statement_line'`.
 * Re-runs recompute the same key for the same underlying finding, so the
 * supersede step updates in place instead of piling up duplicates.
 */
function dedupeKeyFor(draft: ReconciliationIssueDraft, statementDate: string): string {
  const ids = new Set<string>([...draft.relatedBankTransactionIds, ...draft.relatedJournalEntryIds]);
  const src = draft.evidenceData;
  if (src?.candidateSourceType === 'statement_line' && src.candidateSourceId) ids.add(src.candidateSourceId);
  return `${draft.issueType}|${statementDate.slice(0, 10)}|${[...ids].sort().join(',')}`;
}

/**
 * The Difference Investigator's orchestrator: runs every detector in
 * priority order (exact/probable match first, cheapest and highest-signal;
 * combination/rounding search last, since they're the most exploratory)
 * against the SAME candidate pools, persists every finding as a
 * ReconciliationIssue, and returns the ranked result plus the
 * Reconciliation Health summary and the Difference Timeline. Deliberately
 * does nothing if the variance is already zero — this only runs when
 * there's something to explain, never manufactures issues from a clean
 * reconciliation. Never posts anything to the GL itself (see
 * reconciliationIssueResolutionService.ts for the resolution actions,
 * which all go through real existing accounting flows).
 */
export class ReconciliationInvestigatorService {
  constructor(
    private readonly issueRepository: IReconciliationIssueRepository,
    private readonly bankAccounts: BankAccountLookup,
    private readonly bankTransactions: BankTransactionLookup,
    private readonly reconciliations: BankReconciliationLookup,
    private readonly journalEntryService: Pick<JournalEntryService, 'getEntries'>,
    private readonly summaryComputer: SummaryComputer,
    private readonly bankStatementLines?: BankStatementLineLookup,
  ) {}

  async investigate(
    bankAccountId: ID,
    statementDate: string,
    statementBalance: number,
    clearedTransactionIds: ID[],
    options: { vatRatesPercent?: number[] } = {},
  ): Promise<InvestigationResult> {
    const bankAccount = await this.bankAccounts.getBankAccount(bankAccountId);
    if (!bankAccount) throw new Error(`Bank account "${bankAccountId}" not found.`);

    const summary = await this.summaryComputer.computeSummary(bankAccountId, statementDate, statementBalance, clearedTransactionIds);
    const varianceCents = toCents(summary.variance);

    // Exactly zero, never "close enough" — toCents() already rounds to the nearest
    // cent, so any sub-cent binary-floating-point noise from computeSummary()'s own
    // Rand-denominated math is already absorbed by that rounding. A real R0.01
    // (or R0.02/R0.05/...) variance must NEVER be waved off as immaterial here — it
    // stays open until a detector explains it, a human explicitly accepts it under a
    // defined rounding policy, or it's genuinely corrected. An earlier version used a
    // 1-CENT tolerance (mirroring this codebase's existing float-Rand epsilons like
    // BALANCE_EPSILON = 0.005), which was wrong at this boundary: it silently treated
    // a full 1-cent difference as "already balanced" and skipped investigating it
    // entirely — caught by a regression test proving R0.01 must stay open.
    if (varianceCents === 0) {
      return {
        summary,
        fullyExplained: true,
        issues: [],
        sections: EMPTY_SECTIONS,
        health: computeReconciliationHealth(0, 0, 0, 0, 0, 0, {
          statementClosingBalance: summary.statementBalance,
          booksBankBalance: summary.glCashbookBalance,
          statementLineCount: 0,
        }),
        timeline: { points: [], firstAppearanceDate: undefined },
      };
    }

    const [allAccounts, allTransactions, history, allEntries] = await Promise.all([
      this.bankAccounts.getBankAccounts(),
      // Fetched once, unfiltered — thisAccountTransactions/otherAccountPools below both
      // derive from this in memory rather than each issuing their own filtered query.
      this.bankTransactions.getTransactions(),
      this.reconciliations.getHistory(bankAccountId),
      this.journalEntryService.getEntries(),
    ]);
    const thisAccountTransactions = allTransactions.filter((t) => t.bankAccountId === bankAccountId);

    const { start: windowStart, end: windowEnd } = windowBounds(history, bankAccount, statementDate);

    // The bank side: real statement lines when a statement covers the window,
    // else the documented `source='import'` fallback.
    const statementLines = this.bankStatementLines
      ? await this.bankStatementLines.getByAccountInWindow(bankAccountId, windowStart, windowEnd)
      : [];
    const usingStatementLines = statementLines.length > 0;
    const bankSide = usingStatementLines
      ? buildBankSideCandidatesFromStatementLines(statementLines, windowStart, windowEnd)
      : buildBankSideCandidates(thisAccountTransactions, windowStart, windowEnd);

    const postedJournalEntryIds = new Set(allTransactions.map((t) => t.journalEntryId).filter((x): x is string => Boolean(x)));
    const orphaned = buildOrphanedLedgerCandidates(allEntries, postedJournalEntryIds, bankAccount.glAccountId, windowStart, windowEnd);
    const booksSide = [...buildBooksSideCandidatesFromTransactions(thisAccountTransactions, windowStart, windowEnd), ...orphaned];

    const classification = classifyMatches(bankSide, booksSide);
    const { unmatchedBank, unmatchedBooks } = classification;

    const otherAccountPools: OtherAccountPool[] = allAccounts
      .filter((a) => a.id !== bankAccountId)
      .map((a) => ({
        bankAccountId: a.id,
        bankAccountName: a.name,
        candidates: buildBankSideCandidates(
          allTransactions.filter((t) => t.bankAccountId === a.id),
          windowStart,
          windowEnd,
        ),
      }));

    const drafts: ReconciliationIssueDraft[] = [
      ...detectDateOffsetTiming(classification.probable),
      ...detectAmountMismatch(unmatchedBank, unmatchedBooks, { targetUnexplainedCents: varianceCents }),
      ...detectWrongSign(unmatchedBank, unmatchedBooks),
      ...detectGroupMatches(unmatchedBank, unmatchedBooks),
      ...detectVatDifferences(unmatchedBank, unmatchedBooks, options.vatRatesPercent),
      ...detectWrongBankAccount(unmatchedBooks, otherAccountPools),
      ...detectDuplicates(bankSide),
      ...detectDuplicates(booksSide),
      ...detectMissingEntries(unmatchedBank, unmatchedBooks, statementDate),
    ];

    const leftoverPool: InvestigationCandidate[] = [...unmatchedBank, ...unmatchedBooks];
    const combinationIssues = detectCombinations(leftoverPool, varianceCents);
    const roundingIssues = combinationIssues.length === 0 ? detectRounding(leftoverPool, varianceCents) : [];
    drafts.push(...combinationIssues, ...roundingIssues);

    drafts.push(...detectOpeningBalanceProblem(windowStart, varianceCents, leftoverPool));

    const reversalIssues = detectEditedAfterReconciliation(history, thisAccountTransactions, allEntries);
    drafts.push(...reversalIssues);

    const timeline = buildDifferenceTimeline(
      [...bankSide, ...booksSide].map((c) => c.date),
      leftoverPool,
    );

    const draftsWithKeys = drafts.map((draft) => ({ ...draft, dedupeKey: dedupeKeyFor(draft, statementDate) }));
    const newKeys = new Set(draftsWithKeys.map((d) => d.dedupeKey));

    // Re-running the investigation for the same account/statement date must not pile
    // up duplicate rows — but a human's own decision (reviewed/dismissed/resolved) is
    // a real, audited action and must never be silently discarded. Supersede ONLY
    // 'open' issues that either (a) recompute to one of this run's dedupe keys, or
    // (b) belong to this same statement date (date-normalised — the previous code
    // string-compared a timestamptz, so it never actually matched in production).
    const runDate = statementDate.slice(0, 10);
    const existingForAccount = await this.issueRepository.getByAccount(bankAccountId);
    const staleOpenIssues = existingForAccount.filter(
      (i) =>
        i.status === 'open' &&
        ((i.dedupeKey ? newKeys.has(i.dedupeKey) : false) || i.statementDate.slice(0, 10) === runDate),
    );
    await Promise.all(staleOpenIssues.map((i) => this.issueRepository.delete(i.id)));

    const persistedUnsorted = await Promise.all(
      draftsWithKeys.map((draft) =>
        this.issueRepository.create({
          ...draft,
          id: '',
          bankAccountId,
          statementDate,
          status: 'open',
          createdAt: '',
          updatedAt: '',
        }),
      ),
    );
    const persisted = rankIssues(persistedUnsorted);

    const needsReviewCount = persisted.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
    // How much of the money gap now has a candidate cause. Summed over still-open
    // issues only, then capped at |variance| inside computeReconciliationHealth so
    // overlapping candidates can't push it >100%.
    const varianceExplainedRaw = persisted
      .filter((i) => i.status === 'open')
      .reduce((sum, i) => sum + Math.abs(i.effectAmount ?? 0), 0);
    const health = computeReconciliationHealth(
      bankSide.length,
      classification.confirmed.length,
      classification.probable.length,
      needsReviewCount,
      summary.variance,
      varianceExplainedRaw,
      {
        statementClosingBalance: summary.statementBalance,
        booksBankBalance: summary.glCashbookBalance,
        statementLineCount: usingStatementLines ? statementLines.length : bankSide.length,
      },
    );

    return {
      summary,
      fullyExplained: false,
      issues: persisted,
      sections: classifySections(persisted, varianceCents),
      health,
      timeline,
    };
  }

  async getIssuesForAccount(bankAccountId: ID): Promise<ReconciliationIssue[]> {
    const issues = await this.issueRepository.getByAccount(bankAccountId);
    return rankIssues(issues);
  }
}
