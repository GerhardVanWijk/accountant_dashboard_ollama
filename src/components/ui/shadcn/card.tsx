import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Adapted from accounting-v0-frontend/components/ui/card.tsx. v0's
 * original used Tailwind v4-only CSS-function utility syntax for a
 * custom card-spacing property — this project runs Tailwind v3
 * (tailwind.config.js), which doesn't parse that syntax and broke the
 * production build (lightningcss choked on the v4 spacing function used
 * as a raw CSS value). Re-expressed with plain v3 utilities at the same
 * computed values (spacing-4 = 1rem, spacing-3 = 0.75rem) — same visual
 * result, no custom property indirection needed since nothing else
 * reads that property.
 *
 * NOTE: do not paste the literal v4 syntax back into this comment —
 * Tailwind's content scanner is a plain text regex match, not an AST
 * parser, so it tokenizes bracketed class-like strings even inside
 * comments and will regenerate the same broken CSS.
 *
 * Phase 2 audit: the M2-era fix above only addressed the build-breaking
 * `--spacing()` syntax. This file still had several more v4-only variant
 * shorthands the v3 JIT scanner silently drops (no error, no CSS) —
 * `has-data-[...]:` (compound has+data shorthand), `*:[selector]:` two-deep
 * child-variant stacking, and `[.classname]:` (bare dot-selector, no `&`).
 * Rewritten to v3-native bracket/arbitrary-selector forms; same computed CSS.
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-[[data-slot=card-footer]]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-[[data-slot=card-footer]]:pb-0 [&>img:first-child]:rounded-t-xl [&>img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 has-[[data-slot=card-action]]:grid-cols-[1fr_auto] has-[[data-slot=card-description]]:grid-rows-[auto_auto] [&.border-b]:pb-4 group-data-[size=sm]/card:px-3 group-data-[size=sm]/card:[&.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
