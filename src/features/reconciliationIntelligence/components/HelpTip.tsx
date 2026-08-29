import { HelpCircle } from 'lucide-react';
import { RECON_TOOLTIPS, type ReconTooltipKey } from '../reconciliationTooltips';

/**
 * PART P — a small inline help affordance for state chips and metric labels.
 * Uses a native `title` (the base-ui Tooltip primitive has no Provider wired
 * at the app root, and the brief explicitly allows `title=`). The text also
 * goes on `aria-label` so it is reachable without hover.
 */
export function HelpTip({ tip, className }: { tip: ReconTooltipKey; className?: string }) {
  const text = RECON_TOOLTIPS[tip];
  return (
    <span title={text} aria-label={text} className={className} role="img">
      <HelpCircle className="inline size-3 align-text-top text-muted-foreground" aria-hidden="true" />
    </span>
  );
}
