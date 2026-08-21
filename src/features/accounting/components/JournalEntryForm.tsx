import { useEffect, useState } from 'react';
import type { Account } from '@/types';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import type { JournalValidationResult, NewJournalEntryInput, NewJournalLineInput } from '../services';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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
 * debit/credit line grid with real-time balance validation. The
 * debit=credit check itself is never recomputed here — every keystroke
 * re-runs journalEntryService.validateLines() (via the `validateLines`
 * prop) so the UI can never drift from the one place that invariant is
 * allowed to live (docs/LEDGER_ARCHITECTURE.md).
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
    <div className="flex flex-col gap-lg">
      {submitError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {submitError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Date</span>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Source</span>
          <input className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} placeholder="manual" />
        </label>
        <label className="flex flex-col gap-xs text-sm md:col-span-1">
          <span className="font-medium text-text-primary">Memo (optional)</span>
          <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-col gap-sm">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="px-sm py-xs text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Account
                </th>
                <th className="px-sm py-xs text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Description
                </th>
                <th className="px-sm py-xs text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Debit
                </th>
                <th className="px-sm py-xs text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Credit
                </th>
                <th className="px-sm py-xs" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-b border-border last:border-0">
                  <td className="px-sm py-xs align-top">
                    <select
                      className={inputClass}
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
                  <td className="px-sm py-xs align-top">
                    <input
                      className={inputClass}
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-sm py-xs align-top">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={cn(inputClass, 'text-right tabular-nums')}
                      value={line.debit}
                      onChange={(e) => updateLine(line.key, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
                    />
                  </td>
                  <td className="px-sm py-xs align-top">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={cn(inputClass, 'text-right tabular-nums')}
                      value={line.credit}
                      onChange={(e) => updateLine(line.key, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
                    />
                  </td>
                  <td className="px-sm py-xs align-top text-right">
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 2}
                      className="rounded-md p-xs text-text-secondary hover:bg-background hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button variant="ghost" type="button" className="self-start px-sm py-xs text-xs" onClick={addLine}>
          <Icon name="add" size={14} />
          Add Line
        </Button>
      </div>

      <div className="flex flex-col gap-xs rounded-md border border-border bg-background px-md py-sm text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Total Debits</span>
          <FinancialNumber value={totalDebit} format={formatCurrency} showFlash={false} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Total Credits</span>
          <FinancialNumber value={totalCredit} format={formatCurrency} showFlash={false} />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-xs font-medium">
          <span className={difference === 0 ? 'text-positive' : 'text-negative'}>
            {difference === 0 ? 'Balanced' : 'Out of balance'}
          </span>
          <FinancialNumber value={difference} format={formatCurrency} showFlash={false} />
        </div>
        {!validating && validation.errors.length > 0 && (
          <ul className="mt-xs list-disc pl-md text-xs text-danger">
            {validation.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Posting…' : 'Post Journal Entry'}
        </Button>
      </div>
    </div>
  );
}
