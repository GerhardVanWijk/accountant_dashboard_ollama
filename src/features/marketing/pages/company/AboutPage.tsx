import { MarketingCtaBand } from '../../components/MarketingCtaBand';
import { MarketingPageShell } from '../../components/MarketingPageShell';
import { OwnerReviewNotice } from '../../components/OwnerReviewNotice';
import { SectionHeading } from '../../components/SectionHeading';
import { brand } from '../../content';

/**
 * /company/about — public website completion pass. Describes the real
 * product (already truth-audited elsewhere in this file tree) rather
 * than a founding story, team bios or company history — none of that
 * exists anywhere in this codebase to draw from honestly, so it is
 * flagged for the business owner rather than invented.
 */
export function AboutPage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading align="left" headingTag="h1" kicker="Company" title={`About ${brand.name}`} description="Cloud accounting built for South African business." />

        <div className="mt-12 flex max-w-3xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">What we're building</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {brand.fullName} is cloud accounting software built specifically for South African compliance — invoicing in
              rands, bank statement import and reconciliation, VAT preparation, payroll on verified SARS tables, and real
              financial reporting. Made in Cape Town.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Where we are today</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Vertex is a product in active development, not yet generally available for self-service signup — there is no
              live billing system today. You can explore the full product through the live demo.
            </p>
          </div>

          <OwnerReviewNotice label="Needs owner input">
            This page does not include a founding story, team information or company registration details — none of that
            exists in the application to describe accurately yet. Add real information here once it is available, rather
            than a placeholder narrative.
          </OwnerReviewNotice>
        </div>
      </section>

      <MarketingCtaBand title="See the product for yourself" body="Explore invoicing, banking, VAT and payroll in the live demo." />
    </MarketingPageShell>
  );
}
