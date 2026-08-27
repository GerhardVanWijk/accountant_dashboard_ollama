import { Link } from 'react-router-dom';

import { MarketingPageShell } from '../../components/MarketingPageShell';
import { OwnerReviewNotice } from '../../components/OwnerReviewNotice';
import { SectionHeading } from '../../components/SectionHeading';

/**
 * /legal/privacy — public website completion pass. Only states what this
 * codebase can actually verify (Supabase-backed storage, what data the
 * app collects, HTTPS in transit). Everything requiring a real legal/
 * compliance decision (retention periods, sub-processors, data-subject
 * request process, DPO/Information Officer contact) is flagged with
 * OwnerReviewNotice rather than invented — per the explicit instruction
 * not to fabricate legal promises.
 */
export function PrivacyPolicyPage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading align="left" kicker="Legal" title="Privacy Policy" description="Last reviewed: not yet published. This page is a working draft pending legal review." />

        <div className="mt-12 flex max-w-3xl flex-col gap-8">
          <OwnerReviewNotice>
            This Privacy Policy has not been drafted or approved by Vertex's legal counsel. It describes only what is verifiably
            true of the application today. It should not be relied on as a complete or binding privacy policy until reviewed and
            completed by the business owner and legal counsel.
          </OwnerReviewNotice>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">What data Vertex collects</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              To provide the service, Vertex collects the account information you provide when signing in (name and email
              address) and the business/accounting records you or your team enter into the application — company details,
              customers, suppliers, invoices, bank transactions, payroll records and similar financial data.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">How data is stored</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Application data is stored in a Supabase-managed database and transmitted over HTTPS. Access within the
              application is controlled by role-based permissions, and changes to accounting records are recorded in an
              audit trail.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">What this page does not yet cover</h2>
            <OwnerReviewNotice>
              The following require a decision or confirmation from the business owner before they can be published as fact:
              exact data retention periods, the list of any third-party sub-processors, the physical hosting region(s) for the
              underlying database, the process for a data subject to request access, correction or deletion of their data, and
              a named contact responsible for privacy requests.
            </OwnerReviewNotice>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Contact</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A dedicated privacy contact has not yet been published — see{' '}
              <Link to="/company/contact" className="font-medium text-brand hover:underline">
                Contact
              </Link>{' '}
              in the meantime.
            </p>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
