import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { BanknoteIcon, BookOpenIcon, FileTextIcon, PercentIcon, Rocket, Search, TrendingUpIcon } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/shadcn/accordion';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { Input } from '@/components/ui/shadcn/input';
import { faqs } from '@/features/marketing/content';

const categories = [
  { title: 'Getting started', description: 'Set up your company file, chart of accounts and opening balances.', icon: Rocket, href: '/companies' },
  { title: 'Invoices and payments', description: 'Raise invoices, record payments and manage credit notes.', icon: FileTextIcon, href: '/sales/invoices' },
  { title: 'Banking and reconciliation', description: 'Connect bank accounts and reconcile transactions each month.', icon: BanknoteIcon, href: '/banking/reconciliation' },
  { title: 'VAT and tax', description: 'Understand VAT reporting and provisional tax periods.', icon: PercentIcon, href: '/tax/vat-return' },
  { title: 'Reports', description: 'Income statements, balance sheets and management reports.', icon: TrendingUpIcon, href: '/reports' },
  { title: 'General ledger', description: 'Chart of accounts, journal entries and the trial balance.', icon: BookOpenIcon, href: '/accounting/ledger' },
];

/**
 * Help Centre — route `/help`. Static content only: category links point
 * at this app's real routes, and the FAQ list reuses the same content
 * already approved for the marketing site (`src/features/marketing/content.ts`
 * — M6), not a duplicate copy. No live chat, ticketing, AI support or
 * knowledge-base search — none of those exist, so v0's fake "Start live
 * chat" button and its contact-support card (which has no real support
 * address anywhere in this app) are not ported (M10). Re-skinned onto v0's
 * PageHeader/SectionCard/Accordion (M10).
 */
export function HelpPage() {
  const [term, setTerm] = useState('');

  const visibleFaqs = useMemo(() => {
    if (!term.trim()) return faqs;
    const needle = term.trim().toLowerCase();
    return faqs.filter((item) => item.q.toLowerCase().includes(needle) || item.a.toLowerCase().includes(needle));
  }, [term]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Help centre" description="Guides and answers for running your books." />

      <SectionCard>
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search the help centre — try “VAT” or “reconciliation”" aria-label="Search help articles" />
      </SectionCard>

      <section aria-label="Browse by topic" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <Link key={category.title} to={category.href} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 no-underline transition-colors hover:border-primary/40 hover:bg-primary/5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <category.icon className="size-4.5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">{category.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{category.description}</span>
            </div>
          </Link>
        ))}
      </section>

      <SectionCard title="Frequently asked questions" description="Common questions about running your books here.">
        {visibleFaqs.length === 0 ? (
          <Empty className="py-8">
            <Search className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <EmptyTitle>No matching articles</EmptyTitle>
            <EmptyDescription>Try a different search term.</EmptyDescription>
          </Empty>
        ) : (
          <Accordion>
            {visibleFaqs.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>
                  <p className="leading-relaxed text-muted-foreground">{item.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </SectionCard>
    </div>
  );
}
