import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, FileUp, Loader2 } from 'lucide-react';
import { FormShell, FormHeader, FormBody } from '@/components/app/form';
import { Button } from '@/components/ui/shadcn/button';
import { EnumSelect } from '@/components/app/combobox';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { DuplicateStrategy, ImportAdapter, ImportRowResult } from '../types';
import { useImportWizard } from '../hooks/useImportWizard';
import { hasAllRequiredMappings } from '../mapping';
import { downloadErrorReportCSV } from '../errorReport';

export interface ImportWizardProps {
  /** One adapter opens the wizard straight to the File step; several offer an "Import type" chooser first. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapters: ImportAdapter<any, any>[];
  onClose: () => void;
  /** Fires once the import has actually written data — the caller should refetch its lists. */
  onImported: () => void;
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
export function ImportWizard({ adapters, onClose, onImported }: ImportWizardProps) {
  const wizard = useImportWizard(adapters);
  const [showAllRows, setShowAllRows] = useState(false);

  useEffect(() => {
    if (wizard.step === 'mapping' && wizard.sheet && Object.keys(wizard.mapping).length === 0) {
      wizard.initializeMapping();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.step, wizard.sheet]);

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
          <MappingStep
            fields={wizard.adapter.fields}
            headers={wizard.sheet.headers}
            mapping={wizard.mapping}
            onChange={wizard.setMapping}
            onContinue={wizard.runValidation}
            onBack={wizard.goBack}
            onCancel={handleClose}
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
          />
        )}
        {wizard.step === 'result' && wizard.summary && wizard.workbook && (
          <ResultStep
            summary={wizard.summary}
            fileName={wizard.workbook.fileName}
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
  fields: { key: string; label: string; required?: boolean; helpText?: string; options: { value: string; label: string }[] }[];
  onContinue: (params: Record<string, unknown>) => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, ''])));
  const canContinue = fields.every((f) => !f.required || values[f.key]);

  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label htmlFor={`target-${field.key}`} className="text-sm font-medium text-foreground">
            {field.label}
            {field.required && ' *'}
          </label>
          <EnumSelect
            id={`target-${field.key}`}
            value={values[field.key]}
            onValueChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
            options={[{ value: '', label: 'Select…' }, ...field.options]}
          />
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          {field.options.length === 0 && <p className="text-xs text-status-warning">None available — nothing eligible was found.</p>}
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
  onClose,
  onImportAnother,
}: {
  summary: import('../types').ImportExecutionSummary;
  fileName: string;
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
