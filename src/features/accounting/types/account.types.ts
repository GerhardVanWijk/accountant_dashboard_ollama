import type { AccountType } from '@/types';

/** Display order + human labels for the 5 master account types (SA GAAP order). */
export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'asset', label: 'Assets' },
  { value: 'liability', label: 'Liabilities' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expenses' },
];

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export interface AccountFilters {
  search: string;
  type: AccountType | 'all';
  status: 'all' | 'active' | 'inactive';
}

export const defaultAccountFilters: AccountFilters = {
  search: '',
  type: 'all',
  status: 'all',
};
