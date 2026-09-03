import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, FileUp, Loader2 } from 'lucide-react';
import type { BankAccount, BankStatement } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { EnumSelect } from '@/components/app/combobox';
import { FormShell, FormHeader, FormBody } from '@/components/app/form';
import { Amount } from '@/components/app/figure';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useStatementImport } from '../hooks/useStatementImport';
import type { StatementFileFormat } from '../types';

const FORMAT_LABELS: Record<StatementFileFormat, string> = {
  csv: 'CSV',
  ofx: 'OFX / QFX',
  qif: 'QIF',
  mt940: 'SWIFT MT940',
};

export interface StatementImportWizardProps {
  bankAccounts: BankAccount[];
  defaultBankAccountId?: string;
  /** Close the wizard without importing. */
  onClose: () => void;
  /** A statement was imported — refetch lists. */
  onImported: (statement: BankStatement) => void;
  /** "Reconcile now" from the done step — route to the reconciliation workspace. */
  onReconcile: (statement: BankStatement) => void;
}

/**
 * Persistent bank-statement import (P1.5 / PART K). A stepped flow inside the
 * shared wide form Dialog:
 *
 *   1–2. Select account + choose file (+ optional format override)
 *   3.   Preview — format / period / opening / closing / line count, the
 *        duplicate warning, parse issues, and the PART L balance-integrity
 *        check, plus a read-only line list. NONE of these block Confirm
 *        except an un-acknowledged exact-duplicate.
 *   4.   Confirm — persists ONE `BankStatement` + its lines. No GL, no
 *        `bank_transactions`.
 *   5.   Done — "Reconcile now" / "Close".
 *
 * The old per-line `StatementImportPanel` / `bankTransactionService.importStatementLines`
 * path is separate and still reachable elsewhere; it is removed in P2.
 */
export function StatementImportWizard({
  bankAccounts,
  defaultBankAccountId,
  onClose,
  onImported,
  onReconcile,
}: StatementImportWizardProps) {
  const { status, preview, statement, lineCount, error, runPreview, confirm, reset } = useStatementImport();

  const [bankAccountId, setBankAccountId] = useState<string>(
    defaultBankAccountId ?? bankAccounts[0]?.id ?? '',
  );
  const [formatOverride, setFormatOverride] = useState<StatementFileFormat | ''>('');
  const [importAnyway, setImportAnyway] = useState(false);
  const [showParseIssues, setShowParseIssues] = useState(false);

  const selectedAccount = useMemo(
    () => bankAccounts.find((a) => a.id === bankAccountId),
    [bankAccounts, bankAccountId],
  );

  function handleFile(file: File) {
    setImportAnyway(false);
    setShowParseIssues(false);
    void runPreview(file, bankAccountId, formatOverride || undefined);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <FormShell open onClose={handleClose} size="xl" mode="create">
      {/* hideClose: each step owns its own explicit Cancel / Close / Back — a
          stray header × in a multi-step wizard is ambiguous. */}
      <FormHeader title="Import bank statement" hideClose />
      <FormBody>
        {status === 'done' && statement ? (
          <DoneStep
            lineCount={lineCount ?? statement.lineCount}
            onReconcile={() => {
              onImported(statement);
              onReconcile(statement);
            }}
            onClose={() => {
              onImported(statement);
              handleClose();
            }}
          />
        ) : preview ? (
          <PreviewStep
            preview={preview}
            status={status}
            error={error}
            importAnyway={importAnyway}
            setImportAnyway={setImportAnyway}
            showParseIssues={showParseIssues}
            setShowParseIssues={setShowParseIssues}
            onBack={reset}
            onConfirm={() => void confirm(preview.duplicateOf ? { allowDuplicate: importAnyway } : undefined)}
          />
        ) : (
          <SetupStep
            bankAccounts={bankAccounts}
            bankAccountId={bankAccountId}
            setBankAccountId={setBankAccountId}
            formatOverride={formatOverride}
            setFormatOverride={setFormatOverride}
            isReading={status === 'previewing'}
            error={error}
            disabled={!selectedAccount}
            onFile={handleFile}
            onCancel={handleClose}
          />
        )}
      </FormBody>
    </FormShell>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

const SEPARATION_COPY =
  'Importing records the statement. Reconciling it against your books is the next step.';

function SetupStep({
  bankAccounts,
  bankAccountId,
  setBankAccountId,
  formatOverride,
  setFormatOverride,
  isReading,
  error,
  disabled,
  onFile,
  onCancel,
}: {
  bankAccounts: BankAccount[];
  bankAccountId: string;
  setBankAccountId: (id: string) => void;
  formatOverride: StatementFileFormat | '';
  setFormatOverride: (f: StatementFileFormat | '') => void;
  isReading: boolean;
  error: string | null;
  disabled: boolean;
  onFile: (file: File) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="import-bank-account" className="text-sm font-medium text-foreground">
          Bank account
        </label>
        <EnumSelect
          id="import-bank-account"
          value={bankAccountId}
          onValueChange={setBankAccountId}
          placeholder={bankAccounts.length === 0 ? 'No bank accounts' : 'Select…'}
          options={
            bankAccounts.length === 0
              ? [{ value: '', label: 'No bank accounts' }]
              : bankAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.name}${a.bankName ? ` (${a.bankName})` : ''}`,
                }))
          }
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-6 text-center">
        <FileUp className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <label className="cursor-pointer text-sm font-medium text-brand hover:underline">
          Choose a statement file (CSV, OFX/QFX, QIF, or SWIFT MT940)
          <input
            type="file"
            accept=".csv,.ofx,.qfx,.qif,.sta,.mt940,.940,text/csv"
            className="sr-only"
            disabled={disabled || isReading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
        </label>
        <label className="mx-auto flex items-center gap-2 text-xs text-muted-foreground">
          Format override:
          <EnumSelect
            aria-label="Statement format override"
            value={formatOverride}
            onValueChange={(value) => setFormatOverride(value as StatementFileFormat | '')}
            className="w-auto min-w-44"
            options={[
              { value: '', label: 'Auto-detect from extension' },
              ...(Object.keys(FORMAT_LABELS) as StatementFileFormat[]).map((f) => ({
                value: f,
                label: FORMAT_LABELS[f],
              })),
            ]}
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">{SEPARATION_COPY}</p>

      {isReading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Reading statement…
        </p>
      )}
      {error && <ErrorNote message={error} />}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PreviewStep({
  preview,
  status,
  error,
  importAnyway,
  setImportAnyway,
  showParseIssues,
  setShowParseIssues,
  onBack,
  onConfirm,
}: {
  preview: NonNullable<ReturnType<typeof useStatementImport>['preview']>;
  status: string;
  error: string | null;
  importAnyway: boolean;
  setImportAnyway: (v: boolean) => void;
  showParseIssues: boolean;
  setShowParseIssues: (v: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { parsed, balanceCheck, duplicateOf } = preview;
  const period =
    parsed.periodStart && parsed.periodEnd
      ? `${formatDate(parsed.periodStart)} – ${formatDate(parsed.periodEnd)}`
      : 'not in file';
  const isConfirming = status === 'confirming';
  const confirmBlocked = Boolean(duplicateOf) && !importAnyway;

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Field label="Format" value={FORMAT_LABELS[preview.format]} />
        <Field label="Period" value={period} />
        <Field label="Lines" value={String(parsed.lines.length)} />
        <Field
          label="Opening balance"
          value={parsed.openingBalance === undefined ? 'not in file' : formatCurrency(parsed.openingBalance)}
        />
        <Field
          label="Closing balance"
          value={parsed.closingBalance === undefined ? 'not in file' : formatCurrency(parsed.closingBalance)}
        />
      </dl>

      {duplicateOf && (
        <div className="flex flex-col gap-2 rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2.5 text-sm text-status-warning">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            This statement looks identical to one imported on{' '}
            {duplicateOf.importedAt ? formatDate(duplicateOf.importedAt) : formatDate(duplicateOf.createdAt)}
            {` (${duplicateOf.sourceFilename ?? duplicateOf.reference ?? duplicateOf.id})`}.
          </p>
          <label className="flex items-center gap-2 font-normal text-foreground">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={importAnyway}
              onChange={(e) => setImportAnyway(e.target.checked)}
            />
            Import anyway
          </label>
        </div>
      )}

      <BalanceIntegrityNote check={balanceCheck} />

      {parsed.parseErrors.length > 0 && (
        <div className="rounded-lg border border-status-warning-outline bg-status-warning-surface text-sm">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-status-warning"
            onClick={() => setShowParseIssues(!showParseIssues)}
            aria-expanded={showParseIssues}
          >
            {showParseIssues ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )}
            {parsed.parseErrors.length} row{parsed.parseErrors.length === 1 ? '' : 's'} could not be read and will be skipped
          </button>
          {showParseIssues && (
            <ul className="flex flex-col gap-1.5 border-t border-status-warning-outline px-3 py-2 text-xs text-muted-foreground">
              {parsed.parseErrors.map((pe) => (
                <li key={pe.rowIndex}>
                  <span className="font-medium text-foreground">Row {pe.rowIndex}</span> — {pe.reason}
                  <span className="block truncate font-mono text-[0.7rem] opacity-70">{pe.raw}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
        <div className="sticky top-0 grid grid-cols-[96px_1.6fr_110px_110px_90px] gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span>Date</span>
          <span>Description</span>
          <span>Ref</span>
          <span className="text-right">Amount</span>
          <span>Direction</span>
        </div>
        {parsed.lines.map((line) => (
          <div
            key={line.sourceRowId}
            className="grid grid-cols-[96px_1.6fr_110px_110px_90px] gap-2 border-b border-border/50 px-3 py-2 text-sm tabular-nums"
          >
            <span className="text-muted-foreground">{formatDate(line.date)}</span>
            <span className="truncate">{line.description}</span>
            <span className="truncate text-xs text-muted-foreground">
              {line.reference ?? line.externalRefId ?? '—'}
            </span>
            <span className="text-right">
              <Amount value={line.direction === 'credit' ? -line.amount : line.amount} plain />
            </span>
            <span className="text-muted-foreground">{line.direction === 'debit' ? 'Money in' : 'Money out'}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{SEPARATION_COPY}</p>

      {error && <ErrorNote message={error} />}

      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onBack} disabled={isConfirming}>
          Back
        </Button>
        <Button type="button" onClick={onConfirm} disabled={confirmBlocked || isConfirming}>
          {isConfirming ? 'Importing…' : 'Import statement'}
        </Button>
      </div>
    </div>
  );
}

function BalanceIntegrityNote({
  check,
}: {
  check: NonNullable<ReturnType<typeof useStatementImport>['preview']>['balanceCheck'];
}) {
  if (check.ok === true) {
    return (
      <p className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">
        Opening + movement = closing ✓
      </p>
    );
  }
  if (check.ok === false) {
    const out = check.delta === undefined ? '' : ` (out by ${formatCurrency(Math.abs(check.delta))})`;
    const opening =
      check.expectedClosing === undefined ? '' : `opening ${formatCurrency(check.expectedClosing)} + movement ≠ closing`;
    return (
      <p
        role="alert"
        className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2 text-sm text-status-warning"
      >
        Statement integrity warning: {opening}
        {out}. This usually means the imported file is missing lines or malformed — it does not indicate an error in
        your books. You can still import it.
      </p>
    );
  }
  return (
    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      The file did not include balances to verify against.
    </p>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function DoneStep({
  lineCount,
  onReconcile,
  onClose,
}: {
  lineCount: number;
  onReconcile: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-status-positive-outline bg-status-positive-surface px-4 py-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Statement imported — {lineCount} line{lineCount === 1 ? '' : 's'}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The statement and its lines are recorded. Nothing has been posted to your general ledger. Reconciling it
          against your books is the next step.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onClose}>
          Close
        </Button>
        <Button type="button" onClick={onReconcile}>
          Reconcile now
        </Button>
      </div>
    </div>
  );
}
