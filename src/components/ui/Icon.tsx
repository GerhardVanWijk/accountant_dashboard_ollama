import type { LucideProps } from 'lucide-react';
import { Icons, type IconName } from '@/config/icons';

export interface IconProps extends Omit<LucideProps, 'ref'> {
  /** Semantic key from the icon registry (src/config/icons.ts). */
  name: IconName;
}

/**
 * Thin wrapper around the icon registry. Per docs/DO_NOT_BREAK.md "Icons",
 * this is the only component (besides src/config/icons.ts itself) allowed
 * to import from `lucide-react` — every other file renders `<Icon name="..." />`.
 *
 * Icons are decorative by default (aria-hidden) since they're paired with
 * a visible text label or an aria-label on the interactive element that
 * hosts them; pass aria-hidden={false} for the rare case an icon carries
 * meaning on its own.
 */
export function Icon({ name, ...props }: IconProps) {
  const Component = Icons[name];
  return <Component aria-hidden={props['aria-hidden'] ?? true} {...props} />;
}
