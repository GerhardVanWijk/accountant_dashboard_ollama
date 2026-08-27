import { BookOpenIcon, LandmarkIcon, ScaleIcon, TrendingUpIcon, UsersIcon } from 'lucide-react';

import { ProductPageTemplate } from '../../components/ProductPageTemplate';

/** /product/reporting — public website completion pass. Every capability below is verified against src/features/reports/ and src/features/accounting/. */
export function ReportingPage() {
  return (
    <ProductPageTemplate
      kicker="Reporting"
      title="Real financial statements, built from your real ledger"
      description="Every figure traces back to a posted transaction — nothing here is a separate, disconnected calculation."
      capabilities={[
        {
          icon: TrendingUpIcon,
          title: 'Income statement',
          body: 'A classified profit-and-loss, ending in net profit after tax, built from your posted revenue and expense accounts.',
        },
        {
          icon: ScaleIcon,
          title: 'Balance sheet',
          body: 'A balance sheet that reconciles — assets equal liabilities plus equity, checked, not assumed.',
        },
        {
          icon: LandmarkIcon,
          title: 'Cash flow statement',
          body: 'An indirect-method cash flow statement reconciled back to your actual cash movement.',
        },
        {
          icon: BookOpenIcon,
          title: 'Trial balance and general ledger',
          body: 'A live trial balance and a full general ledger, down to every posted journal line.',
        },
        {
          icon: UsersIcon,
          title: 'Aged receivables and payables',
          body: 'Customer and supplier aging reports ranked by how overdue each balance is.',
        },
      ]}
      notIncluded={['A drag-and-drop custom report builder', 'Consolidated multi-entity reporting']}
      ctaTitle="See real reports, not a mockup"
      ctaBody="Explore the reporting suite in the live demo."
    />
  );
}
