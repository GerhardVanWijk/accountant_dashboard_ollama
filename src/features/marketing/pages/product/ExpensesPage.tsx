import { ClipboardListIcon, FileTextIcon, LandmarkIcon, TrendingUpIcon } from 'lucide-react';

import { ProductPageTemplate } from '../../components/ProductPageTemplate';

/** /product/expenses — public website completion pass. Every capability below is verified against src/features/purchases/. */
export function ExpensesPage() {
  return (
    <ProductPageTemplate
      kicker="Expenses"
      title="Supplier bills, payments and expense coding"
      description="Track what your business owes and pay it, with every expense coded to the right account and VAT treatment."
      capabilities={[
        {
          icon: FileTextIcon,
          title: 'Supplier bills',
          body: 'Capture a supplier bill with line-item detail, VAT treatment and, where relevant, inventory or fixed-asset capitalisation.',
        },
        {
          icon: LandmarkIcon,
          title: 'Supplier payments',
          body: "Record a payment against one or more open bills and track what's still owed to each supplier.",
        },
        {
          icon: ClipboardListIcon,
          title: 'Purchase orders',
          body: 'Raise a purchase order, receive stock against it, and convert it straight to a bill without re-typing line items.',
        },
        {
          icon: TrendingUpIcon,
          title: 'Aged payables',
          body: 'See what you owe and to whom, ranked by how overdue it is.',
        },
        {
          icon: LandmarkIcon,
          title: 'Coded from your bank too',
          body: 'Bank transactions can be allocated straight to the right expense account and VAT code during reconciliation.',
        },
      ]}
      notIncluded={['Snap-a-receipt / OCR expense capture from your phone', 'Automatic supplier data extraction']}
      ctaTitle="See real supplier bills and payments"
      ctaBody="Explore the purchases workflow in the live demo."
    />
  );
}
