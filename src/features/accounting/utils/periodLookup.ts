import type { AccountingPeriod, ISODateString } from '@/types';

/**
 * Pure lookup shared by AccountingPeriodService and JournalEntryService so
 * "which period contains this date" is defined exactly once, without the
 * two services depending on each other (this codebase keeps feature
 * services decoupled — see docs/ARCHITECTURE.md). Returns undefined if no
 * period covers the date, which callers must treat as "cannot post here",
 * not as "anything goes".
 */
export function findPeriodForDate(
  periods: AccountingPeriod[],
  date: ISODateString,
): AccountingPeriod | undefined {
  const target = new Date(date).getTime();
  return periods.find((p) => target >= new Date(p.startDate).getTime() && target <= new Date(p.endDate).getTime());
}
