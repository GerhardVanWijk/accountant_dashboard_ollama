/**
 * Deterministic journal-entry id for a seed source document (invoice/bill/
 * credit note) — shared naming convention between the document's own
 * `journalEntryId` field and the generated `JournalEntry` record in
 * journalEntries.ts, so the two stay in sync without a circular import
 * between invoices.ts/bills.ts and journalEntries.ts.
 */
export function seedJournalEntryId(sourceId: string): string {
  return `je_seed_${sourceId}`;
}
