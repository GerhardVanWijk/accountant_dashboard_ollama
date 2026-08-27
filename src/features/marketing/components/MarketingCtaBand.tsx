import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { brand } from '../content';

/**
 * Shared closing CTA panel for public sub-pages (product/legal/company/
 * resources) — reuses FinalCta.tsx's exact panel classes rather than
 * inventing a new visual treatment, just with page-specific heading/body
 * text. Always points at the real /demo and /login routes, never /signup
 * (no live trial/billing exists — see content.ts's doc comment).
 */
export function MarketingCtaBand({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
      <div className="relative overflow-hidden rounded-3xl border border-brand/25 bg-card/50 px-6 py-14 md:px-14 md:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-32 h-72 opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(50% 50% at 50% 50%, var(--brand) 0%, transparent 70%)' }}
        />
        <div className="relative flex flex-col items-center gap-7 text-center">
          <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
          <p className="max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">{body}</p>
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
