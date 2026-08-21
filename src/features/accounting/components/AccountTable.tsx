import { Fragment } from 'react';
import type { Account, ID } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { buildAccountHierarchy } from '../utils/buildAccountHierarchy';

export interface AccountTableProps {
  accounts: Account[];
  postedAccountIds: Set<ID>;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
}

/**
 * Hierarchical Chart of Accounts listing: grouped by master type (Assets/
 * Liabilities/Equity/Revenue/Expenses), sub-accounts indented under their
 * `parentAccountId`. Grouping/ordering logic lives in
 * buildAccountHierarchy(), not inline here.
 */
export function AccountTable({ accounts, postedAccountIds, onEdit, onToggleActive }: AccountTableProps) {
  const groups = buildAccountHierarchy(accounts);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-background">
            <th className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Code
            </th>
            <th className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Account Name
            </th>
            <th className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Normal Balance
            </th>
            <th className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Status
            </th>
            <th className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.type}>
              <tr className="border-b border-border bg-background/60">
                <td colSpan={5} className="px-md py-xs text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {group.label}
                </td>
              </tr>
              {group.rows.map(({ account, depth }) => (
                <tr key={account.id} className="border-b border-border last:border-0 hover:bg-background">
                  <td className="px-md py-sm align-top font-mono text-sm text-text-primary">{account.code}</td>
                  <td className="px-md py-sm align-top">
                    <div style={{ paddingLeft: depth * 16 }} className="flex flex-col">
                      <span className="text-sm font-medium text-text-primary">{account.name}</span>
                      {account.subType && <span className="text-xs text-text-muted">{account.subType}</span>}
                    </div>
                  </td>
                  <td className="px-md py-sm align-top text-sm capitalize text-text-secondary">
                    {account.normalBalance}
                  </td>
                  <td className="px-md py-sm align-top">
                    <div className="flex flex-wrap items-center gap-xs">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-sm py-xs text-xs font-medium text-on-accent',
                          account.isActive ? 'bg-success' : 'bg-border text-text-secondary',
                        )}
                      >
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {postedAccountIds.has(account.id) && (
                        <span className="inline-flex items-center rounded-full bg-info px-sm py-xs text-xs font-medium text-on-accent">
                          Has Postings
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-md py-sm align-top">
                    <div className="flex flex-wrap items-center gap-xs">
                      <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onEdit(account)}>
                        Edit
                      </Button>
                      <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onToggleActive(account)}>
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
