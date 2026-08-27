import { InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Callout used on legal/company pages for anything this codebase cannot
 * establish as fact (compliance certifications, registered addresses,
 * a Data/Information Officer, specific legal undertakings) — per the
 * explicit instruction not to fabricate legal promises, every legal
 * page marks its unresolved sections with this instead of inventing
 * language.
 *
 * Visual QA pass: the first version used the status-warning tokens for
 * the whole paragraph (orange/amber text on an amber background), which
 * read as a build-tool/lint warning banner rather than an intentional
 * piece of page content. Redesigned as a quiet editorial aside instead —
 * neutral card background (matches the app-mock/FAQ panels elsewhere on
 * this site), body copy in the same muted-foreground used by every other
 * paragraph on the page, and a small brand-colored label using the exact
 * "kicker" typographic recipe SectionHeading already establishes
 * (text-xs font-medium tracking-[0.16em] uppercase text-brand) — so it
 * reads as "the site's own way of flagging a note," not a foreign
 * warning-colored component bolted on.
 */
export function OwnerReviewNotice({ children, label = 'Pending review' }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/40 px-5 py-4">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium tracking-[0.16em] text-brand uppercase">{label}</span>
        <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
