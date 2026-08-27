import { Link } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon, SparklesIcon } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { brand, hero } from '../content';
import { AppMock } from './AppMock';

/**
 * Ported from accounting-v0-frontend/components/landing/hero.tsx —
 * <a href> CTAs swapped for react-router Link. Content-integrity pass:
 * the primary CTA now leads to the read-only /demo page instead of
 * /signup (no real trial/billing exists), and the secondary CTA is a
 * real "Sign in" link instead of a second button that also silently
 * pointed at /signup under a "Book a live demo" label.
 */
export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] opacity-[0.18] blur-3xl"
        style={{ background: 'radial-gradient(50% 50% at 50% 50%, var(--brand) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(70% 60% at 50% 0%, black, transparent)',
        }}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-14 px-5 pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="flex max-w-3xl flex-col items-center gap-7 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-muted px-3.5 py-1.5 text-xs font-medium text-brand">
            <SparklesIcon className="size-3.5" aria-hidden="true" />
            {hero.eyebrow}
          </span>

          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl lg:text-[4.25rem]">
            {hero.headline} <span className="text-brand">{hero.headlineAccent}</span> {hero.headlineEnd}
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">{hero.subhead}</p>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button render={<Link to={brand.demoHref} />} nativeButton={false} className="h-12 bg-brand px-6 text-[0.95rem] text-brand-foreground hover:bg-brand/90">
              {brand.ctaPrimary}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button render={<Link to={brand.signInHref} />} nativeButton={false} variant="outline" className="h-12 px-6 text-[0.95rem]">
              {brand.ctaSecondary}
            </Button>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {hero.trustLine.map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CheckIcon className="size-3.5 text-brand" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <AppMock />
      </div>
    </section>
  );
}
