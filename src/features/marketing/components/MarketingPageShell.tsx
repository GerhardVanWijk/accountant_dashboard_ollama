import type { ReactNode } from 'react';

import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * Shared wrapper for every public marketing page beyond the homepage
 * (public website completion pass) — hoists HomePage.tsx's exact
 * SiteHeader/main/SiteFooter markup so new pages reuse it instead of
 * duplicating it 14 times. Not a new visual pattern: the classes here
 * are copied verbatim from HomePage.tsx.
 */
export function MarketingPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </div>
  );
}
