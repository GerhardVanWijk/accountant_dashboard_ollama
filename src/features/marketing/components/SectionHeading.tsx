import { cn } from '@/lib/utils';

/**
 * Ported from accounting-v0-frontend/components/landing/section-heading.tsx.
 * `headingTag` added (public-website visual QA pass) — every homepage
 * usage is a section within a page that already has its own real `<h1>`
 * (Hero.tsx), so `h2` there is correct and stays the default. The new
 * standalone sub-pages (/product/*, /legal/*, etc.) have no separate
 * hero — SectionHeading is their only page-title element — so those
 * call sites pass `headingTag="h1"` to get a real, single h1 instead of
 * skipping straight to h2 with no h1 on the page at all. Same classes
 * either way; this only changes which tag renders.
 */
export function SectionHeading({
  kicker,
  title,
  description,
  align = 'center',
  headingTag = 'h2',
  className,
}: {
  kicker: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  headingTag?: 'h1' | 'h2';
  className?: string;
}) {
  const Heading = headingTag;
  return (
    <div className={cn('flex flex-col gap-4', align === 'center' ? 'mx-auto max-w-2xl items-center text-center' : 'items-start', className)}>
      <span className="text-xs font-medium tracking-[0.16em] text-brand uppercase">{kicker}</span>
      <Heading className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{title}</Heading>
      {description ? <p className="text-base leading-relaxed text-pretty text-muted-foreground">{description}</p> : null}
    </div>
  );
}
