import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/shadcn/accordion';
import { faqs } from '../content';
import { SectionHeading } from './SectionHeading';

/**
 * Ported from accounting-v0-frontend/components/landing/faq.tsx.
 * Content-integrity pass: removed the "our team in Johannesburg" claim
 * (unverifiable support-team claim, and the company is Cape Town-based,
 * not Johannesburg — see SiteFooter.tsx). Answer text itself lives in
 * content.ts's faqs array, audited there.
 */
export function Faq() {
  return (
    <section id="faq" className="border-y border-border/60 bg-card/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-16 md:flex-row md:gap-16 md:py-24">
        <div className="md:w-[36%]">
          <SectionHeading
            align="left"
            kicker="Questions"
            title="The things people ask before switching"
            description="Still unsure? Get in touch and we'll walk through your books with you before you commit."
          />
        </div>

        <div className="flex-1">
          <Accordion defaultValue={['faq-0']} className="gap-0">
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.q} value={`faq-${index}`} className="border-border/70">
                <AccordionTrigger className="py-5 text-base font-medium">{faq.q}</AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
