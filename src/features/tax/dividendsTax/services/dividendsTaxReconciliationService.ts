import type { DividendDeclaration, ID, ISODateString } from '@/types';
import type { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import type { AccountMapper } from '@/features/accounting/services';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. Same convention as vatReportService.ts's VAT_VARIANCE_EPSILON. */
const VARIANCE_EPSILON = 0.005;

function inPeriod(dateIso: ISODateString | undefined, periodStart: Date, periodEnd: Date): boolean {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  return d >= periodStart && d <= periodEnd;
}

export interface DividendsTaxControlAccountCheck {
  controlAccountId: ID;
  /** The register's own derived figure for this period — never re-read from the GL side. */
  expectedMovement: number;
  /** Net amount actually posted to this control account during the period (a movement, not the account's all-time running balance). */
  glMovement: number;
  variance: number;
  isReconciled: boolean;
}

export interface DividendsTaxReconciliation {
  dividendsPayable: DividendsTaxControlAccountCheck;
  dividendsTaxPayable: DividendsTaxControlAccountCheck;
}

/** One register-side event that fed into a period's expected movement — the drill-down row for a variance investigation. */
export interface DividendsTaxRegisterEvent {
  declarationId: ID;
  event: 'declare' | 'pay' | 'remit';
  date: ISODateString;
  /** Signed the same way as the control account it affects (credit-normal: +credit / -debit). */
  amount: number;
  account: 'dividends_payable' | 'dividends_tax_payable';
}

/**
 * Dividends Tax Register <-> GL reconciliation (Tax & Compliance integrity
 * audit continuation, 2026-09-12, §3). Mirrors
 * `vatReportService.reconcileVatControlAccounts()`'s exact shape and
 * reasoning applied to Dividends Payable / Dividends Tax Payable: the
 * "expected" side is derived PURELY from the register's own real posted
 * events (declare/pay/remit, each dated by when it actually happened —
 * the same date its journal was posted on), never re-read from the GL;
 * the "GL" side is the real ledger movement for the period. Comparing two
 * independently-derived numbers is what makes this a genuine
 * reconciliation rather than a tautology — see class doc comment's "Do
 * NOT derive both sides from the same source" requirement.
 *
 * Sign convention: both Dividends Payable and Dividends Tax Payable are
 * credit-normal liability accounts. `declare()` CREDITS Dividends Payable
 * (+totalAmount); `pay()` DEBITS Dividends Payable (-totalAmount) and
 * CREDITS Dividends Tax Payable (+dividendsTaxWithheld); `remitToSars()`
 * DEBITS Dividends Tax Payable (-dividendsTaxWithheld). Each event is
 * dated by its own real date (declarationDate/paidDate/remittedDate), NOT
 * by the declaration's current overall status — a declaration created
 * last year but paid this period contributes its `pay` event to THIS
 * period's movement and nothing to last period's, exactly matching what
 * the GL actually shows.
 */
export function computeExpectedDividendsTaxMovements(
  declarations: DividendDeclaration[],
  periodStart: Date,
  periodEnd: Date,
): { dividendsPayable: number; dividendsTaxPayable: number; events: DividendsTaxRegisterEvent[] } {
  let dividendsPayable = 0;
  let dividendsTaxPayable = 0;
  const events: DividendsTaxRegisterEvent[] = [];

  for (const d of declarations) {
    if (d.declarationJournalEntryId && inPeriod(d.declarationDate, periodStart, periodEnd)) {
      dividendsPayable += d.totalAmount;
      events.push({ declarationId: d.id, event: 'declare', date: d.declarationDate, amount: d.totalAmount, account: 'dividends_payable' });
    }
    if (d.paymentJournalEntryId && inPeriod(d.paidDate, periodStart, periodEnd)) {
      dividendsPayable -= d.totalAmount;
      events.push({ declarationId: d.id, event: 'pay', date: d.paidDate!, amount: -d.totalAmount, account: 'dividends_payable' });
      if (d.dividendsTaxWithheld > VARIANCE_EPSILON) {
        dividendsTaxPayable += d.dividendsTaxWithheld;
        events.push({ declarationId: d.id, event: 'pay', date: d.paidDate!, amount: d.dividendsTaxWithheld, account: 'dividends_tax_payable' });
      }
    }
    if (d.remittanceJournalEntryId && inPeriod(d.remittedDate, periodStart, periodEnd)) {
      dividendsTaxPayable -= d.dividendsTaxWithheld;
      events.push({ declarationId: d.id, event: 'remit', date: d.remittedDate!, amount: -d.dividendsTaxWithheld, account: 'dividends_tax_payable' });
    }
  }

  return { dividendsPayable, dividendsTaxPayable, events };
}

/**
 * Compares the register's own expected movement (above) against what was
 * actually posted to the Dividends Payable / Dividends Tax Payable
 * control accounts during the SAME period. A variance means a journal
 * touched one of these accounts that the register doesn't account for
 * (or vice versa) — including a directly-tampered/manually-posted journal
 * entry, since the GL side here is read independently from real ledger
 * rows, never assumed to match.
 */
export async function reconcileDividendsTaxControlAccounts(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  periodStart: Date,
  periodEnd: Date,
  declarations: DividendDeclaration[],
): Promise<DividendsTaxReconciliation> {
  const [dividendsPayableAccountId, dividendsTaxPayableAccountId] = await Promise.all([
    accounts.getAccountId('DIVIDENDS_PAYABLE'),
    accounts.getAccountId('DIVIDENDS_TAX_PAYABLE'),
  ]);
  const [payableRows, taxPayableRows] = await Promise.all([
    journalEntryService.getAccountLedger(dividendsPayableAccountId),
    journalEntryService.getAccountLedger(dividendsTaxPayableAccountId),
  ]);

  const payableMovement = payableRows
    .filter((row) => inPeriod(row.date, periodStart, periodEnd))
    .reduce((sum, row) => sum + (row.credit - row.debit), 0);
  const taxPayableMovement = taxPayableRows
    .filter((row) => inPeriod(row.date, periodStart, periodEnd))
    .reduce((sum, row) => sum + (row.credit - row.debit), 0);

  const expected = computeExpectedDividendsTaxMovements(declarations, periodStart, periodEnd);

  const payableVariance = payableMovement - expected.dividendsPayable;
  const taxPayableVariance = taxPayableMovement - expected.dividendsTaxPayable;

  return {
    dividendsPayable: {
      controlAccountId: dividendsPayableAccountId,
      expectedMovement: expected.dividendsPayable,
      glMovement: payableMovement,
      variance: payableVariance,
      isReconciled: Math.abs(payableVariance) <= VARIANCE_EPSILON,
    },
    dividendsTaxPayable: {
      controlAccountId: dividendsTaxPayableAccountId,
      expectedMovement: expected.dividendsTaxPayable,
      glMovement: taxPayableMovement,
      variance: taxPayableVariance,
      isReconciled: Math.abs(taxPayableVariance) <= VARIANCE_EPSILON,
    },
  };
}
