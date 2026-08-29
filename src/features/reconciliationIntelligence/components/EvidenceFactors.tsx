import type { ReconciliationEvidenceFactor } from '@/types';

/**
 * PART D / PART H — renders a candidate's `evidenceData.factors` as a
 * two-part breakdown: the met factors ("Why:") and the unmet ones
 * ("Potential concern:"). Never a bare percentage with no basis. Order is
 * whatever the engine produced (already deterministic).
 */
export function EvidenceFactors({ factors, className }: { factors: ReconciliationEvidenceFactor[] | undefined; className?: string }) {
  if (!factors || factors.length === 0) return null;
  const met = factors.filter((f) => f.met);
  const unmet = factors.filter((f) => !f.met);

  return (
    <div className={className}>
      {met.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Why:</p>
          <ul className="flex flex-col gap-0.5 text-xs">
            {met.map((f) => (
              <li key={f.key} className="text-status-positive">
                ✓ {f.label}
                {f.observedValue !== undefined ? <span className="text-muted-foreground"> — {String(f.observedValue)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {unmet.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Potential concern:</p>
          <ul className="flex flex-col gap-0.5 text-xs">
            {unmet.map((f) => (
              <li key={f.key} className="text-status-warning">
                ⚠ {f.label}
                {f.observedValue !== undefined ? <span className="text-muted-foreground"> — {String(f.observedValue)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
