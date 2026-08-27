import type { LucideIcon } from 'lucide-react';

import { MarketingCtaBand } from './MarketingCtaBand';
import { MarketingPageShell } from './MarketingPageShell';
import { SectionHeading } from './SectionHeading';

export interface ProductCapability {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * Shared layout for the six /product/* pages — reuses Features.tsx's
 * card-grid classes (rounded-2xl border border-border bg-card/40 p-6)
 * verbatim, not a new visual pattern. `notIncluded` exists specifically
 * so each product page can be explicit about what it does NOT do
 * (no live bank feeds, no OCR, no eFiling submission, etc.) in the same
 * visual language as what it does — the public-website-completion
 * instructions require every capability claim to be verified against
 * the real app, and the honest complement of that is stating the real
 * boundaries just as plainly.
 */
export function ProductPageTemplate({
  kicker,
  title,
  description,
  capabilities,
  notIncluded,
  ctaTitle,
  ctaBody,
}: {
  kicker: string;
  title: string;
  description: string;
  capabilities: ProductCapability[];
  notIncluded: string[];
  ctaTitle: string;
  ctaBody: string;
}) {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading kicker={kicker} title={title} description={description} />

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability) => (
            <div key={capability.title} className="flex flex-col gap-4 rounded-2xl border border-border bg-card/40 p-6">
              <span className="flex size-10 items-center justify-center rounded-xl border border-brand/20 bg-brand-muted text-brand">
                <capability.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-medium tracking-tight">{capability.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{capability.body}</p>
            </div>
          ))}
        </div>

        {notIncluded.length > 0 ? (
          <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-border bg-card/20 p-6">
            <h3 className="text-sm font-semibold tracking-wide text-foreground uppercase">Not part of Vertex today</h3>
            <ul className="flex flex-col gap-2">
              {notIncluded.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground/60">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <MarketingCtaBand title={ctaTitle} body={ctaBody} />
    </MarketingPageShell>
  );
}
