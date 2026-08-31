/**
 * The ONE journal-entry numbering rule for the whole app (Phase 3C, item 4).
 *
 * Before Phase 3C three places each ran their own `count(*) + 1`:
 *   - `JournalEntryService.nextEntryNumber()` (removed in 3C)
 *   - `post_inventory_transaction`    (migration 0031/0032 → fixed in 0035)
 *   - `reverse_inventory_transaction` (migration 0031      → fixed in 0035)
 *
 * `count(*) + 1` is wrong the instant a number is deleted or gapped — it
 * re-issues a live number, which the `journal_entries (company_id,
 * entry_number)` UNIQUE constraint then rejects — and it races under
 * concurrency.
 *
 * The authoritative implementation is the Postgres allocator
 * `public.allocate_journal_number(company_id)` (migration 0033): a per-company
 * `journal_number_counters` row, seeded once from the highest existing
 * `JE-<n>` suffix, incremented atomically via `UPDATE ... RETURNING`.
 *
 * This function is the SAME rule for the in-memory `MockJournalEntryRepository`
 * (tests only — no concurrency, no DB): next number = (highest existing numeric
 * `JE-<n>` suffix) + 1. Non-standard historic numbers (anything not
 * `/^JE-\d+$/` — a manual `OPENING`, a `REV-2003`, an empty string) are ignored
 * for the high-water mark: they cannot collide with the `JE-<n>` sequence, and
 * folding them in would risk seeding too high or too low. An empty ledger, or a
 * ledger with only non-standard numbers, starts at `JE-0001`.
 *
 * One architecture (this rule), two implementations (DB function / in-memory) —
 * consistent with every other repository's Mock/Supabase pair in this codebase.
 */

const JE_NUMBER = /^JE-0*(\d+)$/;

export function highestJournalOrdinal(existingNumbers: Iterable<string | null | undefined>): number {
  let max = 0;
  for (const raw of existingNumbers) {
    const match = JE_NUMBER.exec(raw ?? '');
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

export function formatJournalEntryNumber(ordinal: number): string {
  return `JE-${String(ordinal).padStart(4, '0')}`;
}

export function deriveNextJournalEntryNumber(
  existingNumbers: Iterable<string | null | undefined>,
): string {
  return formatJournalEntryNumber(highestJournalOrdinal(existingNumbers) + 1);
}
