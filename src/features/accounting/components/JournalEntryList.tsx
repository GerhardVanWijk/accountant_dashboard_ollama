import { useMemo, useState } from 'react';
import type { Account, ID, JournalEntry } from '@/types';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';

export interface JournalEntryListProps {
  entries: JournalEntry[];
  accounts: Account[];
  reversedByEntryId: Map<ID, ID>;
  onReverse: (entry: JournalEntry) => void;
  reversingEntryId: ID | null;
}

/**
 * Posted journal entries, newest first, each expandable to its debit/credit
 * lines. "Reversed" status is derived purely from `reversedByEntryId`
 * (does another entry point `reversalOfEntryId` at this one) — never from a
 * mutated field on the entry itself (docs/LEDGER_ARCHITECTURE.md).
 */
export function JournalEntryList({ entries, accounts, reversedByEntryId, onReverse, reversingEntryId }: JournalEntryListProps) {
  const [expanded, setExpanded] = useState<Set<ID>>(new Set());
  const accountLabel = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, `${a.code} — ${a.name}`]));
    return (id: ID) => map.get(id) ?? id;
  }, [accounts]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);

  function toggle(id: ID): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-sm">
      {sorted.map((entry) => {
        const total = entry.lines.reduce((sum, l) => sum + l.debit, 0);
        const reversalEntryId = reversedByEntryId.get(entry.id);
        const isReversal = Boolean(entry.reversalOfEntryId);
        const isOpen = expanded.has(entry.id);

        return (
          <div key={entry.id} className="rounded-lg border border-border bg-panel">
            <button
              type="button"
              onClick={() => toggle(entry.id)}
              className="grid w-full grid-cols-[100px_1fr_140px_120px_120px] items-center gap-sm px-md py-sm text-left"
            >
              <span className="font-mono text-sm font-semibold text-text-primary">{entry.entryNumber}</span>
              <span className="truncate text-sm text-text-secondary">{entry.memo ?? '—'}</span>
              <span className="text-xs text-text-muted">{new Date(entry.date).toLocaleDateString()}</span>
              <span className="text-right">
                <FinancialNumber value={total} format={formatCurrency} showFlash={false} />
              </span>
              <span className="flex justify-end">
                {reversalEntryId ? (
                  <StatusPill tone="muted">Reversed</StatusPill>
                ) : isReversal ? (
                  <StatusPill tone="info">Reversal</StatusPill>
                ) : (
                  <StatusPill tone="success">Posted</StatusPill>
                )}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-border px-md py-sm">
                <div className="mb-xs flex flex-wrap items-center justify-between gap-sm text-xs text-text-muted">
                  <span>Source: {entry.source}</span>
                  {entry.reversalOfEntryId && <span>Reverses entry {entry.reversalOfEntryId}</span>}
                  {reversalEntryId && <span>Reversed by entry {reversalEntryId}</span>}
                </div>

                <div className="grid grid-cols-[1fr_1fr_120px_120px] gap-2 tabular-nums text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  <FinancialTableCell type="label">Account</FinancialTableCell>
                  <FinancialTableCell type="label">Description</FinancialTableCell>
                  <FinancialTableCell type="number">Debit</FinancialTableCell>
                  <FinancialTableCell type="number">Credit</FinancialTableCell>
                </div>
                {entry.lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-[1fr_1fr_120px_120px] gap-2 tabular-nums text-sm">
                    <FinancialTableCell type="label" className="font-mono">
                      {accountLabel(line.accountId)}
                    </FinancialTableCell>
                    <FinancialTableCell type="label" className="text-text-secondary">
                      {line.description ?? '—'}
                    </FinancialTableCell>
                    <FinancialTableCell type="number">
                      {line.debit > 0 ? <FinancialNumber value={line.debit} format={formatCurrency} showFlash={false} /> : '—'}
                    </FinancialTableCell>
                    <FinancialTableCell type="number">
                      {line.credit > 0 ? <FinancialNumber value={line.credit} format={formatCurrency} showFlash={false} /> : '—'}
                    </FinancialTableCell>
                  </div>
                ))}

                <div className="mt-sm flex justify-end">
                  <Button
                    variant="ghost"
                    className="px-sm py-xs text-xs"
                    disabled={Boolean(reversalEntryId) || reversingEntryId === entry.id}
                    onClick={() => onReverse(entry)}
                  >
                    {reversingEntryId === entry.id
                      ? 'Reversing…'
                      : reversalEntryId
                        ? 'Already Reversed'
                        : 'Reverse Entry'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'success' | 'muted' | 'info'; children: string }) {
  const toneClass =
    tone === 'success' ? 'bg-success' : tone === 'info' ? 'bg-info' : 'bg-border text-text-secondary';
  return (
    <span className={cn('inline-flex items-center rounded-full px-sm py-xs text-xs font-medium text-on-accent', toneClass)}>
      <Icon name="journals" size={12} className="mr-1" />
      {children}
    </span>
  );
}
