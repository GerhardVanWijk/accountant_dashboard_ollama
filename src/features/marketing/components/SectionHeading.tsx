import { cn } from '@/lib/utils';

/** Ported verbatim from accounting-v0-frontend/components/landing/section-heading.tsx. */
export function SectionHeading({
  kicker,
  title,
  description,
  align = 'center',
  className,
}: {
  kicker: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4', align === 'center' ? 'mx-auto max-w-2xl items-center text-center' : 'items-start', className)}>
      <span className="text-xs font-medium tracking-[0.16em] text-brand uppercase">{kicker}</span>
      <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
      {description ? <p className="text-base leading-relaxed text-pretty text-muted-foreground">{description}</p> : null}
    </div>
  );
}
