import { useCallback, useState } from 'react';
import type { BankStatement } from '@/types';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import { useAuthStore } from '@/stores/authStore';
import { statementImportService } from '../services';
import type { StatementImportPreview } from '../services';
import type { StatementFileFormat } from '../types';

/**
 * State machine for the persistent statement-import wizard (P1.5 / PART K):
 *
 *   idle → previewing → preview-ready → confirming → done
 *                     ↘ error (from previewing or confirming) ↗
 *
 * `preview` reads the file, parses + fingerprints it via
 * `statementImportService.previewImport` and WRITES NOTHING. `confirm` then
 * persists exactly one `BankStatement` + its lines — no GL, no
 * `bank_transactions`. Import and reconciliation are separate steps.
 */
export type StatementImportStatus =
  | 'idle'
  | 'previewing'
  | 'preview-ready'
  | 'confirming'
  | 'done'
  | 'error';

export interface UseStatementImportResult {
  status: StatementImportStatus;
  /** The current preview result — populated once `status` reaches `preview-ready`, cleared on `reset` / a failed preview. */
  preview: StatementImportPreview | null;
  /** The created statement, set once `status` reaches `done`. */
  statement: BankStatement | null;
  /** Line count of the created statement, set alongside `statement`. */
  lineCount: number | null;
  error: string | null;
  /** Read the file, parse + fingerprint it. Persists nothing. */
  runPreview: (file: File, bankAccountId: string, formatOverride?: StatementFileFormat) => Promise<void>;
  /** Persist the previewed statement. `allowDuplicate` is required when `preview.duplicateOf` is set. */
  confirm: (opts?: { allowDuplicate?: boolean; currency?: string }) => Promise<void>;
  reset: () => void;
}

export function useStatementImport(): UseStatementImportResult {
  const profile = useAuthStore((s) => s.profile);
  const [status, setStatus] = useState<StatementImportStatus>('idle');
  const [preview, setPreview] = useState<StatementImportPreview | null>(null);
  const [statement, setStatement] = useState<BankStatement | null>(null);
  const [lineCount, setLineCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setPreview(null);
    setStatement(null);
    setLineCount(null);
    setError(null);
  }, []);

  const runPreview = useCallback(
    async (file: File, bankAccountId: string, formatOverride?: StatementFileFormat) => {
      setStatus('previewing');
      setError(null);
      setPreview(null);
      setStatement(null);
      setLineCount(null);
      try {
        const content = await file.text();
        const result = await statementImportService.previewImport(
          bankAccountId,
          file.name,
          content,
          formatOverride,
        );
        setPreview(result);
        setStatus('preview-ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read this statement file.');
        setStatus('error');
      }
    },
    [],
  );

  const confirm = useCallback(
    async (opts?: { allowDuplicate?: boolean; currency?: string }) => {
      if (!preview) {
        setError('Preview a statement before confirming the import.');
        setStatus('error');
        return;
      }
      setStatus('confirming');
      setError(null);
      try {
        const importedBy = profile?.email ?? profile?.id ?? SYSTEM_USER_ID;
        const result = await statementImportService.confirmImport(
          preview.bankAccountId,
          preview,
          importedBy,
          opts,
        );
        setStatement(result.statement);
        setLineCount(result.lineCount);
        setStatus('done');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not import this statement.');
        setStatus('error');
      }
    },
    [preview, profile],
  );

  return { status, preview, statement, lineCount, error, runPreview, confirm, reset };
}
