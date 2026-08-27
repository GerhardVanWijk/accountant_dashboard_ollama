import { Building2Icon, FileTextIcon, PercentIcon, ScaleIcon, TrendingUpIcon } from 'lucide-react';

import { ProductPageTemplate } from '../../components/ProductPageTemplate';

/** /product/tax — public website completion pass. Every capability below is verified against src/features/tax/. */
export function TaxPage() {
  return (
    <ProductPageTemplate
      kicker="VAT and tax"
      title="VAT, income tax and more — prepared for you, not filed for you"
      description="Vertex calculates what South African tax law requires and prepares your reports. You still file with SARS yourself."
      capabilities={[
        {
          icon: PercentIcon,
          title: 'VAT engine',
          body: 'Every line is coded as standard-rated, zero-rated, exempt or out of scope, with rate changes tracked over time.',
        },
        {
          icon: FileTextIcon,
          title: 'VAT201 report',
          body: 'A VAT201 report broken down by tax treatment, built continuously from your posted transactions — ready for your own eFiling submission.',
        },
        {
          icon: Building2Icon,
          title: 'Income tax computation',
          body: 'A company income tax computation reconciling accounting profit to taxable income, including small business corporation eligibility.',
        },
        {
          icon: TrendingUpIcon,
          title: 'Capital gains, dividends and provisional tax',
          body: 'Capital gains tax, dividends tax and provisional tax period calculations, alongside the income tax computation.',
        },
        {
          icon: ScaleIcon,
          title: 'Reconciled to your ledger',
          body: 'VAT and tax figures are checked against the actual general-ledger control accounts they should match, not calculated separately.',
        },
      ]}
      notIncluded={['Direct submission to SARS eFiling', 'Automated tax-return filing of any kind']}
      ctaTitle="See a real VAT201 built from posted transactions"
      ctaBody="Walk through the VAT and tax modules in the live demo."
    />
  );
}
