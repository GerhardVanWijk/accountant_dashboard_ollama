import { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Loader2, Network, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { StatStrip, StatTile } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { formatCurrency } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountLedger } from '../hooks/useAccountLedger';
import { useJournalEntries } from '../hooks/useJournalEntries';
import { LedgerTable } from '../components/LedgerTable';
import { useAccountingUiStore } from '../store/accountingUiStore';
import { buildAccountLedgerRows, buildLedgerRows } from '../utils/buildLedgerRows';

/**
 * General Ledger — route `/accounting/ledger` (docs/ROUTES.md). Defaults to
 * v0's flat "every posted line, newest first" view, built by
 * buildLedgerRows() joining the real useJournalEntries()/useAccounts() data
 * — no ledger math happens in this page. Narrowing the account selector to
 * one account swaps the data source to the real per-account running ledger
 * (useAccountLedger(), i.e. JournalEntryService.getAccountLedger()) so the
 * existing running-balance drill-down this app already had isn't lost —
 * see the M3 report for why v0's own flat GL page doesn't have an
 * equivalent.
 */
export function LedgerPage() {
  const { accounts, loading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useAccounts();
  const selectedAccountId = useAccountingUiStore((s) => s.selectedLedgerAccountId);
  const setSelectedAccountId = useAccountingUiStore((s) => s.setSelectedLedgerAccountId);

  const { entries, loading: entriesLoading, error: entriesError, refetch: refetchEntries } = useJournalEntries();
  const { account: selectedAccount, rows: accountLedgerRows, loading: accountLedgerLoading, error: accountLedgerError, refetch: refetchAccountLedger } =
    useAccountLedger(selectedAccountId);

  const loading = accountsLoading || entriesLoading || (Boolean(selectedAccountId) && accountLedgerLoading);
  const error = accountsError ?? entriesError ?? accountLedgerError;

  const rows = useMemo(() => {
    if (selectedAccountId && selectedAccount) {
      return buildAccountLedgerRows(selectedAccount, accountLedgerRows);
    }
    return buildLedgerRows(entries, accounts);
  }, [selectedAccountId, selectedAccount, accountLedgerRows, entries, accounts]);

  const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);
  const accountsTouched = new Set(rows.map((r) => r.accountId)).size;

  function refetch(): void {
    void refetchAccounts();
    void refetchEntries();
    void refetchAccountLedger();
  }

  return (
    <>
      <PageHeader
        title="General ledger"
        description="Every posted line, traceable back to the journal that created it. Narrow to one account to see its running balance."
      />

      <StatStrip columns={3}>
        <StatTile
          icon={ArrowDownLeft}
          label="Debits posted"
          value={formatCurrency(totalDebit)}
          hint={`${rows.length} lines in view`}
          tone="info"
        />
        <StatTile
          icon={ArrowUpRight}
          label="Credits posted"
          value={formatCurrency(totalCredit)}
          hint="Across the same lines"
          tone="info"
        />
        <StatTile
          icon={Network}
          label="Accounts touched"
          value={String(accountsTouched)}
          hint={selectedAccountId ? 'Narrowed to one account' : 'Distinct ledger accounts'}
        />
      </StatStrip>

      <div
        className={cn(
          'flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm',
          selectedAccount
            ? 'border-brand-outline bg-brand-muted/50'
            : 'border-border bg-muted/40',
        )}
      >
        <Wallet className={cn('size-4 shrink-0', selectedAccount ? 'text-brand' : 'text-muted-foreground')} aria-hidden="true" />
        {selectedAccount ? (
          <p className="min-w-0">
            <span className="font-semibold text-foreground">
              <span className="figure tabular-nums">{selectedAccount.code}</span> · {selectedAccount.name}
            </span>{' '}
            <span className="text-muted-foreground">— Account balance is a running balance for this account.</span>
          </p>
        ) : (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">All accounts</span> — cross-account view. Narrow to one
            account for a running balance.
          </p>
        )}
      </div>

      {loading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading general ledger…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && (
        <LedgerTable
          rows={rows}
          singleAccount={Boolean(selectedAccount)}
          toolbarLeading={
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Account
              </span>
              <Select
                items={[{ value: 'all', label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))]}
                value={selectedAccountId ?? 'all'}
                onValueChange={(value) => setSelectedAccountId(value === 'all' ? null : String(value))}
              >
                <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-64" aria-label="Ledger account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          }
        />
      )}
    </>
  );
}
