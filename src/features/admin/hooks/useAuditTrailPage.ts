import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditLogEntry, Profile } from '@/types';
import { auditLogService } from '@/services/auditLogService';
import { profileService } from '@/features/auth/services';
import type { AuditLogPageQuery } from '@/repositories/IAuditLogRepository';

export const AUDIT_PAGE_SIZE = 25;

export interface AuditTrailFilters {
  module?: string;
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface UseAuditTrailPageResult {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  filters: AuditTrailFilters;
  setFilters: (next: AuditTrailFilters) => void;
  profilesById: Map<string, Profile>;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Server-paged, server-filtered Audit Trail feed. The browser never holds
 * more than one page (`AUDIT_PAGE_SIZE`) of `audit_log_entries` — the
 * filter + `range` run in Postgres (migration 0072 indexes).
 */
export function useAuditTrailPage(companyId: string | undefined): UseAuditTrailPageResult {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(0);
  const [filters, setFiltersState] = useState<AuditTrailFilters>({});
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    profileService
      .getByCompany(companyId)
      .then((profiles) => {
        if (!cancelled) setProfilesById(new Map(profiles.map((p) => [p.id, p])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    const query: AuditLogPageQuery = {
      page,
      pageSize: AUDIT_PAGE_SIZE,
      module: filters.module || undefined,
      action: filters.action || undefined,
      userId: filters.userId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: filters.search || undefined,
    };
    auditLogService
      .getPage(query)
      .then((result) => {
        if (requestId !== latestRequest.current) return;
        setEntries(result.rows);
        setTotal(result.total);
      })
      .catch((err) => {
        if (requestId !== latestRequest.current) return;
        setError(err instanceof Error ? err : new Error('Failed to load the audit trail'));
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, [companyId, page, filters, reloadToken]);

  const setPage = useCallback((next: number) => setPageState(Math.max(0, next)), []);
  const setFilters = useCallback((next: AuditTrailFilters) => {
    setFiltersState(next);
    setPageState(0);
  }, []);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)), [total]);

  return {
    entries,
    total,
    page,
    pageCount,
    setPage,
    filters,
    setFilters,
    profilesById,
    loading,
    error,
    refetch,
  };
}
