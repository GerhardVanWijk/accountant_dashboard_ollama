import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/shadcn/accordion';
import { faqs } from '../content';
import { SectionHeading } from './SectionHeading';

/** Ported verbatim from accounting-v0-frontend/components/landing/faq.tsx. */
export function Faq() {
  return (
    <section id="faq" className="border-y border-border/60 bg-card/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-16 md:flex-row md:gap-16 md:py-24">
        <div className="md:w-[36%]">
          <SectionHeading
            align="left"
            kicker="Questions"
            title="The things people ask before switching"
            description="Still unsure? Our team in Johannesburg will walk through your books with you before you commit."
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
