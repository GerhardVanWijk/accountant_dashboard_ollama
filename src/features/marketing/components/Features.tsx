import { FileTextIcon, LandmarkIcon, PackageIcon, ReceiptIcon, ShieldCheckIcon, UsersIcon, type LucideIcon } from 'lucide-react';

import { features } from '../content';
import { SectionHeading } from './SectionHeading';

const icons: Record<string, LucideIcon> = {
  FileText: FileTextIcon,
  Landmark: LandmarkIcon,
  Receipt: ReceiptIcon,
  Package: PackageIcon,
  Users: UsersIcon,
  ShieldCheck: ShieldCheckIcon,
};

/** Ported verbatim from accounting-v0-frontend/components/landing/features.tsx. */
export function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
      <SectionHeading
        kicker="Everything in one place"
        title="The full set of books, without the desktop install"
        description="Vertex covers the day-to-day work of running a compliant South African business — and nothing you will never use."
      />

      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = icons[feature.icon] ?? FileTextIcon;
          return (
            <div key={feature.title} className="group flex flex-col gap-4 rounded-2xl border border-border bg-card/40 p-6 transition-colors hover:border-brand/30 hover:bg-card/70">
              <span className="flex size-10 items-center justify-center rounded-xl border border-brand/20 bg-brand-muted text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-medium tracking-tight">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
