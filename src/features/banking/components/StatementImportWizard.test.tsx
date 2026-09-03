import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { BankAccount } from '@/types';
import type { ParsedStatement } from '../types';
import type { StatementImportPreview } from '../services';

const { previewImport, confirmImport } = vi.hoisted(() => ({
  previewImport: vi.fn(),
  confirmImport: vi.fn(),
}));

vi.mock('../services', () => ({
  statementImportService: { previewImport, confirmImport },
}));
vi.mock('@/features/accounting/services', () => ({ SYSTEM_USER_ID: 'system' }));
vi.mock('@/components/ui/shadcn/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { StatementImportWizard } from './StatementImportWizard';

const account: BankAccount = {
  id: 'ba1',
  name: 'FNB Cheque',
  bankName: 'FNB',
  accountNumber: '123',
  accountType: 'checking',
  currency: 'ZAR',
  glAccountId: 'gl1',
  openingBalance: 0,
  currentBalance: 0,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const parsed: ParsedStatement = {
  lines: [
    { sourceRowId: 'r1', date: '2026-08-05T00:00:00.000Z', description: 'Customer payment', reference: 'INV-1', amount: 100, direction: 'debit', raw: {} },
    { sourceRowId: 'r2', date: '2026-08-06T00:00:00.000Z', description: 'Bank fee', amount: 25, direction: 'credit', raw: {} },
  ],
  openingBalance: 1000,
  closingBalance: 1075,
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-08-31T00:00:00.000Z',
  format: 'csv',
  parseErrors: [{ rowIndex: 3, raw: 'garbage,row', reason: 'unparseable amount' }],
};

function makePreview(overrides: Partial<StatementImportPreview> = {}): StatementImportPreview {
  return {
    bankAccountId: 'ba1',
    fileName: 'aug.csv',
    format: 'csv',
    parsed,
    contentHash: 'a'.repeat(64),
    balanceCheck: { ok: true, expectedClosing: 1075, impliedClosing: 1075, delta: 0 },
    ...overrides,
  };
}

function renderWizard(props: Partial<React.ComponentProps<typeof StatementImportWizard>> = {}) {
  const onImported = vi.fn();
  const onReconcile = vi.fn();
  const onClose = vi.fn();
  render(
    <StatementImportWizard
      bankAccounts={[account]}
      defaultBankAccountId="ba1"
      onImported={onImported}
      onReconcile={onReconcile}
      onClose={onClose}
      {...props}
    />,
  );
  return { onImported, onReconcile, onClose };
}

/** jsdom's File in this env lacks Blob#text(); the parser content is irrelevant here (the service is mocked). */
function makeFile(name = 'aug.csv', content = 'Date,Description,Amount\n'): File {
  const f = new File([content], name, { type: 'text/csv' });
  if (typeof f.text !== 'function') {
    Object.defineProperty(f, 'text', { value: async () => content });
  }
  return f;
}

async function uploadAndPreview() {
  const input = screen.getByLabelText(/choose a statement file/i);
  fireEvent.change(input, { target: { files: [makeFile()] } });
  await waitFor(() => expect(screen.getByRole('button', { name: /import statement/i })).toBeInTheDocument());
}

beforeEach(() => {
  previewImport.mockReset();
  confirmImport.mockReset();
});

describe('StatementImportWizard', () => {
  it('step 1–2: pre-selects the target account and offers a format override', () => {
    renderWizard();
    expect(screen.getByLabelText(/bank account/i)).toHaveTextContent('FNB Cheque');
    expect(screen.getByLabelText(/statement format override/i)).toBeInTheDocument();
    expect(screen.getByText(/reconciling it against your books is the next step/i)).toBeInTheDocument();
  });

  it('step 3: preview shows period, opening/closing, and line count', async () => {
    previewImport.mockResolvedValue(makePreview());
    renderWizard();
    await uploadAndPreview();

    expect(previewImport).toHaveBeenCalledWith('ba1', 'aug.csv', expect.any(String), undefined);
    expect(screen.getByText('01 Aug 2026 – 31 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Opening balance').parentElement).toHaveTextContent(/1\D?000\D?00/);
    expect(screen.getByText('Closing balance')).toBeInTheDocument();
    expect(screen.getByText('Lines').parentElement).toHaveTextContent('2');
    // read-only line list, no per-line checkboxes
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Money (in|out)/)).toHaveLength(2);
  });

  it('step 3: parse issues render as a collapsible skip list', async () => {
    previewImport.mockResolvedValue(makePreview());
    renderWizard();
    await uploadAndPreview();

    const toggle = screen.getByRole('button', { name: /1 row could not be read and will be skipped/i });
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText(/unparseable amount/i)).toBeInTheDocument();
    expect(screen.getByText('garbage,row')).toBeInTheDocument();
  });

  it('step 3: a passing balance check shows the green confirmation and does not block Confirm', async () => {
    previewImport.mockResolvedValue(makePreview());
    renderWizard();
    await uploadAndPreview();
    expect(screen.getByText(/opening \+ movement = closing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import statement$/i })).not.toBeDisabled();
  });

  it('step 3: a failing balance check warns but does NOT disable Confirm', async () => {
    previewImport.mockResolvedValue(
      makePreview({ balanceCheck: { ok: false, expectedClosing: 1075, impliedClosing: 975, delta: -100 } }),
    );
    renderWizard();
    await uploadAndPreview();

    expect(screen.getByText(/statement integrity warning/i)).toBeInTheDocument();
    expect(screen.getByText(/does not indicate an error in your books/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import statement$/i })).not.toBeDisabled();
  });

  it('step 3: a neutral balance check (no balances in file) renders the neutral note', async () => {
    previewImport.mockResolvedValue(
      makePreview({
        parsed: { ...parsed, openingBalance: undefined, closingBalance: undefined },
        balanceCheck: { ok: null },
      }),
    );
    renderWizard();
    await uploadAndPreview();
    expect(screen.getByText(/did not include balances to verify against/i)).toBeInTheDocument();
    expect(screen.getAllByText('not in file').length).toBeGreaterThanOrEqual(2);
  });

  it('step 3: a duplicate shows an amber banner and gates Confirm behind "Import anyway"', async () => {
    previewImport.mockResolvedValue(
      makePreview({
        duplicateOf: {
          id: 'stmt-old',
          sourceFilename: 'july.csv',
          importedAt: '2026-07-31T00:00:00.000Z',
        } as StatementImportPreview['duplicateOf'],
      }),
    );
    confirmImport.mockResolvedValue({ statement: { id: 'stmt-new', lineCount: 2 }, lineCount: 2 });
    renderWizard();
    await uploadAndPreview();

    expect(screen.getByText(/looks identical to one imported on/i)).toHaveTextContent('july.csv');
    const confirm = screen.getByRole('button', { name: /^import statement$/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/import anyway/i));
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByText(/statement imported/i)).toBeInTheDocument());
    expect(confirmImport).toHaveBeenCalledWith('ba1', expect.anything(), 'system', { allowDuplicate: true });
  });

  it('step 4→5: Confirm imports and the done step shows the line count and both actions', async () => {
    previewImport.mockResolvedValue(makePreview());
    confirmImport.mockResolvedValue({ statement: { id: 'stmt-new', lineCount: 2 }, lineCount: 2 });
    const { onImported, onReconcile } = renderWizard();
    await uploadAndPreview();

    fireEvent.click(screen.getByRole('button', { name: /^import statement$/i }));
    await waitFor(() => expect(screen.getByText(/statement imported — 2 lines/i)).toBeInTheDocument());

    expect(screen.getByText(/nothing has been posted to your general ledger/i)).toBeInTheDocument();
    const reconcile = screen.getByRole('button', { name: /reconcile now/i });
    const close = screen.getByRole('button', { name: /^close$/i });
    expect(reconcile).toBeInTheDocument();
    expect(close).toBeInTheDocument();

    fireEvent.click(reconcile);
    expect(onImported).toHaveBeenCalled();
    expect(onReconcile).toHaveBeenCalledWith(expect.objectContaining({ id: 'stmt-new' }));
  });

  it('surfaces a preview failure on the setup step', async () => {
    previewImport.mockRejectedValue(new Error('Could not determine the statement format'));
    renderWizard();
    const input = screen.getByLabelText(/choose a statement file/i);
    fireEvent.change(input, { target: { files: [makeFile('x.pdf', 'x')] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/format/i));
    // still on the setup step
    expect(screen.getByLabelText(/bank account/i)).toBeInTheDocument();
  });

  it('within(dl) sanity: line rows carry date, description and reference', async () => {
    previewImport.mockResolvedValue(makePreview());
    renderWizard();
    await uploadAndPreview();
    const row = screen.getByText('Customer payment').closest('div')!;
    expect(within(row).getByText('05 Aug 2026')).toBeInTheDocument();
    expect(within(row).getByText('INV-1')).toBeInTheDocument();
  });
});
