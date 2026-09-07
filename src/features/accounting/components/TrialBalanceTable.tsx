import { useNavigate } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { TableCell, TableRow } from '@/components/ui/shadcn/table';
import type { Account, AccountType } from '@/types';
import type { TrialBalanceRow } from '../services';
import { ACCOUNT_TYPES, accountTypeLabel } from '../types/account.types';
import { useAccountingUiStore } from '../store/accountingUiStore';

export interface TrialBalanceTableProps {
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number };
  /** Only used to resolve each row's master type for the category filter/column. */
  accountsById: Map<string, Account>;
}

/**
 * Renders journalEntryService.computeTrialBalance() — re-skinned onto v0's
 * DataTable with a totals footer row, no math happens here. Categories are
 * the 5 real SA-GAAP master types, not v0's 6 (it also splits out "Cost of
 * Sales") — see the M3 report.
 */
export function TrialBalanceTable({ rows, totals, accountsById }: TrialBalanceTableProps) {
  const navigate = useNavigate();
  const setSelectedLedgerAccountId = useAccountingUiStore((s) => s.setSelectedLedgerAccountId);
  const typeOf = (accountId: string): AccountType | undefined => accountsById.get(accountId)?.type;

  function openLedger(accountId: string) {
    setSelectedLedgerAccountId(accountId);
    navigate('/accounting/ledger');
  }

  const columns: DataTableColumn<TrialBalanceRow>[] = [
    {
      key: 'code',
      header: 'Account',
      headClassName: 'w-[7.5rem]',
      sortValue: (r) => r.code,
      cell: (r) => (
        <span className="figure inline-flex rounded-md bg-muted/70 px-2 py-0.5 text-sm font-semibold tabular-nums text-foreground">
          {r.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Description',
      sortValue: (r) => r.name,
      cell: (r) => (
        <RecordLink onClick={() => openLedger(r.accountId)} className="block max-w-[48ch] truncate text-sm font-medium">
          {r.name}
        </RecordLink>
      ),
    },
    {
      key: 'type',
      header: 'Category',
      headClassName: 'w-[10rem]',
      sortValue: (r) => typeOf(r.accountId) ?? '',
      hideBelowMd: true,
      cell: (r) => {
        const type = typeOf(r.accountId);
        return type ? (
          <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {accountTypeLabel(type)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      headClassName: 'w-[9rem] border-l border-border',
      cellClassName: 'border-l border-border',
      sortValue: (r) => r.debit,
      cell: (r) =>
        r.debit > 0 ? (
          <Amount value={r.debit} plain className="text-sm font-medium" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        ),
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      headClassName: 'w-[9rem]',
      sortValue: (r) => r.credit,
      cell: (r) =>
        r.credit > 0 ? (
          <Amount value={r.credit} plain className="text-sm font-medium" />
        ) : (
          <span className="text-xs text-muted-foreground">&mdash;</span>
        ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.accountId}
      searchable={(r) => [r.code, r.name].join(' ')}
      searchPlaceholder="Search account code or description"
      initialSortKey="code"
      initialSortDirection="asc"
      pageSize={25}
      filters={[
        {
          key: 'type',
          label: 'All categories',
          options: ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label })),
          match: (r, value) => typeOf(r.accountId) === value,
        },
      ]}
      emptyTitle="No accounts in the trial balance"
      emptyDescription="Adjust the search or category filter."
      caption="All amounts in rand"
      footerRow={
        <TableRow className="border-t-2 border-border bg-muted hover:bg-muted">
          <TableCell colSpan={2} className="px-4 py-4 text-xs font-bold tracking-[0.1em] text-foreground uppercase">
            Totals
          </TableCell>
          <TableCell className="hidden px-4 py-4 md:table-cell" />
          <TableCell className="border-l border-border px-4 py-4 text-right">
            <Amount value={totals.debit} plain className="text-base font-bold text-foreground" />
          </TableCell>
          <TableCell className="px-4 py-4 text-right">
            <Amount value={totals.credit} plain className="text-base font-bold text-foreground" />
          </TableCell>
        </TableRow>
      }
    />
  );
}
