"use client"

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronsUpDownIcon, SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Vertex searchable combobox primitive — the themed wrapper around
 * `@base-ui/react/combobox`, mirroring how `select.tsx` wraps
 * `@base-ui/react/select`.
 *
 * Why base-ui Combobox and not a hand-rolled cmdk popover: base-ui's
 * combobox owns the ARIA wiring, keyboard model (ArrowUp/Down/Home/End/
 * Enter/Escape), type-ahead filtering and — crucially for the transaction
 * line-item forms — anchor positioning with collision handling. The popup
 * is told to PREFER DOWN and only ever *shift* to fit; it never flips
 * upward over the fields above it (docs brief Part B), and its height is
 * capped to `--available-height` with the list scrolling inside.
 *
 * The open list uses `bg-popover` / `--brand-muted` for the selected row
 * and `bg-accent` for the keyboard-highlighted row — never the browser's
 * native bright-blue `<option>` highlight.
 *
 * Consumers should reach for the opinionated wrappers in
 * `src/components/app/combobox/` (`SearchableSelect`, `ProductCombobox`,
 * `EntityCombobox`) rather than composing these parts by hand.
 */

const Combobox = ComboboxPrimitive.Root
const ComboboxValue = ComboboxPrimitive.Value
const ComboboxGroup = ComboboxPrimitive.Group
const ComboboxCollection = ComboboxPrimitive.Collection
const ComboboxRow = ComboboxPrimitive.Row

function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 [&>span]:min-w-0 [&>span]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {children}
      </span>
      <ComboboxPrimitive.Icon
        render={
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        }
      />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      aria-label="Clear selection"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      <XIcon className="size-3.5" />
    </ComboboxPrimitive.Clear>
  )
}

/**
 * Popup + positioner in one part. Placement defaults to `bottom` and the
 * collision strategy only *shifts* the popup to keep it on-screen — it is
 * never flipped up over the form (`fallbackAxisSide: 'none'`).
 */
function ComboboxContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  collisionPadding = 8,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "collisionPadding"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        className="isolate z-50 max-w-[min(24rem,var(--available-width,24rem))]"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "flex max-h-[min(20rem,var(--available-height))] w-[var(--anchor-width)] min-w-[12rem] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-brand-outline duration-100 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

/** The search field, pinned at the top of the popup (does not scroll with the list). */
function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div
      data-slot="combobox-input-wrapper"
      className="flex shrink-0 items-center gap-2 border-b border-border px-2.5"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        className={cn(
          "h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-py-1 p-1",
        className
      )}
      {...props}
    />
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "px-3 py-6 text-center text-sm text-muted-foreground empty:hidden",
        className
      )}
      {...props}
    />
  )
}

function ComboboxStatus({ className, ...props }: ComboboxPrimitive.Status.Props) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      className={cn(
        "px-3 py-6 text-center text-sm text-muted-foreground empty:hidden",
        className
      )}
      {...props}
    />
  )
}

function ComboboxGroupLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn(
        "px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}

/**
 * A row. `data-selected` (the chosen value) tints with `--brand-muted`;
 * `data-highlighted` (keyboard / hover cursor) uses `--accent`. No native
 * blue anywhere.
 */
function ComboboxItem({
  className,
  children,
  showIndicator = true,
  ...props
}: ComboboxPrimitive.Item.Props & { showIndicator?: boolean }) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:bg-brand-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      {showIndicator && (
        <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
          <CheckIcon className="size-4 text-brand" />
        </ComboboxPrimitive.ItemIndicator>
      )}
    </ComboboxPrimitive.Item>
  )
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  Combobox,
  ComboboxValue,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxCollection,
  ComboboxRow,
  ComboboxTrigger,
  ComboboxClear,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxEmpty,
  ComboboxStatus,
  ComboboxItem,
  ComboboxSeparator,
}
