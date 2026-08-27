import { MarketingPageShell } from '../../components/MarketingPageShell';
import { OwnerReviewNotice } from '../../components/OwnerReviewNotice';
import { SectionHeading } from '../../components/SectionHeading';

/**
 * /legal/security — public website completion pass. States only real,
 * verifiable technical facts (HTTPS, Supabase-backed storage, real
 * role-based access control, real append-only audit trail) and
 * explicitly does not claim any certification (SOC2/ISO27001/PCI-DSS),
 * penetration testing, or bug-bounty programme — none were found
 * anywhere in this codebase or its docs.
 */
export function SecurityPage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading align="left" headingTag="h1" kicker="Legal" title="Security" description="What Vertex does today to protect your data, and what is not yet in place." />

        <div className="mt-12 flex max-w-3xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">In transit and at rest</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Vertex is served over HTTPS, and application data is stored in a Supabase-managed Postgres database.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Access control</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every user signs in with their own account. Within a company, access can be scoped by role — admin,
              accountant, manager, operator or view-only — and changes to accounting records are written to an append-only
              audit trail that cannot be edited or deleted after the fact.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Not yet in place</h2>
            <OwnerReviewNotice label="Not yet in place">
              Vertex does not currently hold or claim any third-party security certification (such as SOC 2 or ISO 27001),
              has not published the results of an independent penetration test, and does not operate a bug-bounty
              programme. A formal incident-response and breach-notification procedure has also not yet been published.
            </OwnerReviewNotice>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Reporting a concern</h2>
            <OwnerReviewNotice label="Reporting a concern">
              No dedicated security-disclosure contact or process has been published yet — this needs a real, monitored
              address from the business owner before it can be listed here.
            </OwnerReviewNotice>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
