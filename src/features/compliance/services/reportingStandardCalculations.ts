import type { ReportingStandardVersion } from '@/types';

/**
 * Pure resolution logic shared by `ReportingStandardService.getApplicableVersion()`
 * (used server-side/by other services) and the Reporting Standards page (which
 * already has every version loaded and resolves client-side rather than
 * round-tripping through the service for a UI-only computation).
 *
 * `history` must already be filtered to ONE standard (`full_ifrs` or
 * `ifrs_for_smes`) — this function doesn't filter by standard itself.
 */
export function resolveApplicableVersion(
  history: ReportingStandardVersion[],
  periodStartDate: Date,
  earlyAdoptionElected = false,
): ReportingStandardVersion | undefined {
  const periodStartIso = periodStartDate.toISOString();

  if (earlyAdoptionElected) {
    const earlyAdopted = history
      .filter((v) => v.earlyAdoptionPermitted && v.effectiveFrom > periodStartIso)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    if (earlyAdopted) return earlyAdopted;
  }

  return history.filter((v) => v.effectiveFrom <= periodStartIso).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
