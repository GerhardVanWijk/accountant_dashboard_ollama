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

/**
 * Extracts the leading alphabetic prefix of a `PREFIX-YYYY-NNNN` document
 * number (e.g. "INV" from "INV-2026-0007"), falling back to `fallback`
 * when the head is missing or non-alphabetic. Used by the duplicate/copy
 * service methods so a copied document keeps the source's own numbering
 * convention.
 */
export function documentNumberPrefix(source: string, fallback: string): string {
  const head = source.split('-')[0];
  return head && /^[A-Za-z]+$/.test(head) ? head : fallback;
}
