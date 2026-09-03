import type { Account, Bill, CreditNote, CustomerReceipt, ID, Invoice, JournalEntry, Payment, Product, StockMovement, TaxRate } from '@/types';
import type { BankAccount } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import type { JournalEntryService } from './journalEntryService';
import type { AccountMapper } from './accountMappingService';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPeriodRepository } from '../repositories/IAccountingPeriodRepository';
import { reconcileAccountsPayable, reconcileAccountsReceivable, reconcileCustomerDeposits } from './subledgerReconciliation';
import { findPeriodForDate } from '../utils/periodLookup';
import { computeVatReport, reconcileVatControlAccounts } from '@/features/tax/services/vatReportService';
import {
  checkBankSubledgerIntegrity,
  checkDuplicateGlPosting,
  checkJournalEntriesBalance,
  checkOrphanedPostedDocuments,
  checkSubledgerReconciliation,
  checkTrialBalance,
  type BooksIntegrityStatus,
  type PostableDocumentLike,
} from '@/features/reconciliationIntelligence/booksIntegrity/checks';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. */
const MONEY_EPSILON = 0.005;

export type AuditStatus = 'PASS' | 'WARNING' | 'FAIL';

/** One check's outcome — the shape the Queen Bee brief asked this service to return. */
export interface AuditCheckResult {
  check: string;
  status: AuditStatus;
  detail: string;
}

function fromBooksIntegrityStatus(status: BooksIntegrityStatus, escalateWarningToFail = false): AuditStatus {
  if (status === 'pass') return 'PASS';
  if (status === 'warning') return escalateWarningToFail ? 'FAIL' : 'WARNING';
  return 'WARNING';
}

/**
 * Everything this service needs to run a full audit, gathered by the
 * caller from its own per-feature repositories/services. Deliberately
 * plain arrays (not repository interfaces) for the document collections —
 * this service composes read-only checks over data the caller already
 * fetched for its own purpose (a dashboard load, a scheduled audit job),
 * matching runBooksIntegrityCheck()'s existing `input` shape rather than
 * inventing a second way to fetch the same data.
 */
export interface AccountingIntegrityAuditInput {
  invoices: Invoice[];
  bills: Bill[];
  creditNotes: CreditNote[];
  customerReceipts: CustomerReceipt[];
  payments: Payment[];
  /**
   * Optional net figure for AP movements that legitimately don't originate
   * from a `bill` row (e.g. an asset bought on supplier credit, less any
   * known duplicate AP debit). Passed straight to reconcileAccountsPayable().
   */
  nonBillApAdjustments?: number;
  products: Product[];
  stockMovements: StockMovement[];
  taxRates: TaxRate[];
  /** Omit to skip the two bank-GL checks (e.g. company has no bank account configured yet). */
  bankAccount?: BankAccount;
  bankTransactions?: BankTransactionWithAllocations[];
  /**
   * Window used only to compute the VAT report figure this audit compares
   * against the VAT Output/Input control accounts' movement. Defaults to
   * a wide all-time range (this company's entire posting history) so the
   * audit doesn't silently miss VAT posted outside a caller-chosen period —
   * pass a narrower window (e.g. the current VAT period) to match a
   * specific VAT201 filing instead.
   */
  vatPeriodStart?: Date;
  vatPeriodEnd?: Date;
}

const DEFAULT_VAT_PERIOD_START = new Date('2000-01-01T00:00:00.000Z');
const DEFAULT_VAT_PERIOD_END = new Date('2100-01-01T00:00:00.000Z');

/**
 * Statuses that represent "this document is meant to have posted to the
 * GL". Draft and void documents never post, so they are excluded — an
 * orphan check that flagged drafts would just be noise.
 */
const POSTED_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid', 'overdue'];
const POSTED_BILL_STATUSES = ['awaiting_payment', 'partially_paid', 'paid', 'overdue'];
const POSTED_CREDIT_NOTE_STATUSES = ['issued', 'allocated'];

function toPostable(id: ID, documentNumber: string, status: string, journalEntryId: ID | undefined): PostableDocumentLike {
  return { id, documentNumber, status, journalEntryId };
}

/**
 * Composes this codebase's existing reconciliation/audit logic
 * (subledgerReconciliation.ts, vatReportService.ts, booksIntegrity/checks.ts)
 * into ONE entry point that returns a flat, structured PASS/WARNING/FAIL
 * report — the "books health audit" the Office National build's Phase 17
 * asked for. This is a read-only composition layer: it never posts,
 * reverses, or otherwise mutates anything, and it does not talk to
 * Supabase directly (constructor takes repos/services, same
 * dependency-injection pattern as JournalEntryService/vatReportService),
 * so it is unit-testable with the project's existing Mock repositories.
 *
 * Deliberately NOT wired into any page/route — this is a service-layer
 * building block a future "Books Health" screen or a CI/ops job can call,
 * not a UI feature in itself.
 */
export class AccountingIntegrityAuditService {
  constructor(
    private readonly journalEntryService: Pick<JournalEntryService, 'getEntries' | 'computeTrialBalance' | 'getAccountLedger'>,
    private readonly accountRepository: Pick<IAccountRepository, 'getAll'>,
    private readonly accounts: AccountMapper,
    private readonly periodRepository: Pick<IAccountingPeriodRepository, 'getAll'>,
  ) {}

  async run(input: AccountingIntegrityAuditInput): Promise<AuditCheckResult[]> {
    const [entries, trialBalance, glAccounts, periods] = await Promise.all([
      this.journalEntryService.getEntries(),
      this.journalEntryService.computeTrialBalance(),
      this.accountRepository.getAll(),
      this.periodRepository.getAll(),
    ]);
    const postedEntries = entries.filter((e) => e.status === 'posted');

    const results: AuditCheckResult[] = [];

    results.push(this.doubleEntryBalanceCheck(postedEntries));
    results.push(this.trialBalanceCheck(trialBalance));
    results.push(...(await this.subledgerChecks(input)));
    results.push(...(await this.vatChecks(input)));
    if (input.bankAccount && input.bankTransactions) {
      results.push(await this.bankGlCheck(input.bankAccount, input.bankTransactions));
    }
    results.push(...(await this.inventoryChecks(input.products, input.stockMovements)));
    results.push(...this.traceabilityChecks(input));
    results.push(this.orphanJournalLinesCheck(postedEntries, glAccounts));
    results.push(this.companyIsolationCheck(postedEntries, glAccounts));
    results.push(...this.financialPeriodChecks(postedEntries, periods));

    return results;
  }

  /** Every posted journal entry's own debits must equal its own credits — the single most fundamental invariant, so an imbalance here is a FAIL, not a warning. */
  private doubleEntryBalanceCheck(postedEntries: JournalEntry[]): AuditCheckResult {
    const inner = checkJournalEntriesBalance(postedEntries);
    return { check: 'Double-entry balance (per journal entry)', status: fromBooksIntegrityStatus(inner.status, true), detail: inner.detail };
  }

  /** Company-wide Σdebit === Σcredit, i.e. the trial balance nets to zero. Escalated to FAIL for the same reason as the per-entry check. */
  private trialBalanceCheck(trialBalance: Awaited<ReturnType<JournalEntryService['computeTrialBalance']>>): AuditCheckResult {
    const inner = checkTrialBalance(trialBalance);
    const rowsWithActivity = trialBalance.rows.length;
    return {
      check: 'Trial balance (Σdebits == Σcredits)',
      status: fromBooksIntegrityStatus(inner.status, true),
      detail: `${inner.detail} ${rowsWithActivity} account(s) carry nonzero activity.`,
    };
  }

  private async subledgerChecks(input: AccountingIntegrityAuditInput): Promise<AuditCheckResult[]> {
    const results: AuditCheckResult[] = [];

    const ar = await reconcileAccountsReceivable(this.journalEntryService, this.accounts, input.invoices, input.creditNotes, input.customerReceipts);
    const arInner = checkSubledgerReconciliation('Accounts Receivable', 'ar_subledger', ar);
    results.push({
      check: 'AR control (1100) vs GL-consistent customer subledger',
      status: fromBooksIntegrityStatus(arInner.status),
      detail:
        `Control R${ar.controlAccountBalance.toFixed(2)} vs GL-consistent subledger R${ar.subledgerTotal.toFixed(2)} — variance R${ar.variance.toFixed(2)}. ` +
        `Aging subledger R${ar.agingSubledgerTotal.toFixed(2)}; bridge: unallocated receipts R${ar.bridge.unallocatedReceipts.toFixed(2)}, credit-note impact R${ar.bridge.creditNoteImpact.toFixed(2)}, other R${ar.bridge.other.toFixed(2)}. ${arInner.detail}`,
    });

    const ap = await reconcileAccountsPayable(this.journalEntryService, this.accounts, input.bills, input.payments, input.nonBillApAdjustments);
    const apInner = checkSubledgerReconciliation('Accounts Payable', 'ap_subledger', ap);
    results.push({
      check: 'AP control (2000) vs GL-consistent supplier subledger',
      status: fromBooksIntegrityStatus(apInner.status),
      detail:
        `Control R${ap.controlAccountBalance.toFixed(2)} vs GL-consistent subledger R${ap.subledgerTotal.toFixed(2)} — variance R${ap.variance.toFixed(2)}. ` +
        `Aging subledger R${ap.agingSubledgerTotal.toFixed(2)}; bridge: unallocated payments R${ap.bridge.unallocatedReceipts.toFixed(2)}, other R${ap.bridge.other.toFixed(2)}. ${apInner.detail}`,
    });

    // Customer Deposits (2600) vs Σ receipt.unallocatedAmount — Increment 4A.
    // Only run when there is unapplied customer money to reconcile.
    if (input.customerReceipts.some((r) => r.unallocatedAmount > 0)) {
      try {
        const deposits = await reconcileCustomerDeposits(this.journalEntryService, this.accounts, input.customerReceipts);
        const depInner = checkSubledgerReconciliation('Customer Deposits', 'customer_deposits_subledger', deposits);
        results.push({
          check: 'Customer Deposits control (2600) vs unapplied customer receipts',
          status: fromBooksIntegrityStatus(depInner.status),
          detail:
            `Control R${deposits.controlAccountBalance.toFixed(2)} vs unapplied receipts R${deposits.subledgerTotal.toFixed(2)} — variance R${deposits.variance.toFixed(2)}. ${depInner.detail}`,
        });
      } catch {
        results.push({
          check: 'Customer Deposits control (2600) vs unapplied customer receipts',
          status: 'WARNING',
          detail: 'Unapplied customer receipts exist but no "2600 Customer Deposits" account is configured for this company — run migration 0045.',
        });
      }
    }

    return results;
  }

  private async vatChecks(input: AccountingIntegrityAuditInput): Promise<AuditCheckResult[]> {
    const periodStart = input.vatPeriodStart ?? DEFAULT_VAT_PERIOD_START;
    const periodEnd = input.vatPeriodEnd ?? DEFAULT_VAT_PERIOD_END;
    const report = computeVatReport(periodStart, periodEnd, input.invoices, input.creditNotes, input.bills, input.taxRates);
    const reconciliation = await reconcileVatControlAccounts(this.journalEntryService, this.accounts, periodStart, periodEnd, report);

    return [
      {
        check: 'VAT Output control (2100) vs computed output VAT',
        status: reconciliation.outputVat.isReconciled ? 'PASS' : 'WARNING',
        detail: `Control movement R${reconciliation.outputVat.controlAccountMovement.toFixed(2)} vs computed R${reconciliation.outputVat.reportTotal.toFixed(2)} — variance R${reconciliation.outputVat.variance.toFixed(2)}.`,
      },
      {
        check: 'VAT Input control (2110) vs computed input VAT',
        status: reconciliation.inputVat.isReconciled ? 'PASS' : 'WARNING',
        detail: `Control movement R${reconciliation.inputVat.controlAccountMovement.toFixed(2)} vs computed R${reconciliation.inputVat.reportTotal.toFixed(2)} — variance R${reconciliation.inputVat.variance.toFixed(2)}.`,
      },
      {
        check: 'Net VAT payable',
        status: report.unresolvedLineCount === 0 ? 'PASS' : 'WARNING',
        detail:
          report.unresolvedLineCount === 0
            ? `Output R${report.outputVat.total.toFixed(2)} − Input R${report.inputVat.total.toFixed(2)} = Net R${report.netVatPayable.toFixed(2)}. Every taxed line resolved to a known tax rate.`
            : `Output R${report.outputVat.total.toFixed(2)} − Input R${report.inputVat.total.toFixed(2)} = Net R${report.netVatPayable.toFixed(2)}. ${report.unresolvedLineCount} line(s) carried a taxAmount but no resolvable tax rate.`,
      },
    ];
  }

  /**
   * Bank GL integrity ONLY — the GL control account (1000, via
   * journalEntryService.getAccountLedger) against the Banking module's own
   * running subledger total (openingBalance + every bank_transaction's
   * signed amount). This is deliberately NOT the bank statement
   * reconciliation (open/unreconciled items, timing differences, etc.) —
   * see reconciliationIntelligence's Difference Investigator for that. A
   * bank account can have open statement exceptions while this check still
   * PASSes, because both sides here are the books' own numbers, not the
   * physical bank statement — see Part C of the audit report.
   */
  private async bankGlCheck(bankAccount: BankAccount, transactions: BankTransactionWithAllocations[]): Promise<AuditCheckResult> {
    const ledgerRows = await this.journalEntryService.getAccountLedger(bankAccount.glAccountId);
    const inner = checkBankSubledgerIntegrity(bankAccount, ledgerRows, transactions);
    const reconciledCount = transactions.filter((t) => t.status === 'reconciled').length;
    const unreconciledCount = transactions.filter((t) => t.status === 'unreconciled').length;
    return {
      check: 'Bank GL (1000) vs bank_transactions subledger — NOT statement reconciliation',
      status: fromBooksIntegrityStatus(inner.status),
      detail: `${inner.detail} (${transactions.length} bank_transactions total: ${reconciledCount} reconciled, ${unreconciledCount} unreconciled — that split is a separate, statement-level fact, not part of this GL check.)`,
    };
  }

  /**
   * Inventory: 1200 Inventory's real GL balance (via AccountMapper +
   * getAccountLedger — same pattern as reconcileAccountsReceivable/Payable)
   * compared against the subledger's own valuation (Σ quantityOnHand ×
   * costPrice across every tracked-inventory product) — the same "control
   * vs subledger" shape as AR/AP above, computed here since no existing
   * service in this codebase does it yet. Also verifies every product's
   * stock_movements net to its current quantityOnHand from a zero base
   * (every product's first movement is meant to be 'opening'), catching
   * any product whose movement history doesn't actually explain its
   * current on-hand figure.
   */
  private async inventoryChecks(products: Product[], stockMovements: StockMovement[]): Promise<AuditCheckResult[]> {
    const trackedProducts = products.filter((p) => p.trackInventory);
    const valuation = trackedProducts.reduce((sum, p) => sum + p.quantityOnHand * p.costPrice, 0);

    const inventoryAccountId = await this.accounts.getAccountId('INVENTORY');
    const ledgerRows = await this.journalEntryService.getAccountLedger(inventoryAccountId);
    const glBalance = ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].runningBalance : 0;
    const variance = glBalance - valuation;

    const movementsByProduct = new Map<ID, number>();
    for (const movement of stockMovements) {
      movementsByProduct.set(movement.productId, (movementsByProduct.get(movement.productId) ?? 0) + movement.quantityDelta);
    }
    const mismatched = trackedProducts.filter((p) => {
      const netMovement = movementsByProduct.get(p.id) ?? 0;
      return Math.abs(netMovement - p.quantityOnHand) > MONEY_EPSILON;
    });

    return [
      {
        check: 'Inventory GL (1200) vs Σ(quantityOnHand × costPrice)',
        status: Math.abs(variance) <= MONEY_EPSILON ? 'PASS' : 'WARNING',
        detail: `GL balance R${glBalance.toFixed(2)} vs ${trackedProducts.length} tracked-inventory product(s) valued at R${valuation.toFixed(2)} — variance R${variance.toFixed(2)}.`,
      },
      {
        check: 'Stock movements net to quantity on hand, per product',
        status: mismatched.length === 0 ? 'PASS' : 'WARNING',
        detail:
          mismatched.length === 0
            ? `All ${trackedProducts.length} tracked-inventory product(s): Σ stock_movements.quantityDelta equals quantityOnHand.`
            : `${mismatched.length} product(s) whose movement history does not net to their current quantityOnHand: ${mismatched.map((p) => p.sku).join(', ')}.`,
      },
    ];
  }

  /** Source-to-GL traceability + duplicate-posting checks across every document type that should carry a journalEntryId. */
  private traceabilityChecks(input: AccountingIntegrityAuditInput): AuditCheckResult[] {
    const invoiceDocs = input.invoices.map((i) => toPostable(i.id, i.invoiceNumber, i.status, i.journalEntryId));
    const billDocs = input.bills.map((b) => toPostable(b.id, b.billNumber, b.status, b.journalEntryId));
    const creditNoteDocs = input.creditNotes.map((c) => toPostable(c.id, c.creditNoteNumber, c.status, c.journalEntryId));
    // Receipts/payments have no draft state in this domain model — every one that exists should carry a posting.
    const receiptDocs = input.customerReceipts.map((r) => toPostable(r.id, r.receiptNumber, 'posted', r.journalEntryId));
    const paymentDocs = input.payments.map((p) => toPostable(p.id, p.paymentNumber, 'posted', p.journalEntryId));

    const results: AuditCheckResult[] = [
      this.orphanCheck('Invoices → journal entry', invoiceDocs, POSTED_INVOICE_STATUSES),
      this.orphanCheck('Bills → journal entry', billDocs, POSTED_BILL_STATUSES),
      this.orphanCheck('Credit notes → journal entry', creditNoteDocs, POSTED_CREDIT_NOTE_STATUSES),
      this.orphanCheck('Customer receipts → journal entry', receiptDocs, ['posted']),
      this.orphanCheck('Supplier payments → journal entry', paymentDocs, ['posted']),
    ];

    const allDocs = [...invoiceDocs, ...billDocs, ...creditNoteDocs, ...receiptDocs, ...paymentDocs];
    const dup = checkDuplicateGlPosting('All source documents', 'duplicate_gl_posting', allDocs);
    results.push({
      check: 'No journal entry referenced by more than one source document',
      status: fromBooksIntegrityStatus(dup.status),
      detail: dup.detail,
    });

    return results;
  }

  private orphanCheck(label: string, docs: PostableDocumentLike[], postedStatuses: string[]): AuditCheckResult {
    const inner = checkOrphanedPostedDocuments(label, label, docs, postedStatuses);
    return { check: label, status: fromBooksIntegrityStatus(inner.status), detail: inner.detail };
  }

  /**
   * Every journal_line's accountId must resolve to a real account this
   * service was given (the same Chart of Accounts computeTrialBalance()
   * just iterated) — an unresolvable account id is a structural
   * corruption (hand-edited row, botched migration), not a normal
   * reconciliation variance, so this is a FAIL.
   */
  private orphanJournalLinesCheck(postedEntries: JournalEntry[], accounts: Account[]): AuditCheckResult {
    const knownAccountIds = new Set(accounts.map((a) => a.id));
    const orphanLines: { entryNumber: string; accountId: ID }[] = [];
    for (const entry of postedEntries) {
      for (const line of entry.lines) {
        if (!knownAccountIds.has(line.accountId)) {
          orphanLines.push({ entryNumber: entry.entryNumber, accountId: line.accountId });
        }
      }
    }
    return {
      check: 'Journal lines reference a real, resolvable account',
      status: orphanLines.length === 0 ? 'PASS' : 'FAIL',
      detail:
        orphanLines.length === 0
          ? `Every line across ${postedEntries.length} posted entries resolves to a known account.`
          : `${orphanLines.length} line(s) reference an unknown account id: ${orphanLines.map((l) => `${l.entryNumber}→${l.accountId}`).join(', ')}.`,
    };
  }

  /**
   * This codebase's domain-model types (JournalEntry/JournalLine/Account)
   * carry no companyId field to compare directly — company scoping happens
   * one layer down, in how each repository's query is built (Supabase RLS
   * + an explicit company_id filter — see SupabaseJournalEntryRepository/
   * SupabaseAccountRepository). What this check CAN prove at this layer is
   * referential closure: every account id any posted journal line
   * references resolves within the single Chart of Accounts this service
   * was handed. If any row here had actually been pulled from a different
   * company, its account ids would not resolve against this company's own
   * chart — so this reuses the same underlying scan as the orphan-lines
   * check above, framed as the isolation proof it doubles as. A genuine
   * row-level "does this id belong to another company" audit needs direct
   * database access and is run separately (see the live SQL audit).
   */
  private companyIsolationCheck(postedEntries: JournalEntry[], accounts: Account[]): AuditCheckResult {
    const knownAccountIds = new Set(accounts.map((a) => a.id));
    const foreign = postedEntries.flatMap((e) => e.lines.filter((l) => !knownAccountIds.has(l.accountId)));
    return {
      check: 'Company isolation (referential closure within this Chart of Accounts)',
      status: foreign.length === 0 ? 'PASS' : 'FAIL',
      detail:
        foreign.length === 0
          ? `All ${postedEntries.length} posted entries reference only accounts belonging to this company's own Chart of Accounts (${accounts.length} accounts) — no cross-company account reference found.`
          : `${foreign.length} journal line(s) reference an account id outside this company's Chart of Accounts — possible cross-company leakage.`,
    };
  }

  /**
   * Every posted entry's date must fall inside a defined accounting
   * period (coverage) and, separately, that period should normally be
   * 'open' at post time (status). Split into two checks because they mean
   * different things: no covering period at all is a data-integrity gap
   * (FAIL); a covering period that isn't 'open' is a policy fact worth
   * surfacing (e.g. a historical entry now sitting inside a period that
   * has since been closed) but not itself proof of corruption (WARNING).
   */
  private financialPeriodChecks(postedEntries: JournalEntry[], periods: import('@/types').AccountingPeriod[]): AuditCheckResult[] {
    const uncovered: string[] = [];
    const nonOpen: string[] = [];
    for (const entry of postedEntries) {
      const period = findPeriodForDate(periods, entry.date);
      if (!period) {
        uncovered.push(entry.entryNumber);
      } else if (period.status !== 'open') {
        nonOpen.push(`${entry.entryNumber} (${period.name}, ${period.status})`);
      }
    }

    return [
      {
        check: 'Every posted entry falls within a defined accounting period',
        status: uncovered.length === 0 ? 'PASS' : 'FAIL',
        detail:
          uncovered.length === 0
            ? `All ${postedEntries.length} posted entries fall within a defined accounting period.`
            : `${uncovered.length} entry(ies) have no accounting period covering their date: ${uncovered.join(', ')}.`,
      },
      {
        check: 'Posted entries sit in an open-status period',
        status: nonOpen.length === 0 ? 'PASS' : 'WARNING',
        detail:
          nonOpen.length === 0
            ? `All ${postedEntries.length} posted entries sit in a period whose status was 'open'.`
            : `${nonOpen.length} entry(ies) sit in a non-open period: ${nonOpen.join(', ')}.`,
      },
    ];
  }
}
