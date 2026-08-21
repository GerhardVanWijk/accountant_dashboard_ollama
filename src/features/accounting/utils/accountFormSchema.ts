import { z } from 'zod';
import type { Account } from '@/types';

/**
 * Chart of Accounts create/edit form schema. Business validation only —
 * the deeper invariants (an account with postings can't be hard-deleted,
 * etc.) live in AccountService, not here.
 */
export const accountFormSchema = z.object({
  code: z.string().trim().min(1, 'Account code is required.'),
  name: z.string().trim().min(1, 'Account name is required.'),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  subType: z.string().trim().optional(),
  parentAccountId: z.string().optional(),
  normalBalance: z.enum(['debit', 'credit']),
  isActive: z.boolean(),
  description: z.string().trim().optional(),
});

export type AccountFormSchema = z.infer<typeof accountFormSchema>;

/** The account type -> conventional normal balance side, used to pre-fill the form. */
export const DEFAULT_NORMAL_BALANCE: Record<AccountFormSchema['type'], AccountFormSchema['normalBalance']> = {
  asset: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
  expense: 'debit',
};

export function toDefaultValues(account?: Account): AccountFormSchema {
  return {
    code: account?.code ?? '',
    name: account?.name ?? '',
    type: account?.type ?? 'asset',
    subType: account?.subType ?? '',
    parentAccountId: account?.parentAccountId ?? '',
    normalBalance: account?.normalBalance ?? 'debit',
    isActive: account?.isActive ?? true,
    description: account?.description ?? '',
  };
}

/** Maps form values to the DTO shape the service layer expects, dropping blank optionals. */
export function mapFormValuesToAccountPatch(values: AccountFormSchema): Omit<Account, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    type: values.type,
    subType: values.subType?.trim() || undefined,
    parentAccountId: values.parentAccountId || undefined,
    normalBalance: values.normalBalance,
    isActive: values.isActive,
    description: values.description?.trim() || undefined,
  };
}
