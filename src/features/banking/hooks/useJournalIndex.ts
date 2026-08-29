import { useEffect, useMemo, useState } from 'react';
import type { ID, JournalEntry } from '@/types';
import { journalEntryService } from '@/features/accounting/services';

/**
 * A read-only index of every journal entry, so the reconciliation workspace
 * can show the journal NUMBER (not a raw uuid) for a matched transaction's
 * posting and answer "is the underlying journal balanced?" for the proof
 * checklist. One fetch, memoised lookups — the same `journalEntryService`
 * singleton the investigator already uses.
 */
export function useJournalIndex(enabled = true) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void journalEntryService
      .getEntries()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo(() => {
    const byId = new Map(entries.map((e) => [e.id, e]));
    return {
      isLoading,
      numberFor: (journalEntryId: ID) => byId.get(journalEntryId)?.entryNumber,
      balancedFor: (journalEntryId: ID): boolean | undefined => {
        const e = byId.get(journalEntryId);
        if (!e) return undefined;
        const debit = e.lines.reduce((s, l) => s + l.debit, 0);
        const credit = e.lines.reduce((s, l) => s + l.credit, 0);
        return Math.abs(debit - credit) < 0.005;
      },
    };
  }, [entries, isLoading]);
}
