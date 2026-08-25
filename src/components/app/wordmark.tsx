import { cn } from '@/lib/utils';

/**
 * Ported from accounting-v0-frontend/components/landing/wordmark.tsx.
 * v0's brand name ("Vertex") is inlined here rather than porting the full
 * lib/landing-content.ts (marketing copy/taglines/CTAs) just for one
 * string — that file is out of scope for the M0 shell port.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-[10px] bg-brand text-[15px] font-semibold tracking-tight text-brand-foreground"
      >
        V
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Vertex
        </span>
        <span className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Accounting
        </span>
      </span>
    </span>
  );
}
