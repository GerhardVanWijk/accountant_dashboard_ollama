import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, FileUp, Loader2 } from 'lucide-react';
import { FormShell, FormHeader, FormBody } from '@/components/app/form';
import { Button } from '@/components/ui/shadcn/button';
import { EnumSelect } from '@/components/app/combobox';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { AccountMappingChoice, AccountMappingSelections, DuplicateStrategy, ExternalAccountRef, ExternalTaxRef, ImportAdapter, ImportRowResult, TaxMappingSelections } from '../types';
import { useImportWizard, type UseImportWizardOptions } from '../hooks/useImportWizard';
import { hasAllRequiredMappings } from '../mapping';
import { downloadErrorReportCSV } from '../errorReport';
import { suggestAccountMappings, restoreAccountMappingSelections } from '../migration/accountMapping';
import { suggestTaxMappings, restoreTaxMappingSelections } from '../migration/taxMapping';
import { listMappingProfiles, saveMappingProfile } from '../migration/importMappingProfileService';
import { downloadResultReport } from '../migration/reports';
import type { ImportMappingProfile } from '../migration/types';

export interface ImportWizardProps {
  /** One adapter opens the wizard straight to the File step; several offer an "Import type" chooser first. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapters: ImportAdapter<any, any>[];
  onClose: () => void;
  /** Fires once the import has actually written data — the caller should refetch its lists. */
  onImported: () => void;
  /** Phase D — opts into persisted import-batch tracking (see useImportWizard's UseImportWizardOptions doc comment). Omitted by every pre-Phase-D caller, unchanged behavior. */
  batch?: UseImportWizardOptions['batch'];
  /** Phase D — pre-supplies a file (e.g. one section extracted from an Vertex Migration Package) instead of waiting for the user to pick one, skipping straight past the File step. */
  initialFile?: File;
}

const SEVERITY_LABEL: Record<string, string> = { valid: 'Ready', warning: 'Warning', error: 'Error', duplicate: 'Duplicate', skipped: 'Skipped' };
const SEVERITY_TONE: Record<string, string> = {
  valid: 'text-status-positive',
  warning: 'text-status-warning',
  error: 'text-status-negative',
  duplicate: 'text-status-warning',
  skipped: 'text-muted-foreground',
};

/**
 * The ONE import UI every adapter shares (Phase 6 spec §4) — file → parse
 * → worksheet → (adapter target, when needed) → column mapping →
 * validate/review → confirm → result. Business rules live entirely in the
 * adapter passed in; this component only drives the pipeline and renders
 * whatever the adapter's `fields`/`normalizeRow`/`detectDuplicates` produce.
 */
export function ImportWizard({ adapters, onClose, onImported, batch, initialFile }: ImportWizardProps) {
  const wizard = useImportWizard(adapters, batch ? { batch } : undefined);
  const [showAllRows, setShowAllRows] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState<ImportMappingProfile[]>([]);

  useEffect(() => {
    if (wizard.step === 'mapping' && batch) {
      listMappingProfiles(batch.importType)
        .then((profiles) => setSavedProfiles(profiles.filter((p) => p.isActive && (p.sourceSystem === batch.sourceSystem || p.sourceSystem === 'generic'))))
        .catch(() => setSavedProfiles([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.step, batch?.importType, batch?.sourceSystem]);

  /**
   * "Save mapping as profile" lives on the Review step, not Mapping — by
   * Review, column mapping AND (when the adapter requires them) account/tax
   * mapping are all finalized, so one save captures the complete picture the
   * brief asks a profile to remember (column + account + tax), not just
   * column headers.
   */
  function saveCurrentMappingAsProfile() {
    if (!wizard.sheet || !batch) return;
    const name = window.prompt('Name this mapping profile (e.g. "ABC Client — Pastel Chart of Accounts"):');
    if (!name) return;
    const columnMappings: Record<string, string> = {};
    for (const [fieldKey, index] of Object.entries(wizard.mapping)) {
      if (index !== undefined) columnMappings[fieldKey] = wizard.sheet.headers[index];
    }
    void saveMappingProfile({
      name,
      sourceSystem: batch.sourceSystem,
      importType: batch.importType,
      columnMappings,
      accountMappings: wizard.accountMappingSelections,
      taxMappings: wizard.taxMappingSelections,
    })
      .then((created) => setSavedProfiles((prev) => [...prev, created]))
      .catch(() => {
        // Non-fatal — the import itself doesn't depend on the profile save succeeding.
      });
  }

  useEffect(() => {
    if (wizard.step === 'mapping' && wizard.sheet && Object.keys(wizard.mapping).length === 0) {
      wizard.initializeMapping();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.step, wizard.sheet]);

  useEffect(() => {
    if (initialFile && wizard.step === 'file' && !wizard.workbook) {
      void wizard.uploadFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile, wizard.step]);

  function handleClose() {
    wizard.reset();
    onClose();
  }

  const title = wizard.adapter ? `Import ${wizard.adapter.label}` : 'Import data';

  return (
    <FormShell open onClose={handleClose} size="xl" mode="create">
      <FormHeader title={title} hideClose />
      <FormBody>
        {wizard.step === 'type' && <TypeStep adapters={adapters} onSelect={wizard.selectAdapter} loading={wizard.loading} error={wizard.error} onCancel={handleClose} />}
        {wizard.step === 'file' && wizard.adapter && (
          <FileStep adapter={wizard.adapter} onFile={wizard.uploadFile} loading={wizard.loading} error={wizard.error} onBack={adapters.length > 1 ? wizard.goBack : undefined} onCancel={handleClose} />
        )}
        {wizard.step === 'worksheet' && wizard.workbook && (
          <WorksheetStep names={wizard.workbook.worksheetNames} onSelect={wizard.selectWorksheet} onBack={wizard.goBack} onCancel={handleClose} />
        )}
        {wizard.step === 'target' && wizard.adapter && (
          <TargetStep
            fields={wizard.adapter.confirmFields?.(wizard.ctx) ?? []}
            onContinue={wizard.confirmTarget}
            onBack={wizard.goBack}
            onCancel={handleClose}
          />
        )}
        {wizard.step === 'mapping' && wizard.adapter && wizard.sheet && (
          <>
            {wizard.duplicateFileWarning && wizard.duplicateFileWarning.length > 0 && (
              <DuplicateFileNote count={wizard.duplicateFileWarning.length} />
            )}
            {batch && savedProfiles.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Saved profile:</span>
                <EnumSelect
                  value=""
                  onValueChange={(id) => {
                    const profile = savedProfiles.find((p) => p.id === id);
                    if (profile) wizard.applyMappingProfile(profile);
                  }}
                  options={[{ value: '', label: 'Apply a saved mapping…' }, ...savedProfiles.map((p) => ({ value: p.id, label: p.name }))]}
                  className="w-64"
                />
              </div>
            )}
            <MappingStep
              fields={wizard.adapter.fields}
              headers={wizard.sheet.headers}
              mapping={wizard.mapping}
              onChange={wizard.setMapping}
              onContinue={wizard.proceedFromMapping}
              onBack={wizard.goBack}
              onCancel={handleClose}
            />
          </>
        )}
        {wizard.step === 'accountMapping' && wizard.adapter && (
          <AccountMappingStep
            refs={wizard.accountRefs}
            accounts={wizard.adapter.getMappableAccounts?.(wizard.ctx) ?? []}
            restoredMappings={wizard.profileAccountMappings}
            onContinue={wizard.confirmAccountMapping}
            onBack={wizard.goBack}
            onCancel={handleClose}
            loading={wizard.loading}
            error={wizard.error}
          />
        )}
        {wizard.step === 'taxMapping' && wizard.adapter && (
          <TaxMappingStep
            refs={wizard.taxRefs}
            treatments={wizard.adapter.getMappableTaxTreatments?.(wizard.ctx) ?? []}
            restoredMappings={wizard.profileTaxMappings}
            onContinue={wizard.confirmTaxMapping}
            onBack={wizard.goBack}
            onCancel={handleClose}
            loading={wizard.loading}
            error={wizard.error}
          />
        )}
        {wizard.step === 'review' && (
          <ReviewStep
            rows={wizard.rows}
            duplicateStrategy={wizard.duplicateStrategy}
            onDuplicateStrategyChange={wizard.setDuplicateStrategy}
            showAllRows={showAllRows}
            setShowAllRows={setShowAllRows}
            onConfirm={wizard.confirmImport}
            onBack={wizard.goBack}
            onCancel={handleClose}
            loading={wizard.loading}
            error={wizard.error}
            onSaveProfile={batch ? saveCurrentMappingAsProfile : undefined}
          />
        )}
        {wizard.step === 'result' && wizard.summary && wizard.workbook && (
          <ResultStep
            summary={wizard.summary}
            fileName={wizard.workbook.fileName}
            recordType={wizard.adapter?.label ?? 'Record'}
            onClose={() => {
              onImported();
              handleClose();
            }}
            onImportAnother={() => {
              onImported();
              wizard.reset();
            }}
          />
        )}
      </FormBody>
    </FormShell>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImportTypeCard({ adapter, onSelect }: { adapter: ImportAdapter<any, any>; onSelect: () => void }) {
  const allowed = useCanAccess(adapter.permission.feature, adapter.permission.action);
  if (!allowed) return null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/40"
    >
      <span className="text-sm font-medium text-foreground">{adapter.label}</span>
      <span className="text-xs text-muted-foreground">{adapter.description}</span>
    </button>
  );
}

function TypeStep({
  adapters,
  onSelect,
  loading,
  error,
  onCancel,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: { adapters: ImportAdapter<any, any>[]; onSelect: (a: ImportAdapter<any, any>) => void; loading: boolean; error?: string; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">What would you like to import?</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {adapters.map((a) => (
          <ImportTypeCard key={a.id} adapter={a} onSelect={() => onSelect(a)} />
        ))}
      </div>
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
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

function FileStep({
  adapter,
  onFile,
  loading,
  error,
  onBack,
  onCancel,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: { adapter: ImportAdapter<any, any>; onFile: (f: File) => void; loading: boolean; error?: string; onBack?: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{adapter.description}</p>
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-6 text-center">
        <FileUp className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <label className="cursor-pointer text-sm font-medium text-brand hover:underline">
          Choose a file (CSV, XLS or XLSX)
          <input
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Reading file…
        </p>
      )}
      {error && <ErrorNote message={error} />}
      <div className="flex justify-between gap-2 border-t border-border pt-4">
        {onBack ? (
          <Button variant="outline" type="button" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function WorksheetStep({ names, onSelect, onBack, onCancel }: { names: string[]; onSelect: (name: string) => void; onBack: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">This file has more than one worksheet — pick the one to import.</p>
      <div className="flex flex-col gap-2">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className="rounded-lg border border-border px-4 py-3 text-left text-sm font-medium transition-colors hover:border-primary/40"
          >
            {name}
          </button>
        ))}
      </div>
      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onBack}>
          Back
        </Button>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TargetStep({
  fields,
  onContinue,
  onBack,
  onCancel,
}: {
  fields: { key: string; label: string; type?: 'enum' | 'date'; required?: boolean; helpText?: string; defaultValue?: string; options?: { value: string; label: string }[] }[];
  onContinue: (params: Record<string, unknown>) => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? ''])));
  const canContinue = fields.every((f) => !f.required || values[f.key]);

  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label htmlFor={`target-${field.key}`} className="text-sm font-medium text-foreground">
            {field.label}
            {field.required && ' *'}
          </label>
          {field.type === 'date' ? (
            <input
              id={`target-${field.key}`}
              type="date"
              value={values[field.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          ) : (
            <EnumSelect
              id={`target-${field.key}`}
              value={values[field.key]}
              onValueChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
              options={[{ value: '', label: 'Select…' }, ...(field.options ?? [])]}
            />
          )}
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          {field.type !== 'date' && (field.options?.length ?? 0) === 0 && <p className="text-xs text-status-warning">None available — nothing eligible was found.</p>}
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!canContinue} onClick={() => onContinue(values)}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function MappingStep({
  fields,
  headers,
  mapping,
  onChange,
  onContinue,
  onBack,
  onCancel,
}: {
  fields: { key: string; label: string; required?: boolean }[];
  headers: string[];
  mapping: Record<string, number | undefined>;
  onChange: (m: Record<string, number | undefined>) => void;
  onContinue: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const canContinue = hasAllRequiredMappings(mapping, fields as never);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">Match each spreadsheet column to the right field. Fields marked with * are required.</p>
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <div key={field.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_2fr]">
            <label htmlFor={`map-${field.key}`} className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && ' *'}
            </label>
            <EnumSelect
              id={`map-${field.key}`}
              value={mapping[field.key] === undefined ? '' : String(mapping[field.key])}
              onValueChange={(value) => onChange({ ...mapping, [field.key]: value === '' ? undefined : Number(value) })}
              options={[
                { value: '', label: '— not mapped —' },
                ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
              ]}
            />
          </div>
        ))}
      </div>
      {!canContinue && <p className="text-xs text-status-warning">Map every required field to continue.</p>}
      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!canContinue} onClick={onContinue}>
            Preview &amp; validate
          </Button>
        </div>
      </div>
    </div>
  );
}

function DuplicateFileNote({ count }: { count: number }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2.5 text-sm text-status-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      This file appears to have been imported previously ({count} prior batch{count === 1 ? '' : 'es'} with identical content). Review Import History before continuing if this wasn't intentional.
    </p>
  );
}

function AccountMappingStep({
  refs,
  accounts,
  restoredMappings,
  onContinue,
  onBack,
  onCancel,
  loading,
  error,
}: {
  refs: ExternalAccountRef[];
  accounts: { id: string; code: string; name: string }[];
  restoredMappings?: Record<string, unknown>;
  onContinue: (selections: AccountMappingSelections) => void;
  onBack: () => void;
  onCancel: () => void;
  loading: boolean;
  error?: string;
}) {
  const suggestions = suggestAccountMappings(refs, accounts);
  const restored = restoreAccountMappingSelections(restoredMappings ?? {}, refs, accounts);
  const [selections, setSelections] = useState<AccountMappingSelections>(() =>
    Object.fromEntries(
      suggestions.map((s) => [
        s.ref.code,
        restored[s.ref.code] ??
          (s.suggestedAccountId ? ({ action: 'existing', accountId: s.suggestedAccountId } as AccountMappingChoice) : ({ action: 'ignore' } as AccountMappingChoice)),
      ]),
    ),
  );
  const [newAccountTypes, setNewAccountTypes] = useState<Record<string, string>>({});

  const unresolvedCount = suggestions.filter((s) => selections[s.ref.code]?.action === 'ignore').length;

  function setChoice(code: string, action: 'existing' | 'create' | 'ignore', accountId?: string) {
    setSelections((prev) => {
      if (action === 'existing') return { ...prev, [code]: { action: 'existing', accountId: accountId ?? '' } };
      if (action === 'create') {
        const ref = suggestions.find((s) => s.ref.code === code)?.ref;
        const type = (newAccountTypes[code] ?? 'expense') as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
        return { ...prev, [code]: { action: 'create', accountType: type, code, name: ref?.name ?? code } };
      }
      return { ...prev, [code]: { action: 'ignore' } };
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Map each external account to an existing Vertex account, or create a new one. Codes that exactly match an existing Vertex account code are pre-filled — review before continuing. Any account left "Requires review" will block this import.
      </p>
      {unresolvedCount > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2 text-sm text-status-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {unresolvedCount} account{unresolvedCount === 1 ? '' : 's'} still require review.
        </p>
      )}
      {/* max-h-96 + overflow-auto here (not just overflow-y) — FormBody clips overflow-x, so this grid's own fixed-width columns need their own horizontal scroll region on a narrow viewport, same pattern as the page-level tables (e.g. ImportHistoryPage's min-w-[860px] + overflow-x-auto). */}
      <div className="max-h-96 overflow-auto rounded-xl border border-border">
        <div className="sticky top-0 grid min-w-[620px] grid-cols-[110px_1fr_140px_1fr] gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span>External Code</span>
          <span>External Name</span>
          <span>Action</span>
          <span>Vertex Account</span>
        </div>
        {suggestions.map(({ ref, suggestedAccountId }) => {
          const choice = selections[ref.code];
          return (
            <div key={ref.code} className="grid min-w-[620px] grid-cols-[110px_1fr_140px_1fr] items-center gap-2 border-b border-border/50 px-3 py-2 text-sm last:border-0">
              <span className="font-mono text-xs">{ref.code}</span>
              <span className="truncate text-muted-foreground">{ref.name ?? '—'}</span>
              <EnumSelect
                aria-label={`Action for ${ref.code}`}
                value={choice?.action ?? 'ignore'}
                onValueChange={(value) => setChoice(ref.code, value as 'existing' | 'create' | 'ignore', choice?.action === 'existing' ? choice.accountId : suggestedAccountId)}
                options={[
                  { value: 'existing', label: 'Map to existing' },
                  { value: 'create', label: 'Create new' },
                  { value: 'ignore', label: 'Requires review' },
                ]}
              />
              {choice?.action === 'existing' && (
                <EnumSelect
                  aria-label={`Vertex account for ${ref.code}`}
                  value={choice.accountId}
                  onValueChange={(value) => setChoice(ref.code, 'existing', value)}
                  options={[{ value: '', label: 'Select…' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))]}
                />
              )}
              {choice?.action === 'create' && (
                <EnumSelect
                  aria-label={`New account type for ${ref.code}`}
                  value={newAccountTypes[ref.code] ?? 'expense'}
                  onValueChange={(value) => {
                    setNewAccountTypes((prev) => ({ ...prev, [ref.code]: value }));
                    setChoice(ref.code, 'create');
                  }}
                  options={[
                    { value: 'asset', label: 'New account — Asset' },
                    { value: 'liability', label: 'New account — Liability' },
                    { value: 'equity', label: 'New account — Equity' },
                    { value: 'revenue', label: 'New account — Revenue' },
                    { value: 'expense', label: 'New account — Expense' },
                  ]}
                />
              )}
              {choice?.action === 'ignore' && <span className="text-xs text-status-warning">Blocks this account's rows until resolved.</span>}
            </div>
          );
        })}
        {suggestions.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No external accounts were found in the mapped columns.</p>}
      </div>

      {error && <ErrorNote message={error} />}

      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onContinue(selections)} disabled={loading}>
            {loading ? 'Applying…' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaxMappingStep({
  refs,
  treatments,
  restoredMappings,
  onContinue,
  onBack,
  onCancel,
  loading,
  error,
}: {
  refs: ExternalTaxRef[];
  treatments: { id: string; code: string; treatment: string; label: string; rate: number }[];
  restoredMappings?: Record<string, unknown>;
  onContinue: (selections: TaxMappingSelections) => void;
  onBack: () => void;
  onCancel: () => void;
  loading: boolean;
  error?: string;
}) {
  const suggestions = suggestTaxMappings(refs, treatments);
  const restored = restoreTaxMappingSelections(restoredMappings ?? {}, refs, treatments);
  const [selections, setSelections] = useState<TaxMappingSelections>(() =>
    Object.fromEntries(
      suggestions.map((s) => [
        s.ref.code,
        restored[s.ref.code] ?? (s.suggestedTaxRateId ? ({ action: 'mapped', taxRateId: s.suggestedTaxRateId } as const) : ({ action: 'ignore' } as const)),
      ]),
    ),
  );

  const unresolvedCount = suggestions.filter((s) => selections[s.ref.code]?.action === 'ignore').length;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Map each external tax/VAT code to an existing Vertex tax treatment, or mark it as legitimately non-taxable. Codes that exactly match a configured Vertex rate are pre-filled — review before continuing.
      </p>
      {unresolvedCount > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2 text-sm text-status-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {unresolvedCount} tax code{unresolvedCount === 1 ? '' : 's'} marked "Ignore / non-taxable" — confirm this is correct before continuing.
        </p>
      )}
      {/* overflow-auto (not just overflow-y) — see AccountMappingStep's identical note above. */}
      <div className="max-h-96 overflow-auto rounded-xl border border-border">
        <div className="sticky top-0 grid min-w-[520px] grid-cols-[110px_1fr_1fr] gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span>External Code</span>
          <span>External Description / Rate</span>
          <span>Vertex Tax Treatment</span>
        </div>
        {suggestions.map(({ ref }) => {
          const choice = selections[ref.code];
          return (
            <div key={ref.code} className="grid min-w-[520px] grid-cols-[110px_1fr_1fr] items-center gap-2 border-b border-border/50 px-3 py-2 text-sm last:border-0">
              <span className="font-mono text-xs">{ref.code}</span>
              <span className="truncate text-muted-foreground">{ref.description ?? '—'}{ref.rate !== undefined ? ` (${ref.rate}%)` : ''}</span>
              <EnumSelect
                aria-label={`Vertex tax treatment for ${ref.code}`}
                value={choice?.action === 'mapped' ? choice.taxRateId : 'ignore'}
                onValueChange={(value) =>
                  setSelections((prev) => ({ ...prev, [ref.code]: value === 'ignore' ? { action: 'ignore' } : { action: 'mapped', taxRateId: value } }))
                }
                options={[
                  { value: 'ignore', label: 'Ignore / non-taxable' },
                  ...treatments.map((t) => ({ value: t.id, label: t.rate !== undefined ? `${t.label} (${t.rate}%)` : t.label })),
                ]}
              />
            </div>
          );
        })}
        {suggestions.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No external tax codes were found in the mapped columns.</p>}
      </div>

      {error && <ErrorNote message={error} />}

      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onContinue(selections)} disabled={loading}>
            {loading ? 'Applying…' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const ROW_PREVIEW_LIMIT = 50;

function ReviewStep({
  rows,
  duplicateStrategy,
  onDuplicateStrategyChange,
  showAllRows,
  setShowAllRows,
  onConfirm,
  onBack,
  onCancel,
  loading,
  error,
  onSaveProfile,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: ImportRowResult<any>[];
  duplicateStrategy: DuplicateStrategy;
  onDuplicateStrategyChange: (s: DuplicateStrategy) => void;
  showAllRows: boolean;
  setShowAllRows: (v: boolean) => void;
  onConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
  loading: boolean;
  error?: string;
  /** Phase D — offered here (not on the Mapping step) because by Review every mapping decision this session made (column + account + tax) is final and can all be captured in one saved profile. */
  onSaveProfile?: () => void;
}) {
  const counts = rows.reduce(
    (acc, r) => {
      acc[r.severity] = (acc[r.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const hasDuplicates = (counts.duplicate ?? 0) > 0;
  const canImport = rows.length > 0 && (counts.valid ?? 0) + (counts.duplicate ?? 0) > 0;
  const visibleRows = showAllRows ? rows : rows.slice(0, ROW_PREVIEW_LIMIT);

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
        <SummaryField label="Rows read" value={String(rows.length)} />
        <SummaryField label="Ready" value={String(counts.valid ?? 0)} />
        <SummaryField label="Duplicates" value={String(counts.duplicate ?? 0)} />
        <SummaryField label="Warnings" value={String(rows.filter((r) => r.messages.some((m: { severity: string }) => m.severity === 'warning')).length)} />
        <SummaryField label="Errors" value={String(counts.error ?? 0)} />
      </dl>

      {hasDuplicates && (
        <div className="flex flex-col gap-2 rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2.5 text-sm">
          <p className="flex items-start gap-2 font-medium text-status-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {counts.duplicate} row{counts.duplicate === 1 ? '' : 's'} already exist. Choose how to handle them.
          </p>
          <EnumSelect
            aria-label="Duplicate handling"
            value={duplicateStrategy}
            onValueChange={(value) => onDuplicateStrategyChange(value as DuplicateStrategy)}
            options={[
              { value: 'skip', label: 'Skip existing' },
              { value: 'update', label: 'Update existing' },
              { value: 'error', label: 'Treat as an error' },
            ]}
          />
        </div>
      )}

      <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
        <div className="sticky top-0 grid grid-cols-[70px_90px_1fr] gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span>Row</span>
          <span>Status</span>
          <span>Detail</span>
        </div>
        {visibleRows.map((row) => (
          <div key={row.rowNumber} className="grid grid-cols-[70px_90px_1fr] gap-2 border-b border-border/50 px-3 py-2 text-sm">
            <span className="tabular-nums text-muted-foreground">{row.rowNumber}</span>
            <span className={SEVERITY_TONE[row.severity]}>{SEVERITY_LABEL[row.severity]}</span>
            <span className="text-xs text-muted-foreground">{row.messages.map((m: { message: string }) => m.message).join(' ') || '—'}</span>
          </div>
        ))}
      </div>
      {rows.length > ROW_PREVIEW_LIMIT && (
        <button type="button" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setShowAllRows(!showAllRows)}>
          {showAllRows ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
          {showAllRows ? 'Show fewer rows' : `Show all ${rows.length} rows`}
        </button>
      )}

      {error && <ErrorNote message={error} />}

      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <div className="flex gap-2">
          {onSaveProfile && (
            <Button variant="outline" type="button" onClick={onSaveProfile} disabled={loading}>
              Save mapping as profile
            </Button>
          )}
          <Button variant="outline" type="button" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!canImport || loading}>
            {loading ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function ResultStep({
  summary,
  fileName,
  recordType,
  onClose,
  onImportAnother,
}: {
  summary: import('../types').ImportExecutionSummary;
  fileName: string;
  recordType: string;
  onClose: () => void;
  onImportAnother: () => void;
}) {
  const errorRows = summary.rows.filter((r) => r.outcome === 'error');

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-status-positive-outline bg-status-positive-surface px-4 py-6 text-center">
        <p className="text-sm font-medium text-foreground">Import finished — {summary.imported + summary.updated} of {summary.rowsRead} row{summary.rowsRead === 1 ? '' : 's'} written.</p>
        {summary.draftRecordId && <p className="mt-1 text-xs text-muted-foreground">Nothing has posted yet — review and confirm the draft this created before it affects your books.</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
        <SummaryField label="Rows read" value={String(summary.rowsRead)} />
        <SummaryField label="Imported" value={String(summary.imported)} />
        <SummaryField label="Updated" value={String(summary.updated)} />
        <SummaryField label="Skipped" value={String(summary.skipped)} />
        <SummaryField label="Errors" value={String(summary.errored)} />
      </dl>

      <Button variant="outline" size="sm" type="button" className="w-fit" onClick={() => downloadResultReport(fileName, recordType, summary.rows)}>
        Download full result report
      </Button>

      {errorRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-destructive">{errorRows.length} row{errorRows.length === 1 ? '' : 's'} could not be imported</p>
            <Button variant="outline" size="sm" type="button" onClick={() => downloadErrorReportCSV(fileName, errorRows)}>
              Download error report
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
            {errorRows.map((r) => (
              <div key={r.rowNumber} className="border-b border-border/50 px-3 py-2 text-sm last:border-0">
                <span className="font-medium">Row {r.rowNumber}</span> — <span className="text-muted-foreground">{r.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onImportAnother}>
          Import another file
        </Button>
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
