import { useMemo } from 'react';
import type { Account } from '@/types';
import {
  RecordDetailSheet,
  RecordDetailSection,
  RecordDetailField,
} from '@/components/app/record-detail-sheet';
import { StatusBadge } from '@/components/app/status-badge';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { recordSheetClass } from '@/components/app/form-surface';
import { formatDate } from '@/lib/app/format';
import { useAccountLedger } from '../hooks/useAccountLedger';
import { accountTypeLabel } from '../types/account.types';

export interface AccountDetailSheetProps {
  account: Account | undefined;
  /** True when this account has posted ledger history (from useAccounts().postedAccountIds). */
  hasPostings: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only rendered when provided AND the account is editable. */
  onEdit?: () => void;
  /** Opens the General Ledger filtered to this account (explicit navigation — the
      old behaviour that used to fire on every row click). */
  onViewLedger: () => void;
}

/**
 * Account inspection sheet for the Chart of Accounts (docs/CURRENT_TASKS.md #6).
 *
 * Clicking an account row used to navigate straight to the General Ledger —
 * this keeps the user on the Chart of Accounts and opens a side sheet
 * instead, with an explicit "View ledger" action for when they actually
 * want to leave. Deep-linkable via `?record=<id>`.
 *
 * Current balance + recent activity come from
 * `journalEntryService.getAccountLedger()` (via useAccountLedger) — the same
 * running-balance the Ledger page renders, never recomputed here.
 */
export function AccountDetailSheet({
  account,
  hasPostings,
  open,
  onOpenChange,
  onEdit,
  onViewLedger,
}: AccountDetailSheetProps) {
  const { rows, loading, error } = useAccountLedger(open && account ? account.id : null);

  const currentBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : 0;
  const recentActivity = useMemo(() => rows.slice(-5).reverse(), [rows]);

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? `${account.code} — ${account.name}` : 'Account'}
      titleAdornment={account ? <StatusBadge status={account.isActive ? 'active' : 'inactive'} /> : undefined}
      state={account ? 'ready' : 'not-found'}
      notFoundMessage="This account could not be found — it may have been removed from the chart."
      className={recordSheetClass}
      actions={
        account ? (
          <>
            {onEdit ? (
              <Button size="sm" variant="outline" onClick={onEdit}>
                Edit
              </Button>
            ) : null}
            <Button size="sm" onClick={onViewLedger}>
              View ledger
            </Button>
          </>
        ) : undefined
      }
    >
      {account && (
        <div className="flex flex-col gap-6">
          <RecordDetailSection title="Account">
            <div className="grid grid-cols-2 gap-3">
              <RecordDetailField label="Code" value={<span className="font-mono">{account.code}</span>} />
              <RecordDetailField label="Status" value={account.isActive ? 'Active' : 'Inactive'} />
              <RecordDetailField label="Master type" value={accountTypeLabel(account.type)} />
              <RecordDetailField label="Financial-statement grouping" value={account.subType ?? accountTypeLabel(account.type)} />
              <RecordDetailField label="Normal balance" value={account.normalBalance === 'debit' ? 'Debit' : 'Credit'} />
              <RecordDetailField label="Ledger history" value={hasPostings ? 'Has postings' : 'No postings yet'} />
            </div>
            {account.description ? (
              <RecordDetailField label="Description" value={account.description} className="pt-1" />
            ) : null}
          </RecordDetailSection>

          <RecordDetailSection title="Balance">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading balance…</p>
            ) : error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : (
              <RecordDetailField
                label="Current balance"
                value={<Amount value={currentBalance} className="text-lg font-semibold" />}
              />
            )}
          </RecordDetailSection>

          {!loading && !error && (
            <RecordDetailSection title="Recent ledger activity">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing posted to this account yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {recentActivity.map((row, i) => (
                    <li key={`${row.entryId}_${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-muted-foreground">{row.entryNumber}</span>
                        <span className="truncate">{row.memo ?? '—'}</span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        <Amount value={row.debit > 0 ? row.debit : -row.credit} plain className="tabular-nums" />
                        <span className="text-xs text-muted-foreground">{formatDate(row.date)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={onViewLedger}
                className="self-start text-sm text-brand underline-offset-2 hover:underline"
              >
                View full ledger →
              </button>
            </RecordDetailSection>
          )}
        </div>
      )}
    </RecordDetailSheet>
  );
}
