import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { TableCell, TableRow } from '@/components/ui/shadcn/table';
import type { Account, AccountType } from '@/types';
import type { TrialBalanceRow } from '../services';
import { ACCOUNT_TYPES, accountTypeLabel } from '../types/account.types';

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
  const typeOf = (accountId: string): AccountType | undefined => accountsById.get(accountId)?.type;

  const columns: DataTableColumn<TrialBalanceRow>[] = [
    {
      key: 'code',
      header: 'Account',
      sortValue: (r) => r.code,
      cell: (r) => <span className="figure font-medium text-foreground tabular-nums">{r.code}</span>,
    },
    {
      key: 'name',
      header: 'Description',
      sortValue: (r) => r.name,
      cell: (r) => r.name,
    },
    {
      key: 'type',
      header: 'Category',
      sortValue: (r) => typeOf(r.accountId) ?? '',
      hideBelowMd: true,
      cell: (r) => {
        const type = typeOf(r.accountId);
        return <span className="text-xs text-muted-foreground">{type ? accountTypeLabel(type) : '—'}</span>;
      },
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      sortValue: (r) => r.debit,
      cell: (r) =>
        r.debit > 0 ? <Amount value={r.debit} plain className="text-sm" /> : <span className="text-xs text-muted-foreground">&mdash;</span>,
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      sortValue: (r) => r.credit,
      cell: (r) =>
        r.credit > 0 ? <Amount value={r.credit} plain className="text-sm" /> : <span className="text-xs text-muted-foreground">&mdash;</span>,
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
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2} className="px-4 py-3 text-xs font-medium tracking-wide uppercase">
            Totals
          </TableCell>
          <TableCell className="hidden px-4 py-3 md:table-cell" />
          <TableCell className="px-4 py-3 text-right">
            <Amount value={totals.debit} plain className="font-semibold" />
          </TableCell>
          <TableCell className="px-4 py-3 text-right">
            <Amount value={totals.credit} plain className="font-semibold" />
          </TableCell>
        </TableRow>
      }
    />
  );
}
