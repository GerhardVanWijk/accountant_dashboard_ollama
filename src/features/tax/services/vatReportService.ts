import type { Bill, CreditNote, ID, ISODateString, Invoice, TaxRate, VatTreatment } from '@/types';
import type { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import type { AccountMapper } from '@/features/accounting/services';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. */
const VAT_VARIANCE_EPSILON = 0.005;

/** One VAT treatment's contribution to a report — tax base (excl. VAT) and the VAT itself. */
export interface VatTreatmentBreakdown {
  treatment: VatTreatment;
  taxBase: number;
  vatAmount: number;
}

export interface VatReport {
  periodStart: ISODateString;
  periodEnd: ISODateString;
  outputVat: {
    byTreatment: VatTreatmentBreakdown[];
    total: number;
  };
  inputVat: {
    byTreatment: VatTreatmentBreakdown[];
    /** VAT paid to suppliers but not claimable (treatment 'non_deductible') — excluded from `total`. */
    nonDeductibleTotal: number;
    /** Claimable input VAT only. */
    total: number;
  };
  /** outputVat.total - inputVat.total. Positive = payable to SARS, negative = refund due. */
  netVatPayable: number;
  /** Line items whose taxRateId didn't resolve to any known TaxRate — flagged, never silently dropped. */
  unresolvedLineCount: number;
}

function emptyBreakdownMap(): Map<VatTreatment, VatTreatmentBreakdown> {
  return new Map();
}

function addToBreakdown(map: Map<VatTreatment, VatTreatmentBreakdown>, treatment: VatTreatment, taxBase: number, vatAmount: number): void {
  const existing = map.get(treatment);
  if (existing) {
    existing.taxBase += taxBase;
    existing.vatAmount += vatAmount;
  } else {
    map.set(treatment, { treatment, taxBase, vatAmount });
  }
}

function inPeriod(dateIso: ISODateString, periodStart: Date, periodEnd: Date): boolean {
  const d = new Date(dateIso);
  return d >= periodStart && d <= periodEnd;
}

interface LineLike {
  taxRateId?: ID;
  taxAmount: number;
  lineTotal: number;
}

/**
 * Accumulates one document's line items into a treatment breakdown map.
 * `sign` is -1 for documents that REDUCE the running total (credit notes
 * reduce output VAT) and +1 otherwise. Resolves each line's `taxRateId`
 * against `allTaxRates` (every version ever created, not just currently-
 * effective ones — a line posted years ago may reference a since-
 * superseded rate) so historical documents still classify correctly.
 */
function accumulateLines(
  lines: LineLike[],
  allTaxRates: TaxRate[],
  breakdown: Map<VatTreatment, VatTreatmentBreakdown>,
  sign: 1 | -1,
): number {
  let unresolved = 0;
  for (const line of lines) {
    if (!line.taxRateId) {
      if (line.taxAmount !== 0) unresolved += 1;
      continue;
    }
    const rate = allTaxRates.find((r) => r.id === line.taxRateId);
    if (!rate) {
      unresolved += 1;
      continue;
    }
    addToBreakdown(breakdown, rate.treatment, sign * line.lineTotal, sign * line.taxAmount);
  }
  return unresolved;
}

/**
 * Computes a VAT summary for one period from real, posted documents — no
 * document is re-taxed here, every line's already-posted `taxAmount` is
 * simply classified by its tax rate's `treatment` and summed
 * (SA_ACCOUNTING_MASTER_SPEC.md §64/§97: never derive a report from
 * recomputed numbers when the real posted figures already exist).
 *
 * Deliberately NOT labelled with SARS VAT201 box numbers — this
 * codebase has not independently verified the exact box layout against
 * SARS/the VAT Act, so it presents Output/Input/Net VAT by treatment
 * instead of claiming an official form mapping it hasn't verified
 * (§110/§111). A real VAT201 box mapping is a follow-up, not guessed here.
 *
 * Draft and void documents are excluded — they never became real
 * output/input VAT. Credit notes reduce output VAT (they reverse an
 * invoice's posting); non-deductible input VAT (`treatment ===
 * 'non_deductible'`) is reported separately and excluded from the
 * claimable input VAT total, per §12.
 */
export function computeVatReport(
  periodStart: Date,
  periodEnd: Date,
  invoices: Invoice[],
  creditNotes: CreditNote[],
  bills: Bill[],
  allTaxRates: TaxRate[],
): VatReport {
  const outputBreakdown = emptyBreakdownMap();
  const inputBreakdown = emptyBreakdownMap();
  let unresolvedLineCount = 0;

  for (const invoice of invoices) {
    if (invoice.status === 'draft' || invoice.status === 'void') continue;
    if (!inPeriod(invoice.issueDate, periodStart, periodEnd)) continue;
    unresolvedLineCount += accumulateLines(invoice.lineItems, allTaxRates, outputBreakdown, 1);
  }

  for (const creditNote of creditNotes) {
    if (creditNote.status === 'draft' || creditNote.status === 'void') continue;
    if (!inPeriod(creditNote.issueDate, periodStart, periodEnd)) continue;
    unresolvedLineCount += accumulateLines(creditNote.lineItems, allTaxRates, outputBreakdown, -1);
  }

  for (const bill of bills) {
    if (bill.status === 'draft' || bill.status === 'void') continue;
    if (!inPeriod(bill.issueDate, periodStart, periodEnd)) continue;
    unresolvedLineCount += accumulateLines(bill.lineItems, allTaxRates, inputBreakdown, 1);
  }

  const outputRows = [...outputBreakdown.values()].sort((a, b) => a.treatment.localeCompare(b.treatment));
  const outputTotal = outputRows.reduce((sum, row) => sum + row.vatAmount, 0);

  const allInputRows = [...inputBreakdown.values()].sort((a, b) => a.treatment.localeCompare(b.treatment));
  const nonDeductibleTotal = allInputRows.find((r) => r.treatment === 'non_deductible')?.vatAmount ?? 0;
  const claimableInputRows = allInputRows.filter((r) => r.treatment !== 'non_deductible');
  const inputTotal = claimableInputRows.reduce((sum, row) => sum + row.vatAmount, 0);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    outputVat: { byTreatment: outputRows, total: outputTotal },
    inputVat: { byTreatment: claimableInputRows, nonDeductibleTotal, total: inputTotal },
    netVatPayable: outputTotal - inputTotal,
    unresolvedLineCount,
  };
}

export interface VatControlAccountCheck {
  controlAccountId: ID;
  /** Net amount actually posted to this control account during the period (not its all-time running balance). */
  controlAccountMovement: number;
  /** This period's computed VAT total from computeVatReport(). */
  reportTotal: number;
  variance: number;
  isReconciled: boolean;
}

export interface VatReconciliation {
  outputVat: VatControlAccountCheck;
  inputVat: VatControlAccountCheck;
}

/**
 * Compares this period's computed Output/Input VAT against what was
 * actually POSTED to the VAT Output/Input control accounts during that
 * same period (a movement, not the account's all-time running balance —
 * VAT control accounts also get settled/paid, so their cumulative balance
 * isn't the right comparison for one period). A variance means a
 * document posted VAT to the GL that computeVatReport() didn't count (or
 * vice versa) — a real discrepancy per SA_ACCOUNTING_MASTER_SPEC.md
 * §17/§70/§71's reconciliation-first principle, applied to VAT.
 */
export async function reconcileVatControlAccounts(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  periodStart: Date,
  periodEnd: Date,
  report: VatReport,
): Promise<VatReconciliation> {
  const [vatOutputAccountId, vatInputAccountId] = await Promise.all([
    accounts.getAccountId('VAT_OUTPUT'),
    accounts.getAccountId('VAT_INPUT'),
  ]);
  const [outputRows, inputRows] = await Promise.all([
    journalEntryService.getAccountLedger(vatOutputAccountId),
    journalEntryService.getAccountLedger(vatInputAccountId),
  ]);

  const outputMovement = outputRows
    .filter((row) => inPeriod(row.date, periodStart, periodEnd))
    .reduce((sum, row) => sum + (row.credit - row.debit), 0); // credit-normal: a credit increases the payable

  const inputMovement = inputRows
    .filter((row) => inPeriod(row.date, periodStart, periodEnd))
    .reduce((sum, row) => sum + (row.debit - row.credit), 0); // debit-normal: a debit increases the receivable

  const outputVariance = outputMovement - report.outputVat.total;
  const inputVariance = inputMovement - report.inputVat.total;

  return {
    outputVat: {
      controlAccountId: vatOutputAccountId,
      controlAccountMovement: outputMovement,
      reportTotal: report.outputVat.total,
      variance: outputVariance,
      isReconciled: Math.abs(outputVariance) <= VAT_VARIANCE_EPSILON,
    },
    inputVat: {
      controlAccountId: vatInputAccountId,
      controlAccountMovement: inputMovement,
      reportTotal: report.inputVat.total,
      variance: inputVariance,
      isReconciled: Math.abs(inputVariance) <= VAT_VARIANCE_EPSILON,
    },
  };
}
