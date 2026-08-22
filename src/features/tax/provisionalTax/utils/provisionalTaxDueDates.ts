import type { FinancialYear } from '@/types';

/**
 * SARS provisional tax due dates (SA_ACCOUNTING_MASTER_SPEC.md §54), derived
 * structurally from a company's own accounting FinancialYear — NOT from
 * getSarsTaxYear() (src/features/employees/utils/sarsTaxYear.ts), which is
 * the unrelated 1 March-end-February individual/PAYE withholding tax year
 * (see that util's own doc comment, and TaxComputationService's class doc
 * comment for the same ACCOUNTING-YEAR-vs-SARS-TAX-YEAR distinction drawn
 * there — §59).
 *
 * Rules (structural, cited as the rule itself — no numeric statutory rate
 * involved, so no "professional verification" flag needed here, unlike a
 * rate or bracket):
 * - First provisional payment: 6 calendar months after the financial year
 *   START date (the midpoint of the year).
 * - Second provisional payment: on the financial year END date itself.
 * - Third/"top-up" payment (voluntary, §54): 6 calendar months after the
 *   financial year END date.
 */
export function calculateProvisionalTaxDueDates(
  financialYear: Pick<FinancialYear, 'startDate' | 'endDate'>,
): { first: Date; second: Date; topUp: Date } {
  return {
    first: addCalendarMonthsClamped(financialYear.startDate, 6),
    second: new Date(financialYear.endDate),
    topUp: addCalendarMonthsClamped(financialYear.endDate, 6),
  };
}

/**
 * Adds `months` calendar months to an ISO date, preserving the day-of-month
 * unless the target month is shorter — in which case it clamps to that
 * month's actual last day (e.g. 31 Aug + 6 months -> 29 Feb in a leap year,
 * 28 Feb otherwise) rather than letting the underlying Date object silently
 * roll over into the following month, which is the normal JS Date
 * `setUTCMonth` overflow behavior and would produce the wrong calendar
 * month entirely for a month-end financial year boundary.
 */
function addCalendarMonthsClamped(iso: string, months: number): Date {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
}
