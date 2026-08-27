import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { brand } from '../content';

/**
 * Ported from accounting-v0-frontend/components/landing/final-cta.tsx —
 * <a href> CTAs swapped for react-router Link. Content-integrity pass:
 * removed the fabricated "Trusted by 12 400+ businesses" stat and
 * unverifiable support-hours claim, the "specialist beside you" /
 * "thirty days free, no card" copy (no onboarding-specialist service or
 * trial/billing system exists), and repointed the CTAs the same way as
 * Hero.tsx (primary -> /demo, secondary -> real /login).
 */
export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
      <div className="relative overflow-hidden rounded-3xl border border-brand/25 bg-card/50 px-6 py-14 md:px-14 md:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-32 h-72 opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(50% 50% at 50% 50%, var(--brand) 0%, transparent 70%)' }}
        />
        <div className="relative flex flex-col items-center gap-7 text-center">
          <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">See your books in Vertex before you commit to anything</h2>
          <p className="max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">
            Explore a full, read-only walkthrough of {brand.fullName} with real sample data — invoicing, banking, VAT and payroll, exactly as they work in the product.
          </p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row">
            <Button render={<Link to={brand.demoHref} />} nativeButton={false} className="h-12 bg-brand px-6 text-[0.95rem] text-brand-foreground hover:bg-brand/90">
              {brand.ctaPrimary}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button render={<Link to={brand.signInHref} />} nativeButton={false} variant="outline" className="h-12 px-6 text-[0.95rem]">
              {brand.ctaSecondary}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
