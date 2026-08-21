/**
 * Generates the next sequential document number in the
 * "<PREFIX>-<year>-<seq>" format already used across this module's seed
 * data (PO-2026-0001, PAY-2026-0001, BILL-2026-0001). Pure function — no
 * I/O, no JSX — so every create-form's default-number field can share one
 * implementation instead of each page reinventing its own counter.
 */
export function nextDocumentNumber(
  existingNumbers: string[],
  prefix: string,
  year: number = new Date().getFullYear(),
): string {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = existingNumbers.reduce((acc, num) => {
    const match = num.match(pattern);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}
