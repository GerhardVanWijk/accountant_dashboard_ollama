import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Account } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';
import { cn } from '@/lib/utils';
import type { JournalValidationResult, NewJournalEntryInput, NewJournalLineInput } from '../services';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

interface DraftLine {
  key: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

function emptyLine(key: string): DraftLine {
  return { key, accountId: '', description: '', debit: '', credit: '' };
}

function toLineInput(line: DraftLine): NewJournalLineInput {
  return {
    accountId: line.accountId,
    description: line.description.trim() || undefined,
    debit: Number(line.debit) || 0,
    credit: Number(line.credit) || 0,
  };
}

export interface JournalEntryFormProps {
  accounts: Account[];
  validateLines: (lines: NewJournalLineInput[]) => Promise<JournalValidationResult>;
  onSubmit: (input: NewJournalEntryInput) => Promise<void>;
  onCancel: () => void;
}

/**
 * Manual journal entry workspace: header (date/memo/source) + a dynamic
 * debit/credit line grid with real-time balance validation. This is a v0
 * re-skin only — every piece of state, the debounce, and the submit flow
 * are unchanged from the pre-port form. The debit=credit check itself is
 * never recomputed here — every keystroke re-runs
 * journalEntryService.validateLines() (via the `validateLines` prop) so
 * the UI can never drift from the one place that invariant is allowed to
 * live (docs/LEDGER_ARCHITECTURE.md). There is no "save as draft" —
 * JournalEntryService.postJournalEntry() posts immediately, so submitting
 * this form posts to the real ledger right away; v0's mock data implies a
 * draft/awaiting-review workflow the real engine doesn't have, see the M3
 * report.
 */
export function JournalEntryForm({ accounts, validateLines, onSubmit, onCancel }: JournalEntryFormProps) {
  const activeAccounts = accounts.filter((a) => a.isActive);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [source, setSource] = useState('manual');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine('l1'), emptyLine('l2')]);
  const [nextKey, setNextKey] = useState(3);
  const [validation, setValidation] = useState<JournalValidationResult>({ valid: false, errors: [] });
  const [validating, setValidating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const difference = totalDebit - totalCredit;

  useEffect(() => {
    let cancelled = false;
    setValidating(true);
    validateLines(lines.map(toLineInput))
      .then((result) => {
        if (!cancelled) setValidation(result);
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lines)]);

  function updateLine(key: string, patch: Partial<DraftLine>): void {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine(): void {
    setLines((prev) => [...prev, emptyLine(`l${nextKey}`)]);
    setNextKey((n) => n + 1);
  }

  function removeLine(key: string): void {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));
  }

  const canSubmit = validation.valid && !validating && !submitting && Boolean(date);

  async function handleSubmit(): Promise<void> {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        date: new Date(date).toISOString(),
        memo: memo.trim() || undefined,
        source: source.trim() || 'manual',
        lines: lines.map(toLineInput),
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not post journal entry.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {submitError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {submitError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="je-date">Date</FieldLabel>
          <Input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="je-source">Source</FieldLabel>
          <Input id="je-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="manual" />
        </Field>
        <Field>
          <FieldLabel htmlFor="je-memo">Memo (optional)</FieldLabel>
          <Input id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Account
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Description
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Debit
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Credit
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 align-top">
                    <select
                      aria-label="Account"
                      className={selectClassName}
                      value={line.accountId}
                      onChange={(e) => updateLine(line.key, { accountId: e.target.value })}
                    >
                      <option value="">Select account…</option>
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      aria-label="Line description"
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      aria-label="Debit"
                      type="number"
                      step="0.01"
                      min="0"
                      className={cn('text-right tabular-nums')}
                      value={line.debit}
                      onChange={(e) => updateLine(line.key, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      aria-label="Credit"
                      type="number"
                      step="0.01"
                      min="0"
                      className={cn('text-right tabular-nums')}
                      value={line.credit}
                      onChange={(e) => updateLine(line.key, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 2}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button variant="ghost" size="sm" type="button" className="self-start" onClick={addLine}>
          <Plus data-icon="inline-start" />
          Add line
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total debits</span>
          <Amount value={totalDebit} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total credits</span>
          <Amount value={totalCredit} />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5 font-medium">
          <span className={difference === 0 ? 'text-positive' : 'text-negative'}>
            {difference === 0 ? 'Balanced' : 'Out of balance'}
          </span>
          <Amount value={difference} />
        </div>
        {!validating && validation.errors.length > 0 && (
          <ul className="mt-1.5 list-disc pl-5 text-xs text-destructive">
            {validation.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Posting…' : 'Post journal entry'}
        </Button>
      </div>
    </div>
  );
}
