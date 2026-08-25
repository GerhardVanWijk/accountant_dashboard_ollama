import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Real bug found and fixed (M7, docs/SUPABASE_MIGRATION_GUIDE.md's sibling
 * UI-port initiative): this component was a plain function, not wrapped in
 * `React.forwardRef` — React silently drops any `ref` passed to a
 * non-forwardRef function component (with a console warning, "Function
 * components cannot be given refs"). react-hook-form's `register()` relies
 * on that `ref` to attach the field internally; without it, `register()`'s
 * `onChange` has no field to update, so the form silently treats every
 * keystroke as if the field were still empty ("Required" on submit no
 * matter what was typed). This is a shared primitive used by every
 * react-hook-form form across the app since M0 — the fix is a genuine
 * shared-component compatibility fix, not new business logic.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <InputPrimitive
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
