import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type {
  ColumnMapping,
  DuplicateStrategy,
  ImportAdapter,
  ImportExecutionSummary,
  ImportRowResult,
  ParsedWorkbook,
} from '../types';
import { parseImportFile, ImportFileError } from '../parsers/fileParser';
import { suggestColumnMapping, mapRow } from '../mapping';
import { recordImportAudit } from '../services/importAuditService';

export type WizardStep = 'type' | 'file' | 'worksheet' | 'target' | 'mapping' | 'review' | 'result';

/**
 * Drives one adapter through the full pipeline (spec §2): file → parse →
 * worksheet → preview/map → validate → duplicate detection → review →
 * confirm → execute → result. `ImportWizard` (components/) is the only UI
 * that owns this; every step here is plain data so it's independently
 * testable without rendering anything.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the wizard is adapter-agnostic; the concrete T/C are fixed once `selectAdapter` narrows to one real adapter.
export function useImportWizard(adapters: ImportAdapter<any, any>[]) {
  const actorUserId = useAuthStore((s) => s.session?.user.id ?? 'system');

  const [step, setStep] = useState<WizardStep>(adapters.length === 1 ? 'file' : 'type');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the module-level disable above.
  const [adapter, setAdapter] = useState<ImportAdapter<any, any> | undefined>(adapters.length === 1 ? adapters[0] : undefined);
  const [ctx, setCtx] = useState<unknown>(undefined);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | undefined>(undefined);
  const [worksheetName, setWorksheetName] = useState<string | undefined>(undefined);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [confirmParams, setConfirmParams] = useState<Record<string, unknown>>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [rows, setRows] = useState<ImportRowResult<unknown>[]>([]);
  const [summary, setSummary] = useState<ImportExecutionSummary | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const sheet = useMemo(() => (workbook && worksheetName ? workbook.getSheet(worksheetName) : undefined), [workbook, worksheetName]);

  /** Loads `next`'s context without touching `step` — the one thing both `selectAdapter()` (Type step) and the single-adapter mount effect below need, kept separate so the mount effect's `setStep('file')`-free load can never race a later user action and clobber whatever step they've since moved to. */
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

  // Single-adapter callers (e.g. a page's own "Import" button wired to one
  // specific adapter) skip the Type step entirely, so nothing else ever
  // calls `selectAdapter()` for them — load that adapter's context here
  // instead, once, or `normalizeRow()`/`detectDuplicates()` would run
  // against an undefined `ctx` the moment mapping finishes. Uses
  // `loadAdapterContext`, not `selectAdapter`, specifically so it never
  // forces `step` back to `'file'` if this load is still in flight when
  // the user has already uploaded a file (real reference-data fetches can
  // plausibly outlast reading a small CSV).
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
  }, [adapter, ctx]);

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

  const runValidation = useCallback(() => {
    if (!sheet || !adapter) return;
    setError(undefined);
    const results: ImportRowResult<unknown>[] = sheet.rows.map((row, i) => {
      const rawMapped = mapRow(row, mapping, adapter.fields);
      const rowNumber = i + 2; // header is row 1
      const { normalized, messages } = adapter.normalizeRow(rawMapped, rowNumber, ctx);
      const severity = !normalized ? 'error' : messages.some((m) => m.severity === 'error') ? 'error' : 'valid';
      return { rowNumber, raw: rawMapped, normalized, severity, messages };
    });
    const withDuplicates = adapter.detectDuplicates(results, ctx);
    setRows(withDuplicates);
    setStep('review');
  }, [sheet, adapter, mapping, ctx]);

  const confirmImport = useCallback(async () => {
    if (!adapter || !workbook) return;
    setError(undefined);
    setLoading(true);
    try {
      const result = await adapter.execute(rows, ctx, { duplicateStrategy, actorUserId, params: confirmParams });
      setSummary(result);
      setStep('result');
      await recordImportAudit({ adapterId: adapter.id, adapterLabel: adapter.label, fileName: workbook.fileName, actorUserId, summary: result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed.');
    } finally {
      setLoading(false);
    }
  }, [adapter, workbook, rows, ctx, duplicateStrategy, actorUserId, confirmParams]);

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
    setRows([]);
    setSummary(undefined);
    setError(undefined);
  }, [adapters.length]);

  const goBack = useCallback(() => {
    setError(undefined);
    if (step === 'file' && adapters.length > 1) setStep('type');
    else if (step === 'worksheet') setStep('file');
    else if (step === 'target') setStep(workbook && workbook.worksheetNames.length > 1 ? 'worksheet' : 'file');
    else if (step === 'mapping') setStep(adapter?.confirmFields && adapter.confirmFields(ctx).length > 0 ? 'target' : workbook && workbook.worksheetNames.length > 1 ? 'worksheet' : 'file');
    else if (step === 'review') setStep('mapping');
  }, [step, adapters.length, workbook, adapter, ctx]);

  return {
    step,
    adapter,
    ctx,
    workbook,
    worksheetName,
    sheet,
    mapping,
    confirmParams,
    duplicateStrategy,
    rows,
    summary,
    loading,
    error,
    setDuplicateStrategy,
    selectAdapter,
    uploadFile,
    selectWorksheet,
    confirmTarget,
    initializeMapping,
    setMapping,
    runValidation,
    confirmImport,
    reset,
    goBack,
  };
}
