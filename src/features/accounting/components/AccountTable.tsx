import { Fragment } from 'react';
import type { Account, ID } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { RecordLink } from '@/components/app/record-link';
import { buildAccountHierarchy } from '../utils/buildAccountHierarchy';

export interface AccountTableProps {
  accounts: Account[];
  postedAccountIds: Set<ID>;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
  /** Opens the Account detail sheet (docs/CURRENT_TASKS.md #6) — stays on this page. */
  onSelect: (account: Account) => void;
}

const HEAD_CLASS = 'px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase';

/**
 * Hierarchical Chart of Accounts listing. Built on the shared `Table`
 * primitives (same header/row/border chrome as every `DataTable` register in
 * the app) but kept a purpose-built table rather than `DataTable` itself —
 * `DataTable` is a flat sortable list with no concept of group-header rows,
 * and it would flatten away the real parent/child ordering
 * `buildAccountHierarchy()` provides (docs/DO_NOT_BREAK.md: don't degrade an
 * existing feature to fit a component). Grouping/ordering logic itself is
 * unchanged, still entirely inside buildAccountHierarchy().
 */
export function AccountTable({ accounts, postedAccountIds, onEdit, onToggleActive, onSelect }: AccountTableProps) {
  const groups = buildAccountHierarchy(accounts);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table className="min-w-[760px]">
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className={HEAD_CLASS}>Code</TableHead>
            <TableHead className={HEAD_CLASS}>Account name</TableHead>
            <TableHead className={HEAD_CLASS}>Normal balance</TableHead>
            <TableHead className={HEAD_CLASS}>Status</TableHead>
            <TableHead className={HEAD_CLASS}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.type}>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableCell
                  colSpan={5}
                  className="px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {group.label}
                </TableCell>
              </TableRow>
              {group.rows.map(({ account, depth }) => (
                <TableRow key={account.id} className="hover:bg-muted/20">
                  <TableCell className="figure px-4 py-3 text-sm tabular-nums text-foreground">{account.code}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    <div style={{ paddingLeft: depth * 16 }} className="flex flex-col">
                      <RecordLink onClick={() => onSelect(account)} className="text-sm font-medium">
                        {account.name}
                      </RecordLink>
                      {account.subType && <span className="text-xs text-muted-foreground">{account.subType}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground capitalize">
                    {account.normalBalance}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {account.isActive ? (
                        <Badge variant="outline" className="text-status-positive">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                      {postedAccountIds.has(account.id) && (
                        <Badge variant="outline" className="text-status-info">
                          Has postings
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(account)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onToggleActive(account)}>
                        {account.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
