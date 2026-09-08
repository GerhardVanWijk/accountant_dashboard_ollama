import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type {
  AccountMappingSelections,
  ColumnMapping,
  DuplicateStrategy,
  ExternalAccountRef,
  ExternalTaxRef,
  ImportAdapter,
  ImportExecutionSummary,
  ImportRowResult,
  ParsedWorkbook,
  TaxMappingSelections,
} from '../types';
import { parseImportFile, ImportFileError } from '../parsers/fileParser';
import { suggestColumnMapping, mapRow } from '../mapping';
import { recordImportAudit } from '../services/importAuditService';
import * as importBatchService from '../migration/importBatchService';
import type { ImportBatch, ImportMappingProfile, SourceSystem } from '../migration/types';

export type WizardStep = 'type' | 'file' | 'worksheet' | 'target' | 'mapping' | 'accountMapping' | 'taxMapping' | 'review' | 'result';

export interface UseImportWizardOptions {
  /**
   * Phase D — when provided, every upload becomes a persisted
   * `import_batches` row (original file kept in private Storage, status
   * tracked through the pipeline, issues recorded for the Exceptions page).
   * Omitted (the default), this hook behaves exactly as it did before
   * Phase D — the five existing embedded "Import" buttons
   * (Customers/Suppliers/Inventory pages) pass nothing and get no batch
   * tracking, unchanged.
   */
  batch?: { importType: string; sourceSystem: SourceSystem };
}

/**
 * Drives one adapter through the full pipeline (spec §2): file → parse →
 * worksheet → (target) → mapping → (Phase D: account mapping) → validate →
 * review → confirm → execute → result. `ImportWizard` (components/) is the
 * only UI that owns this; every step here is plain data so it's
 * independently testable without rendering anything.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the wizard is adapter-agnostic; the concrete T/C are fixed once `selectAdapter` narrows to one real adapter.
export function useImportWizard(adapters: ImportAdapter<any, any>[], options?: UseImportWizardOptions) {
  const actorUserId = useAuthStore((s) => s.session?.user.id ?? 'system');

  const [step, setStep] = useState<WizardStep>(adapters.length === 1 ? 'file' : 'type');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the module-level disable above.
  const [adapter, setAdapter] = useState<ImportAdapter<any, any> | undefined>(adapters.length === 1 ? adapters[0] : undefined);
  const [ctx, setCtx] = useState<unknown>(undefined);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | undefined>(undefined);
  const [worksheetName, setWorksheetName] = useState<string | undefined>(undefined);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [confirmParams, setConfirmParams] = useState<Record<string, unknown>>({});
  const [accountRefs, setAccountRefs] = useState<ExternalAccountRef[]>([]);
  const [taxRefs, setTaxRefs] = useState<ExternalTaxRef[]>([]);
  // Phase D mapping-profile completion — the profile's OWN account/tax mappings
  // (raw, unvalidated JSON from the DB row), used only to pre-fill the
  // Account/Tax Mapping steps (see restoreAccountMappingSelections/
  // restoreTaxMappingSelections, which validate every entry against the
  // CURRENT company-scoped accounts/treatments before trusting it).
  const [profileAccountMappings, setProfileAccountMappings] = useState<Record<string, unknown>>({});
  const [profileTaxMappings, setProfileTaxMappings] = useState<Record<string, unknown>>({});
  // The user's own confirmed choices THIS session — captured so "Save mapping
  // as profile" (offered on the Review step, once every mapping decision is
  // final) can persist them alongside the column mapping.
  const [accountMappingSelections, setAccountMappingSelections] = useState<AccountMappingSelections>({});
  const [taxMappingSelections, setTaxMappingSelections] = useState<TaxMappingSelections>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [rows, setRows] = useState<ImportRowResult<unknown>[]>([]);
  const [summary, setSummary] = useState<ImportExecutionSummary | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [batch, setBatch] = useState<ImportBatch | undefined>(undefined);
  const [duplicateFileWarning, setDuplicateFileWarning] = useState<ImportBatch[] | undefined>(undefined);

  const sheet = useMemo(() => (workbook && worksheetName ? workbook.getSheet(worksheetName) : undefined), [workbook, worksheetName]);

  const loadAdapterContext = useCallback(async (next: ImportAdapter<unknown, unknown>) => {
    setError(undefined);
    setLoading(true);
    try {
      setAdapter(next);
      setCtx(await next.loadContext());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reference data for this import type.');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectAdapter = useCallback(
    async (next: ImportAdapter<unknown, unknown>) => {
      await loadAdapterContext(next);
      setStep('file');
    },
    [loadAdapterContext],
  );

  useEffect(() => {
    if (adapters.length === 1 && ctx === undefined) {
      void loadAdapterContext(adapters[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setError(undefined);
    setLoading(true);
    try {
      const parsed = await parseImportFile(file);
      setWorkbook(parsed);

      if (options?.batch) {
        try {
          const created = await importBatchService.createBatch({ importType: options.batch.importType, sourceSystem: options.batch.sourceSystem, file });
          setBatch(created);
          if (created.fileHash) {
            const priorMatches = (await importBatchService.findBatchesByHash(created.fileHash)).filter((b) => b.id !== created.id);
            if (priorMatches.length > 0) setDuplicateFileWarning(priorMatches);
          }
        } catch (batchErr) {
          // A batch-tracking failure never blocks the actual import — surfaced as a non-fatal note instead.
          setError(batchErr instanceof Error ? `Could not record this import in the batch history: ${batchErr.message}` : undefined);
        }
      }

      if (parsed.worksheetNames.length === 1) {
        setWorksheetName(parsed.worksheetNames[0]);
        advanceAfterFile();
      } else {
        setStep('worksheet');
      }
    } catch (err) {
      setError(err instanceof ImportFileError ? err.message : err instanceof Error ? err.message : 'Failed to read this file.');
    } finally {
      setLoading(false);
    }

    function advanceAfterFile() {
      if (adapter?.confirmFields && adapter.confirmFields(ctx).length > 0) setStep('target');
      else setStep('mapping');
    }
  }, [adapter, ctx, options?.batch]);

  const selectWorksheet = useCallback(
    (name: string) => {
      setWorksheetName(name);
      if (adapter?.confirmFields && adapter.confirmFields(ctx).length > 0) setStep('target');
      else setStep('mapping');
    },
    [adapter, ctx],
  );

  const confirmTarget = useCallback(
    (params: Record<string, unknown>) => {
      setConfirmParams(params);
      if (adapter?.applyParams) setCtx((prev: unknown) => adapter.applyParams!(prev, params));
      setStep('mapping');
    },
    [adapter],
  );

  const initializeMapping = useCallback(() => {
    if (!sheet || !adapter) return;
    setMapping(suggestColumnMapping(sheet.headers, adapter.fields).mapping);
  }, [sheet, adapter]);

  /**
   * Applies a saved `ImportMappingProfile` at the Mapping step — column
   * mapping is resolved against THIS file's headers immediately (a header
   * that no longer matches the profile is left unmapped, same as any other
   * unmapped required field); the profile's own account/tax mappings are
   * only stashed here, then resolved against the CURRENT company-scoped
   * accounts/tax treatments once the Account/Tax Mapping steps actually run
   * (see restoreAccountMappingSelections/restoreTaxMappingSelections) — both
   * steps still render for explicit user confirmation, a restored choice is
   * never applied silently.
   */
  const applyMappingProfile = useCallback((profile: ImportMappingProfile) => {
    if (!sheet) return;
    const headers = sheet.headers;
    const next: ColumnMapping = {};
    for (const [fieldKey, headerText] of Object.entries(profile.columnMappings)) {
      const index = headers.findIndex((h) => h.trim().toLowerCase() === String(headerText).trim().toLowerCase());
      next[fieldKey] = index === -1 ? undefined : index;
    }
    setMapping(next);
    setProfileAccountMappings(profile.accountMappings ?? {});
    setProfileTaxMappings(profile.taxMappings ?? {});
  }, [sheet]);

  const runValidation = useCallback((ctxOverride?: unknown) => {
    if (!sheet || !adapter) return;
    setError(undefined);
    const effectiveCtx = ctxOverride !== undefined ? ctxOverride : ctx;
    const results: ImportRowResult<unknown>[] = sheet.rows.map((row, i) => {
      const rawMapped = mapRow(row, mapping, adapter.fields);
      const rowNumber = i + 2; // header is row 1
      const { normalized, messages } = adapter.normalizeRow(rawMapped, rowNumber, effectiveCtx);
      const severity = !normalized ? 'error' : messages.some((m) => m.severity === 'error') ? 'error' : 'valid';
      return { rowNumber, raw: rawMapped, normalized, severity, messages };
    });
    const withDuplicates = adapter.detectDuplicates(results, effectiveCtx);
    setRows(withDuplicates);
    setStep('review');

    if (options?.batch && batch) {
      const counts = withDuplicates.reduce(
        (acc, r) => {
          acc[r.severity] = (acc[r.severity] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      const issues = withDuplicates.flatMap((r) =>
        r.messages.map((m) => ({
          severity: m.severity,
          issueCode: r.severity === 'error' ? 'ROW_ERROR' : r.severity === 'duplicate' ? 'DUPLICATE_ROW' : 'ROW_WARNING',
          category: r.severity === 'duplicate' ? 'DUPLICATE' : 'STRUCTURE',
          rowNumber: r.rowNumber,
          fieldName: m.field,
          sourceValue: m.field ? String(r.raw[m.field] ?? '') : undefined,
          message: m.message,
        })),
      );
      void importBatchService
        .recordValidation(batch.id, {
          rowCount: withDuplicates.length,
          validCount: counts.valid ?? 0,
          warningCount: withDuplicates.filter((r) => r.messages.some((m) => m.severity === 'warning')).length,
          errorCount: counts.error ?? 0,
          columnMapping: mapping,
          issues,
        })
        .catch(() => {
          // Non-fatal — the wizard's own in-memory review still works even if batch persistence fails.
        });
    }
  }, [sheet, adapter, mapping, ctx, options?.batch, batch]);

  /** After account mapping (if any) resolves, checks whether a tax-mapping step is needed too — skipped automatically when the adapter finds nothing to map (e.g. no tax-code column was mapped). */
  const proceedAfterAccountMapping = useCallback((currentCtx: unknown) => {
    if (!sheet || !adapter) return;
    if (adapter.requiresTaxMapping && adapter.extractTaxRefs) {
      const rawRows = sheet.rows.map((row) => mapRow(row, mapping, adapter.fields));
      const refs = adapter.extractTaxRefs(rawRows, currentCtx);
      if (refs.length > 0) {
        setTaxRefs(refs);
        setStep('taxMapping');
        return;
      }
      setTaxRefs([]);
    }
    runValidation(currentCtx);
  }, [sheet, adapter, mapping, runValidation]);

  const proceedFromMapping = useCallback(() => {
    if (!sheet || !adapter) return;
    if (adapter.requiresAccountMapping && adapter.extractAccountRefs) {
      const rawRows = sheet.rows.map((row) => mapRow(row, mapping, adapter.fields));
      setAccountRefs(adapter.extractAccountRefs(rawRows, ctx));
      setStep('accountMapping');
    } else {
      proceedAfterAccountMapping(ctx);
    }
  }, [sheet, adapter, mapping, ctx, proceedAfterAccountMapping]);

  const confirmAccountMapping = useCallback(async (selections: AccountMappingSelections) => {
    setAccountMappingSelections(selections);
    if (!adapter?.applyAccountMapping) {
      proceedAfterAccountMapping(ctx);
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const nextCtx = await adapter.applyAccountMapping(ctx, selections);
      setCtx(nextCtx);
      proceedAfterAccountMapping(nextCtx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply account mapping.');
    } finally {
      setLoading(false);
    }
  }, [adapter, ctx, proceedAfterAccountMapping]);

  const confirmTaxMapping = useCallback(async (selections: TaxMappingSelections) => {
    setTaxMappingSelections(selections);
    if (!adapter?.applyTaxMapping) {
      runValidation();
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const nextCtx = await adapter.applyTaxMapping(ctx, selections);
      setCtx(nextCtx);
      runValidation(nextCtx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply tax mapping.');
    } finally {
      setLoading(false);
    }
  }, [adapter, ctx, runValidation]);

  const confirmImport = useCallback(async () => {
    if (!adapter || !workbook) return;
    setError(undefined);
    setLoading(true);
    try {
      if (options?.batch && batch) void importBatchService.markImporting(batch.id).catch(() => {});
      const result = await adapter.execute(rows, ctx, { duplicateStrategy, actorUserId, params: confirmParams });
      setSummary(result);
      setStep('result');
      await recordImportAudit({ adapterId: adapter.id, adapterLabel: adapter.label, fileName: workbook.fileName, actorUserId, summary: result });
      if (options?.batch && batch) void importBatchService.completeBatch(batch.id, result, result.metadata).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The import failed.';
      setError(message);
      if (options?.batch && batch) void importBatchService.failBatch(batch.id, message).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [adapter, workbook, rows, ctx, duplicateStrategy, actorUserId, confirmParams, options?.batch, batch]);

  const reset = useCallback(() => {
    setStep(adapters.length === 1 ? 'file' : 'type');
    if (adapters.length !== 1) {
      setAdapter(undefined);
      setCtx(undefined);
    }
    setWorkbook(undefined);
    setWorksheetName(undefined);
    setMapping({});
    setConfirmParams({});
    setAccountRefs([]);
    setTaxRefs([]);
    setProfileAccountMappings({});
    setProfileTaxMappings({});
    setAccountMappingSelections({});
    setTaxMappingSelections({});
    setRows([]);
    setSummary(undefined);
    setError(undefined);
    setBatch(undefined);
    setDuplicateFileWarning(undefined);
  }, [adapters.length]);

  const goBack = useCallback(() => {
    setError(undefined);
    if (step === 'file' && adapters.length > 1) setStep('type');
    else if (step === 'worksheet') setStep('file');
    else if (step === 'target') setStep(workbook && workbook.worksheetNames.length > 1 ? 'worksheet' : 'file');
    else if (step === 'mapping') setStep(adapter?.confirmFields && adapter.confirmFields(ctx).length > 0 ? 'target' : workbook && workbook.worksheetNames.length > 1 ? 'worksheet' : 'file');
    else if (step === 'accountMapping') setStep('mapping');
    else if (step === 'taxMapping') setStep(adapter?.requiresAccountMapping ? 'accountMapping' : 'mapping');
    else if (step === 'review') setStep(taxRefs.length > 0 ? 'taxMapping' : adapter?.requiresAccountMapping ? 'accountMapping' : 'mapping');
  }, [step, adapters.length, workbook, adapter, ctx, taxRefs.length]);

  return {
    step,
    adapter,
    ctx,
    workbook,
    worksheetName,
    sheet,
    mapping,
    confirmParams,
    accountRefs,
    taxRefs,
    profileAccountMappings,
    profileTaxMappings,
    accountMappingSelections,
    taxMappingSelections,
    duplicateStrategy,
    rows,
    summary,
    loading,
    error,
    batch,
    duplicateFileWarning,
    setDuplicateStrategy,
    selectAdapter,
    uploadFile,
    selectWorksheet,
    confirmTarget,
    initializeMapping,
    setMapping,
    applyMappingProfile,
    proceedFromMapping,
    confirmAccountMapping,
    confirmTaxMapping,
    runValidation,
    confirmImport,
    reset,
    goBack,
  };
}
