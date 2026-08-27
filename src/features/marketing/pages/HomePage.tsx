import { Comparison } from '../components/Comparison';
import { Faq } from '../components/Faq';
import { Features } from '../components/Features';
import { FinalCta } from '../components/FinalCta';
import { Hero } from '../components/Hero';
import { LogoCloud } from '../components/LogoCloud';
import { Pricing } from '../components/Pricing';
import { Showcase } from '../components/Showcase';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { StatsBand } from '../components/StatsBand';

/**
 * Public marketing homepage — ported from
 * accounting-v0-frontend/app/page.tsx (M6, see
 * docs/SUPABASE_MIGRATION_GUIDE.md's sibling UI-port initiative). Rendered
 * at path `/` by RouteGuard for an unauthenticated visitor only — an
 * authenticated user hitting `/` still sees the real Dashboard exactly as
 * before, unchanged. Content/section order preserved verbatim per the
 * user's explicit "do not redesign/rebuild" instruction; only the CTA
 * destinations were rewired (src/features/marketing/content.ts) to this
 * app's real /login, /signup and (new) /demo routes.
 *
 * CONTENT INTEGRITY PASS: the Testimonials section was removed (not
 * reworded) — its three named people/quotes were v0 template fiction and
 * this product has no real customers yet to quote honestly, so there was
 * no truthful way to keep the section. Confirmed with the user before
 * removing rather than assumed. Every other section is unchanged in
 * order/structure; see content.ts's own doc comment for the copy audit.
 */
export function HomePage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
        <LogoCloud />
        <StatsBand />
        <Features />
        <Showcase />
        <Comparison />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
