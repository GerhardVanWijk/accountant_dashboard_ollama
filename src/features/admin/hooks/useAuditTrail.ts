import { useCallback, useEffect, useState } from 'react';
import type { AuditLogEntry, Profile } from '@/types';
import { auditLogService } from '@/services/auditLogService';
import { profileService } from '@/features/auth/services';

export interface UseAuditTrailResult {
  entries: AuditLogEntry[];
  /** userId -> a real Profile, for resolving "who". Entries whose userId has no matching profile (e.g. the `SYSTEM_USER_ID = 'system'` sentinel some still-Mock-backed services pass) are left unresolved — the page falls back to showing the raw id rather than inventing a name. */
  profilesById: Map<string, Profile>;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> Hook -> Service chain for the real, cross-cutting business
 * Audit Trail (`AuditLogEntry` via `src/services/auditLogService.ts`) —
 * the append-only log every accounting/admin service writes to
 * (docs/SA_ACCOUNTING_MASTER_SPEC.md §37). Distinct from the separate
 * `audit_logs_access` log `AuditPage.tsx` already shows (M10 — different
 * audit domain, not merged). `getAll()` has no company filter of its own
 * (RLS scopes it); `profileService.getByCompany()` resolves userId -> a
 * display name for the same company's users only, which is fine since
 * every real writer here passes an actor within the caller's own company.
 */
export function useAuditTrail(companyId: string | undefined): UseAuditTrailResult {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entryList, profiles] = await Promise.all([auditLogService.getAll(), companyId ? profileService.getByCompany(companyId) : Promise.resolve([])]);
      setEntries(entryList);
      setProfilesById(new Map(profiles.map((p) => [p.id, p])));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load the audit trail'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { entries, profilesById, loading, error, refetch };
}
