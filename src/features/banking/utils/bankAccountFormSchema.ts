import { z } from 'zod';
import type { BankAccount } from '@/types';

export const bankAccountFormSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  bankName: z.string().min(1, 'Bank is required'),
  bankNameOther: z.string().optional(),
  accountNumber: z.string().min(1, 'Account number is required'),
  accountType: z.enum(['checking', 'savings', 'credit_card', 'cash', 'money_market', 'foreign_currency']),
  branchCode: z.string().optional(),
  swiftCode: z.string().optional(),
  currency: z.string().min(1, 'Currency is required'),
  openingBalance: z.coerce.number(),
  glAccountId: z.string().min(1, 'A linked GL account is required'),
  status: z.enum(['active', 'inactive']),
});

export type BankAccountFormSchema = z.infer<typeof bankAccountFormSchema>;

export function toDefaultValues(account?: BankAccount): BankAccountFormSchema {
  return {
    name: account?.name ?? '',
    bankName: account?.bankName ?? 'FNB',
    bankNameOther: '',
    accountNumber: account?.accountNumber ?? '',
    accountType: account?.accountType ?? 'checking',
    branchCode: account?.branchCode ?? '',
    swiftCode: account?.swiftCode ?? '',
    currency: account?.currency ?? 'ZAR',
    openingBalance: account?.openingBalance ?? 0,
    glAccountId: account?.glAccountId ?? '',
    status: account?.status ?? 'active',
  };
}
