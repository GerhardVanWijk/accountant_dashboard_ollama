import type { BankAccount, ID, ReconciliationIssue } from '@/types';
import type { BankReconciliation, BankTransactionWithAllocations } from '@/features/banking/types';
import type { ReconciliationSummary } from '@/features/banking/services';
import type { JournalEntryService } from '@/features/accounting/services';
import type { IReconciliationIssueRepository } from '../repositories/IReconciliationIssueRepository';
import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildBankSideCandidates, buildBooksSideCandidatesFromTransactions, buildOrphanedLedgerCandidates } from '../utils/candidates';
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

export interface SummaryComputer {
  computeSummary(bankAccountId: ID, statementDate: string, statementBalance: number, clearedTransactionIds: ID[]): Promise<ReconciliationSummary>;
}

export interface InvestigationResult {
  summary: ReconciliationSummary;
  fullyExplained: boolean;
  issues: ReconciliationIssue[];
  health: ReconciliationHealth;
  timeline: DifferenceTimeline;
}

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
        health: computeReconciliationHealth(0, 0, 0, 0, 0, 0),
        timeline: { points: [], firstAppearanceDate: undefined },
      };
    }

    const [allAccounts, allTransactions, history, allEntries] = await Promise.all([
      this.bankAccounts.getBankAccounts(),
      // Fetched once, unfiltered — thisAccountTransactions/otherAccountPools below both
      // derive from this in memory rather than each issuing their own filtered query
      // (a prior version fetched this account's transactions a second time via its own
      // getTransactions(bankAccountId) call; that round trip is redundant since this
      // unfiltered fetch is already a strict superset of it).
      this.bankTransactions.getTransactions(),
      this.reconciliations.getHistory(bankAccountId),
      this.journalEntryService.getEntries(),
    ]);
    const thisAccountTransactions = allTransactions.filter((t) => t.bankAccountId === bankAccountId);

    const { start: windowStart, end: windowEnd } = windowBounds(history, bankAccount, statementDate);

    const bankSide = buildBankSideCandidates(thisAccountTransactions, windowStart, windowEnd);
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

    // Re-running the investigation for the same account/statement date (e.g. after
    // ticking a different set of cleared items) must not pile up duplicate issue rows
    // forever — but a human's own decision (reviewed/dismissed/resolved) is a real,
    // audited action and must never be silently discarded just because a fresh run
    // happened. Only 'open' issues from a PRIOR run at this exact statement date are
    // superseded; anything a human has already touched is left completely alone.
    const existingForAccount = await this.issueRepository.getByAccount(bankAccountId);
    const staleOpenIssues = existingForAccount.filter((i) => i.statementDate === statementDate && i.status === 'open');
    await Promise.all(staleOpenIssues.map((i) => this.issueRepository.delete(i.id)));

    const persisted = await Promise.all(
      drafts.map((draft) =>
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

    const needsReviewCount = persisted.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
    // How much of the money gap now has a candidate cause. Summed over
    // still-open issues only (a human-dismissed issue is no longer a
    // candidate explanation), then capped at |variance| inside
    // computeReconciliationHealth so overlapping candidates can't push it >100%.
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
    );

    return { summary, fullyExplained: false, issues: persisted, health, timeline };
  }

  async getIssuesForAccount(bankAccountId: ID): Promise<ReconciliationIssue[]> {
    const issues = await this.issueRepository.getByAccount(bankAccountId);
    return [...issues].sort((a, b) => b.confidence - a.confidence);
  }
}
