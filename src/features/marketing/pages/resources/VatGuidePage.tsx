import { Link } from 'react-router-dom';

import { MarketingCtaBand } from '../../components/MarketingCtaBand';
import { MarketingPageShell } from '../../components/MarketingPageShell';
import { OwnerReviewNotice } from '../../components/OwnerReviewNotice';
import { SectionHeading } from '../../components/SectionHeading';

/**
 * /resources/vat-guide — public website completion pass. General,
 * publicly-known VAT concepts (standard/zero-rated/exempt, the VAT201
 * return, the 15% rate) plus how Vertex's real engine handles them —
 * not tax advice, and not claiming any SARS submission capability.
 */
export function VatGuidePage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading align="left" kicker="Resources" title="A short guide to VAT in South Africa" description="How VAT works, and how Vertex helps you stay on top of it." />

        <div className="mt-12 flex max-w-3xl flex-col gap-8">
          <OwnerReviewNotice>
            This is general information, not tax advice. For guidance specific to your business, speak to a registered tax
            practitioner or SARS directly.
          </OwnerReviewNotice>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Standard, zero-rated, exempt and out of scope</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Most goods and services in South Africa are taxed at the standard VAT rate. Some are zero-rated (taxed at 0%,
              but still VAT transactions), some are exempt (not subject to VAT at all), and some fall outside the scope of
              VAT entirely. Getting this classification right on every line is what makes the rest of VAT accounting
              correct.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Output tax and input tax</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Output tax is the VAT you charge on what you sell. Input tax is the VAT you can claim back on what you buy for
              your business. The difference between the two, over a tax period, is what you owe SARS — or what SARS owes
              you.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">The VAT201 return</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A VAT201 is the return vendors submit to SARS each tax period, summarising output and input tax. Vertex
              codes every invoice and bill by tax treatment as you capture it, and builds a VAT201 report from those
              posted transactions — ready for you to review and submit through SARS eFiling yourself. Vertex does not
              submit returns to SARS on your behalf.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">Where Vertex fits in</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Because every transaction is coded once, at the point you capture it, your VAT position builds up
              continuously instead of being reconstructed at month end — see the{' '}
              <Link to="/product/tax" className="font-medium text-brand hover:underline">
                VAT and tax
              </Link>{' '}
              product page for the full detail.
            </p>
          </div>
        </div>
      </section>

      <MarketingCtaBand title="See VAT tracked in real time" body="Explore how transactions build up into a VAT201 in the live demo." />
    </MarketingPageShell>
  );
}
