import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** Base panel surface used for cards, stat tiles, and content sections. */
export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-panel p-lg shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
