import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Ported from accounting-v0-frontend/components/ui/accordion.tsx, with one
 * fix: the original's AccordionContent inner wrapper used Tailwind v4's
 * arbitrary-CSS-variable syntax (`h-(--accordion-panel-height)`) — this
 * project runs Tailwind v3, and that exact syntax is what broke
 * card.tsx's build during M2 (lightningcss chokes on the v4-only
 * `--spacing()`/`(--var)` function syntax). Replaced with a plain
 * max-height transition driven by the same open/closed data-state Base UI
 * already exposes, rather than reading a CSS custom property v3 has no
 * equivalent syntax for.
 */
function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn('flex w-full flex-col', className)} {...props} />;
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn('not-last:border-b', className)} {...props} />;
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className="ml-auto size-4 shrink-0 text-muted-foreground group-aria-expanded/accordion-trigger:hidden"
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          className="ml-auto hidden size-4 shrink-0 text-muted-foreground group-aria-expanded/accordion-trigger:inline"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm transition-[max-height] duration-300 ease-in-out data-closed:max-h-0 data-open:max-h-96"
      {...props}
    >
      <div className={cn('pt-0 pb-2.5', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
