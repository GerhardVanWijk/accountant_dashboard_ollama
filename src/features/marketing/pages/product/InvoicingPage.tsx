import { FileTextIcon, HandCoinsIcon, LockIcon, ReceiptIcon, TrendingUpIcon, Undo2Icon } from 'lucide-react';

import { ProductPageTemplate } from '../../components/ProductPageTemplate';

/** /product/invoicing — public website completion pass. Every capability below is verified against src/features/sales/. */
export function InvoicingPage() {
  return (
    <ProductPageTemplate
      kicker="Invoicing"
      title="Invoices, quotes and credit notes built for South African rands"
      description="The full sales document lifecycle, from a quote to a paid tax invoice."
      capabilities={[
        {
          icon: FileTextIcon,
          title: 'Quotes to invoices',
          body: 'Build a quote, convert it to a sales order or straight to a tax invoice in one click, with the same line items carried through.',
        },
        {
          icon: ReceiptIcon,
          title: 'Tax invoices in ZAR',
          body: 'Line-item VAT calculated per the tax treatment you assign, with a running invoice total in rands.',
        },
        {
          icon: Undo2Icon,
          title: 'Credit notes',
          body: "Issue a credit note against a posted invoice to correct or reverse it — the accounting-safe way to adjust a posted document.",
        },
        {
          icon: HandCoinsIcon,
          title: 'Customer receipts',
          body: "Record a payment against one or more open invoices and see exactly what's still outstanding.",
        },
        {
          icon: LockIcon,
          title: 'Posted invoices are protected',
          body: "Once an invoice is posted, its line items and totals are locked — corrections happen through a credit note, not a silent edit.",
        },
        {
          icon: TrendingUpIcon,
          title: 'Aged receivables',
          body: 'See exactly which invoices are overdue and by how long, ranked by risk.',
        },
      ]}
      notIncluded={['Recurring/subscription billing', 'Automatic email payment reminders', 'Multi-currency invoicing (ZAR only)']}
      ctaTitle="See real invoices, quotes and credit notes in action"
      ctaBody="Explore the live demo to see the full sales workflow for yourself."
    />
  );
}
