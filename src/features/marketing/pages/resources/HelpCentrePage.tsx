import { Link } from 'react-router-dom';
import { BanknoteIcon, FileTextIcon, PercentIcon, Rocket, TrendingUpIcon, UsersIcon } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/shadcn/accordion';
import { MarketingCtaBand } from '../../components/MarketingCtaBand';
import { MarketingPageShell } from '../../components/MarketingPageShell';
import { SectionHeading } from '../../components/SectionHeading';
import { brand, faqs } from '../../content';

/**
 * /resources/help — public website completion pass. The real, richer
 * help centre already exists at /help, but it lives inside the
 * authenticated app shell (src/features/help/pages/HelpPage.tsx) and is
 * unreachable by a signed-out visitor. This page is the public
 * equivalent: same audited faqs array from content.ts (not a second,
 * divergent copy), topic cards pointing at /login rather than a
 * protected route a visitor would just get redirected away from.
 */
const topics = [
  { title: 'Getting started', description: 'Company setup, chart of accounts and opening balances.', icon: Rocket },
  { title: 'Invoices and payments', description: 'Raise invoices, record receipts and manage credit notes.', icon: FileTextIcon },
  { title: 'Banking and reconciliation', description: 'Import statements and reconcile transactions each month.', icon: BanknoteIcon },
  { title: 'VAT and tax', description: 'How VAT is calculated and how a VAT201 report is prepared.', icon: PercentIcon },
  { title: 'Payroll', description: 'PAYE, UIF, SDL and EMP201/EMP501 reporting.', icon: UsersIcon },
  { title: 'Reports', description: 'Income statements, balance sheets and management reports.', icon: TrendingUpIcon },
] as const;

export function HelpCentrePage() {
  return (
    <MarketingPageShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <SectionHeading headingTag="h1" kicker="Resources" title="Help centre" description="Guides and answers for running your books in Vertex." />

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <Link
              key={topic.title}
              to={brand.signInHref}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card/40 p-6 no-underline transition-colors hover:border-brand/30 hover:bg-card/70"
            >
              <span className="flex size-10 items-center justify-center rounded-xl border border-brand/20 bg-brand-muted text-brand">
                <topic.icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="text-base font-medium tracking-tight">{topic.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{topic.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="faq" className="border-y border-border/60 bg-card/20">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-16 md:flex-row md:gap-16 md:py-24">
          <div className="md:w-[36%]">
            <SectionHeading align="left" kicker="Questions" title="Frequently asked questions" />
          </div>
          <div className="flex-1">
            <Accordion defaultValue={['help-faq-0']} className="gap-0">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.q} value={`help-faq-${index}`} className="border-border/70">
                  <AccordionTrigger className="py-5 text-base font-medium">{faq.q}</AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <MarketingCtaBand title="Still have a question?" body="Sign in to reach the full in-app help centre, or explore the live demo first." />
    </MarketingPageShell>
  );
}
