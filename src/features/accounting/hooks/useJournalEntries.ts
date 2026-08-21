import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ID, JournalEntry } from '@/types';
import {
  journalEntryService,
  type JournalValidationResult,
  type NewJournalEntryInput,
  type NewJournalLineInput,
} from '../services';

export interface UseJournalEntriesResult {
  entries: JournalEntry[];
  /** entry id -> id of the entry that reverses it, if any. Derived from
   * `reversalOfEntryId` rather than a mutable status flag, matching the
   * append-only ledger model (docs/LEDGER_ARCHITECTURE.md). */
  reversedByEntryId: Map<ID, ID>;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  validateLines: (lines: NewJournalLineInput[]) => Promise<JournalValidationResult>;
  postJournalEntry: (input: NewJournalEntryInput) => Promise<JournalEntry>;
  reverseJournalEntry: (entryId: ID, memo?: string) => Promise<JournalEntry>;
}

/**
 * Component -> useJournalEntries -> journalEntryService -> MockJournalEntryRepository.
 * Posting/reversal both throw on failure (unbalanced lines, closed period,
 * already-reversed entry) — callers surface `err.message` to the user
 * rather than re-deriving those rules here.
 */
export function useJournalEntries(): UseJournalEntriesResult {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await journalEntryService.getEntries();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load journal entries'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const validateLines = useCallback((lines: NewJournalLineInput[]) => journalEntryService.validateLines(lines), []);

  const postJournalEntry = useCallback(
    async (input: NewJournalEntryInput) => {
      const posted = await journalEntryService.postJournalEntry(input);
      await load();
      return posted;
    },
    [load],
  );

  const reverseJournalEntry = useCallback(
    async (entryId: ID, memo?: string) => {
      const reversal = await journalEntryService.reverseJournalEntry(entryId, undefined, memo);
      await load();
      return reversal;
    },
    [load],
  );

  const reversedByEntryId = useMemo(() => {
    const map = new Map<ID, ID>();
    for (const entry of entries) {
      if (entry.reversalOfEntryId) {
        map.set(entry.reversalOfEntryId, entry.id);
      }
    }
    return map;
  }, [entries]);

  return {
    entries,
    reversedByEntryId,
    loading,
    error,
    refetch: load,
    validateLines,
    postJournalEntry,
    reverseJournalEntry,
  };
}
