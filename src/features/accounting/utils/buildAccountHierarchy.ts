import type { Account, AccountType, ID } from '@/types';
import { ACCOUNT_TYPES } from '../types/account.types';

export interface AccountHierarchyRow {
  account: Account;
  depth: number;
}

export interface AccountHierarchyGroup {
  type: AccountType;
  label: string;
  rows: AccountHierarchyRow[];
}

/**
 * Groups accounts by master type (Assets/Liabilities/Equity/Revenue/
 * Expenses, in that order) and orders each group parent-before-children
 * via `parentAccountId`, carrying a `depth` for indentation. Pure/display
 * logic only — kept out of JSX per docs/DO_NOT_BREAK.md.
 */
export function buildAccountHierarchy(accounts: Account[]): AccountHierarchyGroup[] {
  return ACCOUNT_TYPES.map(({ value, label }) => {
    const inGroup = accounts.filter((a) => a.type === value);
    return { type: value, label, rows: orderByParent(inGroup) };
  }).filter((group) => group.rows.length > 0);
}

function orderByParent(accounts: Account[]): AccountHierarchyRow[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const childrenOf = new Map<ID | undefined, Account[]>();
  for (const account of accounts) {
    const parentId = account.parentAccountId && byId.has(account.parentAccountId) ? account.parentAccountId : undefined;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(account);
    childrenOf.set(parentId, siblings);
  }
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.code.localeCompare(b.code));
  }

  const rows: AccountHierarchyRow[] = [];
  const visited = new Set<ID>();

  function visit(parentId: ID | undefined, depth: number): void {
    for (const account of childrenOf.get(parentId) ?? []) {
      if (visited.has(account.id)) continue; // defensive: never loop on a cyclic parent chain
      visited.add(account.id);
      rows.push({ account, depth });
      visit(account.id, depth + 1);
    }
  }

  visit(undefined, 0);
  return rows;
}
