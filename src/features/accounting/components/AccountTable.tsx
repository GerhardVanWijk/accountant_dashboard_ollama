import { Fragment } from 'react';
import type { Account, ID } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { buildAccountHierarchy } from '../utils/buildAccountHierarchy';

export interface AccountTableProps {
  accounts: Account[];
  postedAccountIds: Set<ID>;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
}

/**
 * Hierarchical Chart of Accounts listing, re-skinned onto v0's table/badge
 * tokens. Kept as a purpose-built table rather than the shared v0
 * `DataTable` — DataTable is a flat sortable list with no concept of
 * group-header rows, and it would flatten away the real parent/child
 * ordering `buildAccountHierarchy()` provides (docs/DO_NOT_BREAK.md: don't
 * degrade an existing feature to fit a component). Grouping/ordering logic
 * itself is unchanged, still entirely inside buildAccountHierarchy().
 */
export function AccountTable({ accounts, postedAccountIds, onEdit, onToggleActive }: AccountTableProps) {
  const groups = buildAccountHierarchy(accounts);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Code
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Account name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Normal balance
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.type}>
              <tr className="border-b border-border bg-muted/20">
                <td colSpan={5} className="px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </td>
              </tr>
              {group.rows.map(({ account, depth }) => (
                <tr key={account.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="figure px-4 py-3 align-top text-sm tabular-nums text-foreground">{account.code}</td>
                  <td className="px-4 py-3 align-top">
                    <div style={{ paddingLeft: depth * 16 }} className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{account.name}</span>
                      {account.subType && <span className="text-xs text-muted-foreground">{account.subType}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-muted-foreground capitalize">
                    {account.normalBalance}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {account.isActive ? (
                        <Badge variant="outline" className="text-positive">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                      {postedAccountIds.has(account.id) && (
                        <Badge variant="outline" className="text-info">
                          Has postings
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(account)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onToggleActive(account)}>
                        {account.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
