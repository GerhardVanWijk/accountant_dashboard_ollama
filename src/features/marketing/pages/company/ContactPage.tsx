import { Link } from 'react-router-dom';

import { MarketingPageShell } from '../../components/MarketingPageShell';
import { OwnerReviewNotice } from '../../components/OwnerReviewNotice';
import { SectionHeading } from '../../components/SectionHeading';
import { brand } from '../../content';

/**
 * /company/contact — public website completion pass. No real support
 * email, phone number or physical address was found anywhere in this
 * repository — grepped for contact@/support@/hello@/info@ and found
 * nothing. Rather than invent one (which would silently swallow real
 * visitor messages), this page is honest that there is no live contact
 * channel yet and points at the one real thing that does work: the
 * live demo.
 */
export function ContactPage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading align="left" kicker="Company" title="Contact" description="How to reach us." />

        <div className="mt-12 flex max-w-3xl flex-col gap-8">
          <OwnerReviewNotice>
            There is no published contact email, phone number or working contact form yet — none exists anywhere in this
            application today, so nothing is listed here rather than showing an address that would not reach anyone. Add
            a real, monitored contact channel before this page goes live to real visitors.
          </OwnerReviewNotice>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">In the meantime</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You can explore {brand.fullName} yourself through the{' '}
              <Link to={brand.demoHref} className="font-medium text-brand hover:underline">
                live demo
              </Link>
              , or{' '}
              <Link to={brand.signInHref} className="font-medium text-brand hover:underline">
                sign in
              </Link>{' '}
              if you already have an account.
            </p>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
