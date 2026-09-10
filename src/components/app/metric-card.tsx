import type { LucideIcon } from 'lucide-react';

import { StatTile } from '@/components/app/stat-tile';

/**
 * Thin compatibility wrapper over the shared `StatTile` (global compact-UI
 * pass — one KPI primitive, not two). Kept for the callers that pass an
 * already-formatted `formattedValue` + optional `trendPercent`; new code
 * should use `StatTile` / `StatStrip` directly.
 */
export function MetricCard({
  label,
  formattedValue,
  trendPercent,
  higherIsBetter = true,
  hint,
  icon,
  className,
}: {
  label: string;
  formattedValue: string;
  /** Omit when there's no real comparative figure to show. */
  trendPercent?: number;
  higherIsBetter?: boolean;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <StatTile
      icon={icon}
      label={label}
      value={formattedValue}
      hint={hint}
      trendPercent={trendPercent}
      higherIsBetter={higherIsBetter}
      className={className}
    />
  );
}
