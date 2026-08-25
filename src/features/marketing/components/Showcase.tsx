import { CheckIcon } from 'lucide-react';

import { showcase } from '../content';
import { SectionHeading } from './SectionHeading';
import { DashboardVisual, ReconcileVisual, VatVisual } from './ShowcaseVisuals';

const visuals = {
  dashboard: DashboardVisual,
  reconcile: ReconcileVisual,
  vat: VatVisual,
} as const;

/** Ported verbatim from accounting-v0-frontend/components/landing/showcase.tsx. */
export function Showcase() {
  return (
    <section id="product" className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
      <SectionHeading
        kicker="Inside the product"
        title="Built by people who have done a VAT return at 11pm"
        description="Three of the places Vertex saves the most time. Every screen is designed around how South African finance teams actually work."
      />

      <div className="mt-16 flex flex-col gap-16 md:gap-24">
        {showcase.map((item, index) => {
          const Visual = visuals[item.variant as keyof typeof visuals];
          const reversed = index % 2 === 1;
          return (
            <div key={item.title} className="flex flex-col items-center gap-8 lg:flex-row lg:gap-16">
              <div className={`flex w-full flex-col gap-5 lg:w-[42%] ${reversed ? 'lg:order-2' : ''}`}>
                <span className="text-xs font-medium tracking-[0.16em] text-brand uppercase">{item.kicker}</span>
                <h3 className="text-2xl leading-tight font-semibold tracking-tight text-balance md:text-3xl">{item.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{item.body}</p>
                <ul className="flex flex-col gap-3 pt-1">
                  {item.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand">
                        <CheckIcon className="size-3" aria-hidden="true" />
                      </span>
                      <span className="leading-relaxed text-muted-foreground">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`w-full lg:flex-1 ${reversed ? 'lg:order-1' : ''}`}>
                <Visual />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
