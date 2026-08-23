import type { Employee } from '@/types';

/**
 * Regulation 26(2)'s "average number of employees" for a Public Interest
 * Score, computed from real Employee records rather than asked for as a
 * manual input — this codebase HAS real employment-date data
 * (`Employee.startDate`/`terminationDate`), so it should not be re-entered
 * by hand. Samples headcount once per calendar month inside
 * [periodStart, periodEnd] (an employee counts for a month if their
 * employment overlaps ANY part of it) and averages the monthly counts —
 * a standard "average number of employees during the year" reading, and the
 * same month-by-month sampling approach `getSarsTaxYear()`'s codebase
 * neighbours use for period-based calculations rather than a single
 * point-in-time headcount.
 */
export function calculateAverageEmployeeCount(employees: Employee[], periodStart: Date, periodEnd: Date): number {
  if (periodEnd < periodStart) return 0;

  const monthStarts: Date[] = [];
  let cursor = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1));
  while (cursor <= periodEnd) {
    monthStarts.push(cursor);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  if (monthStarts.length === 0) return 0;

  const monthlyCounts = monthStarts.map((monthStart) => {
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const windowStart = monthStart < periodStart ? periodStart : monthStart;
    const windowEnd = monthEnd > periodEnd ? periodEnd : monthEnd;

    return employees.filter((employee) => {
      const employeeStart = new Date(employee.startDate);
      const employeeEnd = employee.terminationDate ? new Date(employee.terminationDate) : null;
      return employeeStart <= windowEnd && (!employeeEnd || employeeEnd >= windowStart);
    }).length;
  });

  const total = monthlyCounts.reduce((sum, count) => sum + count, 0);
  return total / monthlyCounts.length;
}
