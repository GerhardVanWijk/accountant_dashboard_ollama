import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Styled native `<select>` — the shared replacement for the ad-hoc
 * `const selectClassName = 'h-8 w-full rounded-lg border border-input
 * bg-transparent ...'` string that had been copy-pasted into ~34 forms
 * (docs/CURRENT_TASKS.md #1).
 *
 * Matches `Input`'s trigger styling exactly so a form's text fields and its
 * dropdowns read as one control family. The open option list's colours are
 * handled globally in src/styles/globals.css (`select option { ... }`) —
 * `<option>` can't take className, so that lives in CSS, not here.
 *
 * forwardRef for the same reason as Input: react-hook-form's `register()`
 * attaches via `ref`; a plain function component silently drops it and the
 * field never updates.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<'select'>
>(({ className, ...props }, ref) => {
  return (
    <select
      ref={ref}
      data-slot="native-select"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50',
        className,
      )}
      {...props}
    />
  );
});
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
