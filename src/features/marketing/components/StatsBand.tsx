import { stats } from '../content';

/** Ported verbatim from accounting-v0-frontend/components/landing/stats-band.tsx. */
export function StatsBand() {
  return (
    <section aria-label="Key numbers" className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-2 bg-background p-6 md:p-7">
            <dt className="order-2 text-sm leading-relaxed text-muted-foreground">{stat.label}</dt>
            <dd className="order-1 text-3xl font-semibold tracking-tight text-brand md:text-4xl">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
