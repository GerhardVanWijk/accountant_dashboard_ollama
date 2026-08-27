import { Link } from 'react-router-dom';

import { MarketingPageShell } from '../../components/MarketingPageShell';
import { OwnerReviewNotice } from '../../components/OwnerReviewNotice';
import { SectionHeading } from '../../components/SectionHeading';

/**
 * /legal/popia — public website completion pass. Deliberately does NOT
 * assert "Vertex is POPIA compliant" — no evidence of a registered
 * Information Officer, a documented lawful-processing basis, or a
 * data-subject-rights process was found anywhere in this codebase. States
 * what POPIA requires and what Vertex has/has not yet done to address it,
 * rather than a blanket compliance claim.
 */
export function PopiaStatementPage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading
          align="left"
          kicker="Legal"
          title="POPIA statement"
          description="South Africa's Protection of Personal Information Act (POPIA) — where Vertex stands today."
        />

        <div className="mt-12 flex max-w-3xl flex-col gap-8">
          <OwnerReviewNotice>
            Vertex does not currently claim to be POPIA compliant. This page explains what POPIA requires and is honest about
            what has and has not yet been put in place — it is not a substitute for a formal compliance assessment.
          </OwnerReviewNotice>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">What POPIA is</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              POPIA sets conditions for how South African organisations may lawfully collect, use, store and share personal
              information, and gives individuals rights over their own data — including the right to know what is held about
              them and to request it be corrected or deleted.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">What Vertex processes</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Using Vertex means entering personal information belonging to you, your team and your customers or suppliers —
              names, contact details and financial records — into the application, stored via Supabase and transmitted over
              HTTPS. See{' '}
              <Link to="/legal/privacy" className="font-medium text-brand hover:underline">
                Privacy Policy
              </Link>{' '}
              for what is collected.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Not yet in place</h2>
            <OwnerReviewNotice>
              The following are required for a genuine POPIA compliance position and have not yet been established: a
              registered Information Officer, a documented lawful basis for each category of processing, a data-subject
              access/correction/deletion request process, an operator agreement template for accounting firms acting on a
              client's behalf, and a breach-notification procedure. These need business-owner and legal input before this
              page can make a compliance claim.
            </OwnerReviewNotice>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
