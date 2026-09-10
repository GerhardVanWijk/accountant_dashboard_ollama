"use client"

/**
 * V0_VISUAL_FIDELITY.md: TooltipContent's Popup used Tailwind v4's
 * round-paren CSS-var shorthand (`origin-(--transform-origin)`) to consume
 * Base UI's positioner-computed animation origin. Tailwind v3 silently
 * drops that syntax (no CSS generated), so the open/close scale animation
 * always used the default transform-origin regardless of which side the
 * tooltip actually opened on -- visible on the sidebar's collapsed-icon
 * item tooltips. Rewritten to the v3-native square-bracket form.
 */
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

/**
 * `variant="brand"` — a deep Vertex-green tooltip for the icon-led KPI tiles
 * and record tabs, where an icon now carries meaning that used to be spelled
 * out in a visible label. It has to read as deliberate branded chrome (strong
 * contrast, near-white text), not a pale status wash, so the hover text stays
 * legible over any surface. `default` keeps the neutral high-contrast style.
 */
function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  variant = "default",
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & { variant?: "default" | "brand" }) {
  const brand = variant === "brand"
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 w-fit max-w-xs origin-[var(--transform-origin)] rounded-md px-3 py-1.5 text-xs has-[[data-slot=kbd]]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 [&_[data-slot=kbd]]:relative [&_[data-slot=kbd]]:isolate [&_[data-slot=kbd]]:z-50 [&_[data-slot=kbd]]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
            brand
              ? "bg-brand-deep text-brand-deep-foreground shadow-md"
              : "inline-flex items-center gap-1.5 bg-foreground text-background",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow
            className={cn(
              "z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] data-[side=bottom]:top-1 data-[side=inline-end]:!top-1/2 data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:!top-1/2 data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:!top-1/2 data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:!top-1/2 data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5",
              brand ? "bg-brand-deep fill-brand-deep" : "bg-foreground fill-foreground"
            )}
          />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
