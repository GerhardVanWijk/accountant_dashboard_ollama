import { Link } from 'react-router-dom';

import { MarketingPageShell } from '../../components/MarketingPageShell';
import { OwnerReviewNotice } from '../../components/OwnerReviewNotice';
import { SectionHeading } from '../../components/SectionHeading';
import { brand } from '../../content';

/**
 * /legal/terms — public website completion pass. A binding Terms of
 * Service is a legal contract this codebase cannot draft; this page
 * describes the service honestly and flags every substantively legal
 * section (liability, dispute resolution, termination) for owner/legal
 * drafting instead of inventing contract language.
 */
export function TermsOfServicePage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading align="left" kicker="Legal" title="Terms of Service" description="Last reviewed: not yet published. This page is a working draft pending legal review." />

        <div className="mt-12 flex max-w-3xl flex-col gap-8">
          <OwnerReviewNotice>
            These Terms of Service have not been drafted or approved by legal counsel and are not a binding contract. Do not
            rely on this page as a complete legal agreement until it has been reviewed and finalised.
          </OwnerReviewNotice>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">1. About the service</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {brand.fullName} ("Vertex") is cloud accounting software for South African businesses, covering invoicing,
              bank statement import and reconciliation, VAT preparation, payroll and financial reporting. See{' '}
              <Link to="/#features" className="font-medium text-brand hover:underline">
                Features
              </Link>{' '}
              for what is currently available.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">2. Accounts</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Access to the application requires a real, working sign-in. There is no live public self-service billing or
              subscription system today — see{' '}
              <Link to="/#pricing" className="font-medium text-brand hover:underline">
                Pricing
              </Link>{' '}
              for the current, indicative-only status.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">3. Your data</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You remain responsible for the accuracy of financial data you enter. See{' '}
              <Link to="/legal/privacy" className="font-medium text-brand hover:underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link to="/legal/popia" className="font-medium text-brand hover:underline">
                POPIA statement
              </Link>{' '}
              for how data is handled.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">4. Not yet drafted</h2>
            <OwnerReviewNotice>
              The following sections require legal drafting and are not covered by this page: limitation of liability,
              indemnification, warranty disclaimers, suspension and termination conditions, governing law and dispute
              resolution, and acceptable-use restrictions. Treat none of these as agreed until published.
            </OwnerReviewNotice>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
