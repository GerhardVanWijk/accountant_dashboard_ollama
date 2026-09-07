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
import { cn } from '@/lib/utils';
import { buildAccountHierarchy } from '../utils/buildAccountHierarchy';

export interface AccountTableProps {
  accounts: Account[];
  postedAccountIds: Set<ID>;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
  /** Opens the Account detail sheet (docs/CURRENT_TASKS.md #6) — stays on this page. */
  onSelect: (account: Account) => void;
}

const HEAD_CLASS = 'h-11 px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase';

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
      <Table className="min-w-[820px]">
        {/*
         * Fixed proportions so Account name keeps the visual room on wide
         * screens and the other columns don't open an empty band between
         * name and normal balance (docs — CoA visual refinement §5/§9).
         */}
        <colgroup>
          <col className="w-[92px]" />
          <col />
          <col className="w-[132px]" />
          <col className="w-[172px]" />
          <col className="w-[152px]" />
        </colgroup>
        <TableHeader className="bg-muted/60">
          <TableRow className="border-b-2 border-border hover:bg-transparent">
            <TableHead className={HEAD_CLASS}>Code</TableHead>
            <TableHead className={HEAD_CLASS}>Account name</TableHead>
            <TableHead className={HEAD_CLASS}>Normal balance</TableHead>
            <TableHead className={HEAD_CLASS}>Status</TableHead>
            <TableHead className={cn(HEAD_CLASS, 'text-right')}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.type}>
              <TableRow className="border-y-2 border-border bg-muted hover:bg-muted">
                <TableCell colSpan={5} className="border-l-2 border-l-brand px-4 py-2.5">
                  <span className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-foreground uppercase">
                    {group.label}
                    <span className="figure rounded bg-background px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
                      {group.rows.length}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
              {group.rows.map(({ account, depth }, i) => (
                <TableRow
                  key={account.id}
                  className={cn('transition-colors hover:bg-muted/40', i % 2 === 1 && 'bg-muted/25')}
                >
                  <TableCell className="px-4 py-3 align-top">
                    <span className="figure inline-flex rounded-md bg-muted/70 px-2 py-0.5 text-sm font-semibold tabular-nums text-foreground">
                      {account.code}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    <div style={{ paddingLeft: depth * 16 }} className="flex flex-col gap-0.5">
                      <RecordLink onClick={() => onSelect(account)} className="text-sm font-medium">
                        {account.name}
                      </RecordLink>
                      {account.subType && <span className="text-xs text-muted-foreground">{account.subType}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 align-top">
                    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {account.normalBalance}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {account.isActive ? (
                        <Badge className="bg-status-positive-muted text-status-positive">Active</Badge>
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
                  <TableCell className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center justify-end gap-1">
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
