import { Avatar, AvatarFallback } from '@/components/ui/shadcn/avatar';
import { cn } from '@/lib/utils';
import { testimonials } from '../content';
import { SectionHeading } from './SectionHeading';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
}

/** Ported verbatim from accounting-v0-frontend/components/landing/testimonials.tsx. */
export function Testimonials() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
      <SectionHeading kicker="From the people using it" title="Finance teams that stopped emailing backups around" />

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {testimonials.map((item) => (
          <figure key={item.name} className={cn('flex flex-col justify-between gap-6 rounded-2xl border border-border p-6', item.featured ? 'bg-card/70 lg:col-span-2 lg:p-8' : 'bg-card/30')}>
            <blockquote className={cn('leading-relaxed text-pretty', item.featured ? 'text-lg md:text-xl' : 'text-sm text-muted-foreground')}>{`"${item.quote}"`}</blockquote>
            <figcaption className="flex items-center gap-3">
              <Avatar className="size-9">
                <AvatarFallback className="bg-brand-muted text-xs font-medium text-brand">{initials(item.name)}</AvatarFallback>
              </Avatar>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.role}, {item.company}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
