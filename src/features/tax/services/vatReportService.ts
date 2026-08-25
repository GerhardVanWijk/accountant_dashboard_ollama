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

/** One real posted document's contribution to a VAT period — for the "which transactions make up this figure" traceability view (M7). Reuses the exact same per-line classification `computeVatReport()` already does; this is a different SHAPE of the same output (per-document, not aggregated by treatment), not a second calculation. */
export interface VatTransactionRow {
  id: ID;
  documentType: 'invoice' | 'credit_note' | 'bill';
  documentNumber: string;
  date: ISODateString;
  direction: 'output' | 'input';
  /** Undefined when none of the document's lines resolved to a known TaxRate. */
  treatment: VatTreatment | undefined;
  taxBase: number;
  vatAmount: number;
}

function dominantTreatment(lines: LineLike[], allTaxRates: TaxRate[]): VatTreatment | undefined {
  for (const line of lines) {
    if (!line.taxRateId) continue;
    const rate = allTaxRates.find((r) => r.id === line.taxRateId);
    if (rate) return rate.treatment;
  }
  return undefined;
}

/**
 * Real posted Invoices/Credit Notes/Bills that fed into a period's VAT
 * figures, one row per document (not per line — matches the granularity a
 * user cross-checks against the Sales/Purchases screens by document
 * number). Same period/status filtering as `computeVatReport()`; a
 * document with more than one tax treatment across its lines is labelled
 * with its first resolvable line's treatment (the per-treatment split for
 * that case is already exact in the breakdown tables above — this list is
 * for traceability, not a second source of the totals).
 */
export function listVatTransactions(
  periodStart: Date,
  periodEnd: Date,
  invoices: Invoice[],
  creditNotes: CreditNote[],
  bills: Bill[],
  allTaxRates: TaxRate[],
): VatTransactionRow[] {
  const rows: VatTransactionRow[] = [];

  for (const invoice of invoices) {
    if (invoice.status === 'draft' || invoice.status === 'void') continue;
    if (!inPeriod(invoice.issueDate, periodStart, periodEnd)) continue;
    if (invoice.taxTotal === 0) continue;
    rows.push({
      id: invoice.id,
      documentType: 'invoice',
      documentNumber: invoice.invoiceNumber,
      date: invoice.issueDate,
      direction: 'output',
      treatment: dominantTreatment(invoice.lineItems, allTaxRates),
      taxBase: invoice.subtotal,
      vatAmount: invoice.taxTotal,
    });
  }

  for (const creditNote of creditNotes) {
    if (creditNote.status === 'draft' || creditNote.status === 'void') continue;
    if (!inPeriod(creditNote.issueDate, periodStart, periodEnd)) continue;
    if (creditNote.taxTotal === 0) continue;
    rows.push({
      id: creditNote.id,
      documentType: 'credit_note',
      documentNumber: creditNote.creditNoteNumber,
      date: creditNote.issueDate,
      direction: 'output',
      treatment: dominantTreatment(creditNote.lineItems, allTaxRates),
      taxBase: -creditNote.subtotal,
      vatAmount: -creditNote.taxTotal,
    });
  }

  for (const bill of bills) {
    if (bill.status === 'draft' || bill.status === 'void') continue;
    if (!inPeriod(bill.issueDate, periodStart, periodEnd)) continue;
    if (bill.taxTotal === 0) continue;
    rows.push({
      id: bill.id,
      documentType: 'bill',
      documentNumber: bill.billNumber,
      date: bill.issueDate,
      direction: 'input',
      treatment: dominantTreatment(bill.lineItems, allTaxRates),
      taxBase: bill.subtotal,
      vatAmount: bill.taxTotal,
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
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
