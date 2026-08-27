import { TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Callout used on legal/company pages for anything this codebase cannot
 * establish as fact (compliance certifications, registered addresses,
 * a Data/Information Officer, specific legal undertakings). Public
 * website completion pass: per the explicit instruction not to fabricate
 * legal promises, every legal page marks its unresolved sections with
 * this instead of inventing language. Uses the existing status-warning
 * design tokens (src/components/app/status-badge.tsx's family), not a
 * new color.
 */
export function OwnerReviewNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-status-warning-outline bg-status-warning-muted px-4 py-3.5 text-sm text-status-warning">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
