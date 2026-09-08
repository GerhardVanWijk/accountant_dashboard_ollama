import type { Account, AccountType } from '@/types';
import { accountService } from '@/features/accounting/services';
import type { ImportAdapter, ImportExecuteOptions, ImportExecutionSummary, ImportFieldDef, ImportRowOutcome, ImportRowResult, RowMessage } from '../types';
import { asBoolean, asString, requireField } from '../normalize';

export interface ChartOfAccountsImportRow {
  code: string;
  name: string;
  type: AccountType;
  subType?: string;
  parentCode?: string;
  description?: string;
  active: boolean;
}

export interface ChartOfAccountsImportContext {
  existingByCode: Map<string, Account>;
}

export const CHART_OF_ACCOUNTS_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'code', label: 'Account Code', required: true, type: 'string', aliases: ['Account No', 'Account Number', 'Code', 'Acc No', 'Acc Code'] },
  { key: 'name', label: 'Account Name', required: true, type: 'string', aliases: ['Account Description', 'Description', 'Name'] },
  { key: 'type', label: 'Account Type', required: true, type: 'string', aliases: ['Type', 'Category Type', 'Account Class'] },
  { key: 'subType', label: 'Category', type: 'string', aliases: ['Sub Type', 'Account Category', 'Class'] },
  { key: 'parentCode', label: 'Parent Account', type: 'string', aliases: ['Parent Account Code', 'Parent Code', 'Parent'] },
  { key: 'description', label: 'Notes', type: 'string', aliases: ['Notes', 'Comment'] },
  { key: 'active', label: 'Active', type: 'boolean', aliases: ['Status', 'Is Active'] },
];

/** Normalizes a free-text account-type token to the real `AccountType` union — exact/synonym match only, never a guess (Part 14: "invalid type/category" must be caught, not silently coerced). */
function normalizeAccountType(raw: string): AccountType | undefined {
  const token = raw.trim().toLowerCase();
  const table: Record<string, AccountType> = {
    asset: 'asset', assets: 'asset',
    liability: 'liability', liabilities: 'liability',
    equity: 'equity',
    revenue: 'revenue', income: 'revenue', sales: 'revenue',
    expense: 'expense', expenses: 'expense', cost: 'expense',
  };
  return table[token];
}

function normalBalanceFor(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

function normalizeRow(
  raw: Record<string, string | number | boolean | Date | undefined>,
  _rowNumber: number,
  _ctx: ChartOfAccountsImportContext,
): { normalized?: ChartOfAccountsImportRow; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const code = asString(raw.code);
  const name = asString(raw.name);
  const typeRaw = asString(raw.type);
  requireField(code, 'code', 'Account Code', messages);
  requireField(name, 'name', 'Account Name', messages);
  requireField(typeRaw, 'type', 'Account Type', messages);

  let type: AccountType | undefined;
  if (typeRaw) {
    type = normalizeAccountType(typeRaw);
    if (!type) messages.push({ field: 'type', message: `Account Type "${typeRaw}" is not recognized (expected Asset, Liability, Equity, Revenue or Expense).`, severity: 'error' });
  }

  const parentCode = asString(raw.parentCode);
  if (parentCode && code && parentCode.trim().toLowerCase() === code.trim().toLowerCase()) {
    messages.push({ field: 'parentCode', message: 'An account cannot be its own parent.', severity: 'error' });
  }

  if (messages.some((m) => m.severity === 'error') || !code || !name || !type) return { messages };

  return {
    normalized: {
      code,
      name,
      type,
      subType: asString(raw.subType),
      parentCode,
      description: asString(raw.description),
      active: asBoolean(raw.active) ?? true,
    },
    messages,
  };
}

function detectDuplicates(rows: ImportRowResult<ChartOfAccountsImportRow>[], ctx: ChartOfAccountsImportContext): ImportRowResult<ChartOfAccountsImportRow>[] {
  const seenInFile = new Set<string>();
  return rows.map((row) => {
    if (!row.normalized || row.severity === 'error') return row;
    const code = row.normalized.code.trim().toLowerCase();
    if (seenInFile.has(code)) {
      // Two rows claiming the same account code is a contradiction of master data, not a legitimate scenario — always an error (mirrors the existing Product-import rule, docs/IMPORT_EXPORT_ARCHITECTURE.md §6).
      return { ...row, severity: 'error', messages: [...row.messages, { field: 'code', message: `Account code "${row.normalized.code}" appears more than once in this file.`, severity: 'error' }] };
    }
    seenInFile.add(code);
    if (ctx.existingByCode.has(code)) {
      return { ...row, severity: 'duplicate', messages: [...row.messages, { field: 'code', message: `Account code "${row.normalized.code}" already exists.`, severity: 'warning' }] };
    }
    return row;
  });
}

/** Detects a parent-account cycle across the whole batch + existing chart before any write happens. */
function findCircularParent(code: string, parentByCode: Map<string, string | undefined>, seen: Set<string> = new Set()): boolean {
  if (seen.has(code)) return true;
  seen.add(code);
  const parent = parentByCode.get(code);
  if (!parent) return false;
  return findCircularParent(parent, parentByCode, seen);
}

async function execute(rows: ImportRowResult<ChartOfAccountsImportRow>[], ctx: ChartOfAccountsImportContext, options: ImportExecuteOptions): Promise<ImportExecutionSummary> {
  const outcomes: ImportRowOutcome[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  // Circular-parent check across the whole batch (Part 14) before any write.
  const parentByCode = new Map<string, string | undefined>();
  for (const row of rows) {
    if (row.normalized) parentByCode.set(row.normalized.code.trim().toLowerCase(), row.normalized.parentCode?.trim().toLowerCase());
  }
  for (const [code] of parentByCode) {
    if (findCircularParent(code, parentByCode)) {
      return {
        rowsRead: rows.length,
        imported: 0,
        updated: 0,
        skipped: 0,
        errored: rows.length,
        rows: rows.map((r) => ({ rowNumber: r.rowNumber, outcome: 'error', message: `Circular parent-account hierarchy detected (via "${code}") — fix the Parent Account column and re-import.` })),
      };
    }
  }

  const codeToId = new Map<string, string>([...ctx.existingByCode.entries()].map(([code, account]) => [code, account.id]));
  const rowsToLinkParent: { code: string; parentCode: string }[] = [];

  for (const row of rows) {
    if (row.severity === 'skipped') {
      skipped++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'skipped' });
      continue;
    }
    if (row.severity === 'error' || !row.normalized) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: row.messages.find((m) => m.severity === 'error')?.message ?? 'Invalid row.' });
      continue;
    }
    const r = row.normalized;

    if (row.severity === 'duplicate') {
      if (options.duplicateStrategy === 'skip') {
        skipped++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'skipped', message: 'Already exists.' });
        continue;
      }
      if (options.duplicateStrategy === 'error') {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: 'Already exists.' });
        continue;
      }
      const existing = ctx.existingByCode.get(r.code.trim().toLowerCase());
      if (!existing) {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: 'Could not resolve which existing account to update.' });
        continue;
      }
      try {
        // Never changes `type`/`normalBalance` on an account with posted history — only non-accounting metadata (Part 14: "do not overwrite accounting history"). An account's type is immutable once anything has posted to it.
        const hasPostings = await accountService.hasPostings(existing.id);
        const patch: Partial<Account> = { name: r.name, subType: r.subType ?? existing.subType, description: r.description ?? existing.description, isActive: r.active };
        if (!hasPostings) patch.type = r.type;
        else if (r.type !== existing.type) {
          row.messages.push({ field: 'type', message: `Account "${r.code}" has posted history — its type was left unchanged.`, severity: 'warning' });
        }
        await accountService.updateAccount(existing.id, patch);
        updated++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'updated', recordRef: r.code });
        if (r.parentCode) rowsToLinkParent.push({ code: r.code, parentCode: r.parentCode });
      } catch (err) {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to update account.' });
      }
      continue;
    }

    try {
      const created = await accountService.createAccount({
        code: r.code,
        name: r.name,
        type: r.type,
        subType: r.subType,
        normalBalance: normalBalanceFor(r.type),
        isActive: r.active,
        description: r.description,
      });
      codeToId.set(r.code.trim().toLowerCase(), created.id);
      imported++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'imported', recordRef: r.code });
      if (r.parentCode) rowsToLinkParent.push({ code: r.code, parentCode: r.parentCode });
    } catch (err) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to create account.' });
    }
  }

  // Second pass: link parents now that every code in this batch has a real id.
  for (const link of rowsToLinkParent) {
    const childId = codeToId.get(link.code.trim().toLowerCase());
    const parentId = codeToId.get(link.parentCode.trim().toLowerCase());
    if (childId && parentId) {
      try {
        await accountService.updateAccount(childId, { parentAccountId: parentId });
      } catch {
        // Non-fatal — the account itself was created/updated successfully; only the parent link failed.
      }
    }
  }

  return { rowsRead: rows.length, imported, updated, skipped, errored, rows: outcomes };
}

/**
 * Chart of Accounts import — creates/updates the accounting-structural
 * chart itself. Never posts to the GL. An account with posted ledger
 * history keeps its `type`/`normalBalance` no matter what the file says
 * (Part 14: "do not overwrite accounting history") — only name/category/
 * description/active status can change on such an account.
 */
export const chartOfAccountsImportAdapter: ImportAdapter<ChartOfAccountsImportRow, ChartOfAccountsImportContext> = {
  id: 'chart_of_accounts',
  label: 'Chart of Accounts',
  description: 'Create or update General Ledger accounts — code, name, type, category and parent.',
  permission: { feature: 'data_migration', action: 'import' },
  fields: CHART_OF_ACCOUNTS_IMPORT_FIELDS,
  async loadContext() {
    const accounts = await accountService.getAccounts();
    return { existingByCode: new Map(accounts.map((a) => [a.code.trim().toLowerCase(), a])) };
  },
  normalizeRow,
  detectDuplicates,
  execute,
};
