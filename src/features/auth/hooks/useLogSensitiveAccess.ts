import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { auditLogAccessService } from '@/features/auth/services';

/**
 * Records one "entered a security-sensitive area" access-log row when a
 * page mounts (Access Log — `audit_logs_access`). The `log_access_event`
 * RPC de-dupes server-side to one row per user/area per 24h, and this
 * hook additionally guards against a double-fire inside the same mount.
 *
 * Use ONLY on genuinely sensitive pages (Users & Roles, Audit Trail,
 * Access Log, Accounting Settings, Plan & Billing, Payroll, Tax, Superuser
 * console) — never on ordinary module pages, or the log fills with
 * low-value navigation rows.
 */
export function useLogSensitiveAccess(area: string, detail?: Record<string, unknown>): void {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const loggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!authed || loggedFor.current === area) return;
    loggedFor.current = area;
    auditLogAccessService.logSensitiveView(area, detail);
    // `detail` is intentionally not a dep — it's context for the first log only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, area]);
}
