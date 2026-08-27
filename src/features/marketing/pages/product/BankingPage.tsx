import { FileUpIcon, HistoryIcon, LandmarkIcon, ScaleIcon, SplitIcon } from 'lucide-react';

import { ProductPageTemplate } from '../../components/ProductPageTemplate';

/** /product/banking — public website completion pass. Every capability below is verified against src/features/banking/ (statementParsers.ts, matching.ts). */
export function BankingPage() {
  return (
    <ProductPageTemplate
      kicker="Banking"
      title="Import, match and reconcile — without live bank feeds"
      description="Vertex works from the bank statements you already have, not a fragile live connection."
      capabilities={[
        {
          icon: FileUpIcon,
          title: 'Statement import',
          body: 'Import a statement in CSV, OFX/QFX, QIF or SWIFT MT940 format from any bank that can export one.',
        },
        {
          icon: LandmarkIcon,
          title: 'Smart match suggestions',
          body: "Every imported line is scored against your existing transactions by date, amount and description, so you only review what couldn't be matched confidently.",
        },
        {
          icon: SplitIcon,
          title: 'Split allocations',
          body: 'Allocate one bank line across multiple accounts and VAT codes, or record a transfer between two of your own accounts.',
        },
        {
          icon: ScaleIcon,
          title: 'Zero-variance reconciliation',
          body: 'A reconciliation only finalises when your bank balance and your books agree exactly, and the finished record is permanent.',
        },
        {
          icon: HistoryIcon,
          title: 'Full reconciliation history',
          body: 'Every finalised reconciliation is kept as an immutable record you can review later.',
        },
      ]}
      notIncluded={['Live/direct bank feed connections to any bank', 'Automatic categorisation without your review']}
      ctaTitle="Try a real bank reconciliation"
      ctaBody="See how statement import and matching work together in the live demo."
    />
  );
}
